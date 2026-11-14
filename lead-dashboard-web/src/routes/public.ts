import { logActivity } from "../services/activities";
import { DEFAULT_OPPORTUNITY_ID, getOpportunityOrDefault, isChannelId, opportunityIdOf, type ChannelId } from "../../../shared/opportunities";
import { Hono, type Context } from "hono";
import type { AppEnv, SyncBody } from "../types";
import { bearerMatches, ensureAuthSchema, generateRandomHex, getSessionUser, requireUser } from "../auth";
import { assignRoundRobin } from "../services/assign";
import { sendHotLeadAlert } from "../services/notify";
import { esc } from "../views/layout";
import { copyLeadMedia, getOrCopyMedia, mediaSources, rewriteMediaUrls } from "../services/leadMedia";
import { renderAgencyLandingHtml } from "../views/landing";

export const publicRoutes = new Hono<AppEnv>();

/** GET /landing — Aperçu direct de la Landing Page publique dissociée de l'agence. */
publicRoutes.get("/landing", (c) => {
  const origin = (c.env.PUBLIC_APP_URL ?? new URL(c.req.url).origin).replace(/\/+$/, "");
  return c.html(renderAgencyLandingHtml(origin));
});

const BOT_UA = /bot|crawl|spider|preview|whatsapp|telegram|facebookexternalhit|slack|discord|curl|wget/i;
const ALERT_COOLDOWN_MS = 30 * 60 * 1000;
export const DEFAULT_DEMO_TTL_DAYS = 5; // Expiration auto 5 jours après 1re vue ou appel

export function computeDemoExpiryIso(days = DEFAULT_DEMO_TTL_DAYS, fromDate = new Date()): string {
  return new Date(fromDate.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function isDemoExpiredOrRevoked(row: {
  demo_revoked?: number | null;
  demo_expires_at?: string | null;
}, nowMs = Date.now()): boolean {
  if (row.demo_revoked === 1) return true;
  if (row.demo_expires_at) {
    const exp = Date.parse(row.demo_expires_at);
    if (!Number.isNaN(exp) && exp <= nowMs) return true;
  }
  return false;
}

function renderExpiredDemoHtml(companyName: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Aperçu Expiré — ${esc(companyName)}</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6 font-sans antialiased">
  <div class="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-7 text-center space-y-4 shadow-2xl">
    <div class="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto text-xl font-bold">
      ⏳
    </div>
    <h1 class="text-lg font-bold tracking-tight text-white">Cet aperçu temporaire a expiré</h1>
    <p class="text-xs text-zinc-400 leading-relaxed">
      La démonstration ou l'audit préparé pour <strong class="text-zinc-200">${esc(companyName)}</strong> n'est plus accessible publiquement (validité temporaire de ${DEFAULT_DEMO_TTL_DAYS} jours dépassée ou accès clôturé).
    </p>
    <div class="p-3.5 rounded-xl bg-zinc-950/80 border border-zinc-800 text-xs text-zinc-300">
      Vous souhaitez que nous réactivions votre accès pour 5 jours supplémentaires ? Répondez simplement à notre message ou recontactez votre interlocuteur.
    </div>
  </div>
</body>
</html>`;
}

/** POST /api/sync — réception sécurisée depuis le Mac. Idempotent (upsert par id), sans écraser le statut commercial existant. */
publicRoutes.post("/api/sync", async (c) => {
  if (!bearerMatches(c.req.header("Authorization"), c.env.SYNC_SECRET_TOKEN)) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const body = await c.req.json<SyncBody>().catch(() => null);
  if (!body?.id || !/^[a-f0-9]{8,64}$/.test(body.id) || !body.company_name) {
    return c.json({ error: "invalid_payload" }, 400);
  }
  await ensureAuthSchema(c.env.DB);
  const primaryChannel = isChannelId(body.primary_channel) ? body.primary_channel : null;
  const contacts = sanitizeSyncContacts(body.contacts);

  // Statuts acceptés du CLI : non qualifié, en attente de génération, ou démo prête (le reste du cycle est commercial).
  const isUnqualified = body.status === "unqualified";
  const isPending = !isUnqualified && (body.status === "pending_generation" || (!body.demo_html && !body.battlecard_data));
  const targetStatus = isUnqualified ? "unqualified" : isPending ? "pending_generation" : "demo_ready";
  const siren = extractSiren(body.audit_data);
  // Date du scan envoyée par le CLI : date de création d'un nouveau lead (jamais modifiée ensuite).
  const scannedAt = parseScanDate(body.scanned_at) ?? new Date().toISOString();
  const existed = await c.env.DB.prepare("SELECT 1 AS x FROM leads WHERE id = ?").bind(body.id).first();

  const flyerUrl = body.flyer_pdf_base64 ? `/api/leads/${body.id}/flyer` : null;
  const oppType = opportunityIdOf(body.opportunity_type);
  // Le statut commercial n'est jamais écrasé par une re-synchronisation (re-scan, prep, sync-queue, regen) :
  // seul un lead encore en `pending_generation` peut avancer vers le statut envoyé. De même, une re-préparation
  // (payload `pending_generation`, audit partiel) ne remplace pas l'audit complet d'un lead déjà généré.
  const stmts: D1PreparedStatement[] = [
    c.env.DB.prepare(
      `INSERT INTO leads (id, company_name, activity, city, phone, email, website_url, google_rating,
         google_reviews_count, audit_data, demo_html, flyer_pdf_url, flyer_pdf_base64, battlecard_data, created_at, opportunity_type, status,
         primary_channel, siren, site_demo_html)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20)
       ON CONFLICT(id) DO UPDATE SET
         company_name = excluded.company_name, activity = excluded.activity, city = excluded.city,
         phone = COALESCE(excluded.phone, leads.phone), email = COALESCE(excluded.email, leads.email),
         website_url = excluded.website_url, google_rating = excluded.google_rating,
         google_reviews_count = excluded.google_reviews_count,
         audit_data = CASE WHEN excluded.status IN ('pending_generation','unqualified')
                                AND leads.status NOT IN ('pending_generation','unqualified')
                           THEN leads.audit_data ELSE excluded.audit_data END,
         demo_html = COALESCE(excluded.demo_html, leads.demo_html), flyer_pdf_url = COALESCE(excluded.flyer_pdf_url, leads.flyer_pdf_url),
         flyer_pdf_base64 = COALESCE(excluded.flyer_pdf_base64, leads.flyer_pdf_base64), battlecard_data = COALESCE(excluded.battlecard_data, leads.battlecard_data),
         opportunity_type = CASE WHEN excluded.status = 'unqualified' AND leads.status != 'unqualified'
                                 THEN leads.opportunity_type ELSE COALESCE(excluded.opportunity_type, leads.opportunity_type) END,
         primary_channel = CASE WHEN excluded.status = 'unqualified' AND leads.status != 'unqualified'
                                THEN leads.primary_channel ELSE COALESCE(excluded.primary_channel, leads.primary_channel) END,
         siren = COALESCE(excluded.siren, leads.siren),
         site_demo_html = COALESCE(excluded.site_demo_html, leads.site_demo_html),
         status = CASE
           WHEN leads.status = 'pending_generation' THEN excluded.status
           WHEN leads.status = 'unqualified' AND excluded.status != 'unqualified' THEN excluded.status
           ELSE leads.status END
       RETURNING status`,
    ).bind(
      body.id,
      body.company_name,
      body.activity ?? null,
      body.city ?? null,
      body.phone ?? null,
      body.email ?? null,
      body.website_url ?? null,
      body.google_rating ?? null,
      body.google_reviews_count ?? null,
      JSON.stringify(body.audit_data ?? {}),
      body.demo_html ?? null,
      flyerUrl,
      body.flyer_pdf_base64 ?? null,
      body.battlecard_data ? JSON.stringify(body.battlecard_data) : null,
      scannedAt,
      oppType,
      targetStatus,
      primaryChannel,
      siren,
      body.site_demo_html ?? null,
    ),
  ];
  if (contacts.length > 0) {
    // Un seul contact principal par lead : celui du dernier envoi.
    if (contacts.some((ct) => ct.is_primary)) {
      stmts.push(c.env.DB.prepare("UPDATE lead_contacts SET is_primary = 0 WHERE lead_id = ?").bind(body.id));
    }
    for (const ct of contacts) {
      stmts.push(
        c.env.DB.prepare(
          `INSERT INTO lead_contacts (lead_id, kind, value, source, confidence, meta, is_primary) VALUES (?,?,?,?,?,?,?)
           ON CONFLICT(lead_id, kind, value) DO UPDATE SET
             source = excluded.source, confidence = excluded.confidence, meta = excluded.meta,
             is_primary = MAX(excluded.is_primary, lead_contacts.is_primary)`,
        ).bind(body.id, ct.kind, ct.value, ct.source, ct.confidence, ct.meta, ct.is_primary ? 1 : 0),
      );
    }
  }
  for (const t of body.token_usage ?? []) {
    stmts.push(
      c.env.DB.prepare(
        "INSERT INTO token_usage (lead_id, task, model, input_tokens, output_tokens, thinking_tokens, requested_model) VALUES (?,?,?,?,?,?,?)",
      ).bind(
        body.id,
        t.task,
        t.model,
        t.inputTokens | 0,
        t.outputTokens | 0,
        t.thinkingTokens | 0,
        typeof t.requestedModel === "string" && t.requestedModel !== t.model ? t.requestedModel.slice(0, 120) : null,
      ),
    );
  }
  const results = await c.env.DB.batch(stmts);
  const finalStatus = (results[0]?.results?.[0] as { status?: string } | undefined)?.status ?? targetStatus;

  // Doublon probable : même SIREN qu'un autre lead (ex. deux fiches Maps d'une même entreprise). Signalé au closer.
  let duplicates: { id: string; company_name: string }[] = [];
  if (siren) {
    duplicates = (
      await c.env.DB.prepare("SELECT id, company_name FROM leads WHERE siren = ? AND id != ? AND status != 'unqualified' LIMIT 5")
        .bind(siren, body.id)
        .all<{ id: string; company_name: string }>()
    ).results;
    if (!existed && duplicates.length > 0 && finalStatus !== "unqualified") {
      await logActivity(c.env.DB, {
        leadId: body.id,
        userId: null,
        kind: "note",
        summary: `Même entreprise (SIREN ${siren}) que : ${duplicates.map((d) => d.company_name).join(", ")}`,
        content: { text: "Doublon probable : coordonner les appels avec le ou les leads cités.", duplicates },
      });
    }
  }

  if (!["pending_generation", "unqualified"].includes(finalStatus) && c.env.AUTO_ASSIGN === "true") {
    await assignRoundRobin(c.env.DB);
  }
  // Copie des photos et du logo du prospect dans R2, après la réponse (la démo les sert depuis le bucket).
  if (c.env.MEDIA && finalStatus !== "unqualified" && mediaSources(body.audit_data).length > 0) {
    const bucket = c.env.MEDIA;
    c.executionCtx.waitUntil(copyLeadMedia(bucket, body.id, body.audit_data).catch(() => 0));
  }
  return c.json({ ok: true, id: body.id, status: finalStatus, duplicates: duplicates.map((d) => d.id) });
});

/** Date de scan valide (ISO, ni future, ni de plus d'un an), sinon null. */
export function parseScanDate(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return null;
  const now = Date.now();
  if (t > now + 5 * 60_000 || t < now - 365 * 24 * 3600_000) return null;
  return new Date(t).toISOString();
}

/** SIREN relevé à l'inspection (audit_data.siren), normalisé sur 9 chiffres. */
export function extractSiren(audit: unknown): string | null {
  if (!audit || typeof audit !== "object") return null;
  const raw = (audit as Record<string, unknown>).siren;
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const digits = String(raw).replace(/\D/g, "");
  return digits.length === 9 ? digits : null;
}

const CONTACT_SOURCES = new Set(["maps", "site", "sirene", "inbound", "manual"]);

/** Contacts reçus du CLI : canaux connus, valeurs bornées, au plus 20 par lead. */
export function sanitizeSyncContacts(raw: unknown): Array<{
  kind: ChannelId;
  value: string;
  source: string;
  confidence: number | null;
  meta: string | null;
  is_primary: boolean;
}> {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw.slice(0, 20)) {
    if (!item || typeof item !== "object") continue;
    const ct = item as Record<string, unknown>;
    if (!isChannelId(ct.kind) || typeof ct.value !== "string") continue;
    const value = ct.value.trim().slice(0, 500);
    if (!value) continue;
    if (ct.kind === "contact_form" && !/^https?:\/\//i.test(value)) continue;
    const confidence = typeof ct.confidence === "number" && ct.confidence >= 0 && ct.confidence <= 1 ? ct.confidence : null;
    const meta = ct.meta && typeof ct.meta === "object" ? JSON.stringify(ct.meta).slice(0, 2000) : null;
    out.push({
      kind: ct.kind,
      value,
      source: typeof ct.source === "string" && CONTACT_SOURCES.has(ct.source) ? ct.source : "site",
      confidence,
      meta,
      is_primary: ct.is_primary === true,
    });
  }
  return out;
}

export function renderInteractiveDemoFloatingBar(opts: {
  leadId: string;
  companyName: string;
  demoExpiresAt?: string | null;
  opportunityType?: string | null;
  internalPreview?: boolean;
}): string {
  let expiryLabel = "Aperçu temporaire";
  if (opts.demoExpiresAt) {
    const expMs = Date.parse(opts.demoExpiresAt);
    if (!Number.isNaN(expMs)) {
      const daysLeft = Math.max(1, Math.ceil((expMs - Date.now()) / (24 * 60 * 60 * 1000)));
      expiryLabel = `Expire dans ${daysLeft}j`;
    }
  }
  const ctaLabel = getOpportunityOrDefault(opts.opportunityType).proof.interestCta;
  // Aperçu par un closer/admin connecté : pas de bouton d'intérêt, pour ne pas fausser le signal « lead chaud ».
  const ctaHtml = opts.internalPreview
    ? `<span style="background:rgba(251,191,36,0.15);color:#fde68a;border:1px solid rgba(251,191,36,0.4);border-radius:10px;padding:6px 10px;font-size:11px;font-weight:700;">👁️ Aperçu interne — vue non comptabilisée</span>`
    : `<button id="le-btn-like" type="button" onclick="(function(btn){btn.disabled=true;btn.textContent='✔ Intérêt transmis ! Nous revenons vers vous.';btn.style.background='#059669';fetch('/api/tracker/interest?leadId=${encodeURIComponent(opts.leadId)}',{method:'POST'}).catch(function(){});})(this)" style="background:#4f46e5;color:#fff;border:none;border-radius:10px;padding:7px 12px;font-size:12px;font-weight:700;cursor:pointer;transition:all .15s;">
      ${ctaLabel}
    </button>`;

  return `
<!-- LeadEngine Interactive Prospect Bar -->
<style>
  /* Mobile : en haut de l'écran, pour ne jamais recouvrir la barre d'appel fixée en bas de la démo. */
  @media (max-width: 640px) {
    #le-floating-bar { top: 8px !important; bottom: auto !important; left: 8px !important; right: 8px !important; max-width: none !important; }
    #le-floating-bar > div { padding: 8px 10px !important; font-size: 12px !important; }
  }
</style>
<div id="le-floating-bar" style="position:fixed;bottom:16px;right:16px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:calc(100vw - 32px);">
  <div style="background:rgba(9,9,11,0.94);backdrop-filter:blur(10px);color:#fff;border:1px solid rgba(255,255,255,0.14);border-radius:16px;padding:10px 14px;box-shadow:0 20px 25px -5px rgba(0,0,0,0.4);display:flex;flex-wrap:wrap;align-items:center;gap:10px;font-size:12px;">
    <div style="display:flex;align-items:center;gap:8px;">
      <span style="display:inline-block;width:8px;height:8px;border-radius:9999px;background:#10b981;"></span>
      <span style="font-weight:600;color:#e4e4e7;">Préparé pour <strong style="color:#fff;">${esc(opts.companyName)}</strong></span>
      <span style="background:rgba(255,255,255,0.1);color:#fde68a;padding:2px 7px;border-radius:6px;font-size:11px;font-weight:600;">⏳ ${esc(expiryLabel)}</span>
    </div>
    ${ctaHtml}
    <button type="button" onclick="document.getElementById('le-floating-bar').style.display='none'" title="Masquer ce bandeau" style="background:transparent;color:#a1a1aa;border:none;padding:4px 6px;font-size:14px;cursor:pointer;line-height:1;">✕</button>
  </div>
</div>`;
}

/**
 * Transforme le HTML d'une démo avant diffusion : logo extrait, photos R2, no-referrer, aperçu muet (closer connecté)
 * ou pixel d'ouverture. Partagée par `/demos/:id` et `/demos/:id/site`.
 */
export function prepareDemoHtml(
  html: string,
  opts: { id: string; auditData: string | null | undefined; mediaEnabled: boolean; internalPreview: boolean },
): string {
  const { id, auditData, mediaEnabled, internalPreview } = opts;
  let finalDemoHtml = html;

  // Récupération et injection du logo extrait si placeholder présent
  if (auditData && finalDemoHtml.includes("%%CLIENT_REAL_LOGO_URL%%")) {
    try {
      const parsedAudit = JSON.parse(auditData);
      if (parsedAudit.logoUrl) {
        finalDemoHtml = finalDemoHtml.replaceAll("%%CLIENT_REAL_LOGO_URL%%", parsedAudit.logoUrl);
      }
    } catch {
      // Ignorer si parsing audit échoue
    }
  }

  // Photos et logo du prospect servis depuis leur copie R2 (voir services/leadMedia.ts).
  if (mediaEnabled && auditData) {
    try {
      finalDemoHtml = rewriteMediaUrls(finalDemoHtml, id, mediaSources(JSON.parse(auditData)));
    } catch {
      // audit illisible : liens d'origine conservés
    }
  }

  // Empêche le blocage hotlinking des images et logos externes par l'hôte tiers
  if (!finalDemoHtml.includes('name="referrer"')) {
    finalDemoHtml = finalDemoHtml.replace(/<head[^>]*>/i, '$&\n<meta name="referrer" content="no-referrer">');
  }

  // Closer/admin connecté : la vue ne doit ni passer le lead en « chaud » ni déclencher d'alerte.
  // Le pixel peut viser une autre origine (remoteAppUrl) sans le cookie : on le neutralise aussi côté
  // navigateur en marquant la démo comme déjà vue (clé lue par injectTracker).
  if (internalPreview) {
    const muteTracker = `<script>try{sessionStorage.setItem(${JSON.stringify(`seen_${id}`)},"1")}catch(e){}</script>`;
    finalDemoHtml = /<head[^>]*>/i.test(finalDemoHtml)
      ? finalDemoHtml.replace(/<head[^>]*>/i, `$&\n${muteTracker}`)
      : `${muteTracker}\n${finalDemoHtml}`;
  }

  // Pixel d'ouverture : toutes les démos doivent en avoir un, y compris celles écrites en mode prep (Antigravity)
  // ou via MCP, qui ne passent pas par le générateur full_auto (audit 1.4). Jamais pour un aperçu interne.
  if (!internalPreview) finalDemoHtml = injectOpenTracker(finalDemoHtml, id);
  return finalDemoHtml;
}

/** Diffuse la démo stockée dans `column` (404 si vide, 410 si révoquée/expirée, sinon HTML préparé + barre d'intérêt). */
async function serveDemo(c: Context<AppEnv>, column: "demo_html" | "site_demo_html"): Promise<Response> {
  await ensureAuthSchema(c.env.DB);
  const id = c.req.param("id") ?? "";
  const row = await c.env.DB.prepare(
    `SELECT company_name, ${column} AS html, demo_revoked, demo_expires_at, opportunity_type, audit_data FROM leads WHERE id = ?`,
  )
    .bind(id)
    .first<{
      company_name: string;
      html: string | null;
      demo_revoked?: number | null;
      demo_expires_at?: string | null;
      opportunity_type?: string | null;
      audit_data?: string | null;
    }>();
  if (!row?.html) return c.text("Démo introuvable", 404);

  if (isDemoExpiredOrRevoked(row)) {
    return c.html(renderExpiredDemoHtml(row.company_name), 410, {
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    });
  }

  const internalPreview = (await getSessionUser(c)) !== null;
  const finalDemoHtml = prepareDemoHtml(row.html, {
    id,
    auditData: row.audit_data,
    mediaEnabled: Boolean(c.env.MEDIA),
    internalPreview,
  });

  const barHtml = renderInteractiveDemoFloatingBar({
    leadId: id,
    companyName: row.company_name,
    demoExpiresAt: row.demo_expires_at,
    opportunityType: row.opportunity_type,
    internalPreview,
  });

  const htmlWithBar = finalDemoHtml.includes("</body>")
    ? finalDemoHtml.replace("</body>", `${barHtml}\n</body>`)
    : `${finalDemoHtml}\n</main>\n${barHtml}\n</body>\n</html>`;

  return c.html(htmlWithBar, 200, {
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
  });
}

/** GET /demos/:id — rendu public de la démo HTML (vérifie la révocation, l'expiration auto et injecte le bandeau interactif). */
publicRoutes.get("/demos/:id", (c) => serveDemo(c, "demo_html"));

/** GET /demos/:id/site — démo de site complémentaire d'un bilan : même rendu, même suivi d'ouverture que la démo du lead. */
publicRoutes.get("/demos/:id/site", (c) => serveDemo(c, "site_demo_html"));

/**
 * GET /demos/:id/media/:key — photo ou logo du prospect copié dans R2 (copié au premier affichage s'il manque).
 * Ne sert que les images listées dans l'audit du lead, et ne compte pas comme une vue de la démo.
 */
publicRoutes.get("/demos/:id/media/:key", async (c) => {
  const id = c.req.param("id");
  const key = c.req.param("key");
  if (!/^[a-f0-9]{8,64}$/.test(id) || !/^(\d{1,2}|logo)$/.test(key)) return c.text("Introuvable", 404);
  const row = await c.env.DB.prepare("SELECT demo_revoked, demo_expires_at, audit_data FROM leads WHERE id = ?")
    .bind(id)
    .first<{ demo_revoked?: number | null; demo_expires_at?: string | null; audit_data?: string | null }>();
  if (!row) return c.text("Introuvable", 404);
  if (isDemoExpiredOrRevoked(row)) return c.text("Démo expirée", 410, { "Cache-Control": "no-store" });
  let audit: unknown = null;
  try {
    audit = row.audit_data ? JSON.parse(row.audit_data) : null;
  } catch {
    audit = null;
  }
  const source = mediaSources(audit).find((s) => s.key === key);
  if (!source) return c.text("Introuvable", 404);
  if (!c.env.MEDIA) return c.redirect(source.url, 302);
  const media = await getOrCopyMedia(c.env.MEDIA, id, source);
  if (!media) return c.redirect(source.url, 302);
  return new Response(media.body, {
    headers: {
      "Content-Type": media.contentType,
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex",
    },
  });
});

/** POST /api/tracker/interest?leadId=… — clic du prospect sur "Ce design me plaît" dans la démo. */
publicRoutes.post("/api/tracker/interest", async (c) => {
  await ensureAuthSchema(c.env.DB);
  const leadId = c.req.query("leadId") ?? "";
  if (!/^[a-f0-9]{8,64}$/.test(leadId)) return c.json({ error: "invalid_id" }, 400);
  if (await getSessionUser(c)) return c.json({ ok: true, ignored: "internal_viewer" });

  const lead = await c.env.DB.prepare("SELECT company_name, status, call_notes FROM leads WHERE id = ?")
    .bind(leadId)
    .first<{ company_name: string; status: string; call_notes: string | null }>();
  if (!lead) return c.json({ error: "not_found" }, 404);

  const now = new Date();
  const stamp = now.toISOString().slice(0, 16).replace("T", " ");
  const noteLine = `[${stamp}] 🔥 INTÉRÊT CLIENT DIRECT : Le prospect a cliqué sur « Ce design me plaît, on en discute » depuis sa démo !`;
  const updatedNotes = (lead.call_notes ? `${lead.call_notes}\n${noteLine}` : noteLine).slice(-4000);
  const autoExpiryIso = computeDemoExpiryIso(DEFAULT_DEMO_TTL_DAYS, now);

  await c.env.DB.prepare(
    `UPDATE leads
     SET status = CASE WHEN status IN ('won','lost') THEN status ELSE 'hot_lead' END,
         last_demo_viewed_at = ?1,
         demo_expires_at = COALESCE(demo_expires_at, ?2),
         call_notes = ?3
     WHERE id = ?4`,
  )
    .bind(now.toISOString(), autoExpiryIso, updatedNotes, leadId)
    .run();

  const origin = (c.env.PUBLIC_APP_URL ?? new URL(c.req.url).origin).replace(/\/+$/, "");
  c.executionCtx.waitUntil(
    sendHotLeadAlert(c.env, `🔥 ${lead.company_name} (A cliqué "Ce design me plaît !")`, `${origin}/`),
  );

  return c.json({ ok: true });
});

/**
 * Ajoute le pixel d'ouverture (même origine) si la démo n'en contient pas déjà un.
 * Une seule notification par session de navigation, comme le pixel du générateur (clé `seen_<id>`).
 */
export function injectOpenTracker(html: string, leadId: string): string {
  if (html.includes("/api/tracker/open")) return html;
  const key = JSON.stringify(`seen_${leadId}`);
  const url = JSON.stringify(`/api/tracker/open?leadId=${encodeURIComponent(leadId)}`);
  const tracker = `<script>(function(){try{var k=${key};if(sessionStorage.getItem(k))return;sessionStorage.setItem(k,"1");fetch(${url},{method:"GET",keepalive:true,cache:"no-store"}).catch(function(){});}catch(e){}})();</script>`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${tracker}\n</body>`) : `${html}\n${tracker}`;
}

/** GET /api/tracker/open?leadId=… — ping de la démo : lead chaud + armement expiration auto +5 jours + alerte. */
publicRoutes.get("/api/tracker/open", async (c) => {
  await ensureAuthSchema(c.env.DB);
  const leadId = c.req.query("leadId") ?? "";
  const pixel = new Response(null, { status: 204 });
  if (!/^[a-f0-9]{8,64}$/.test(leadId) || BOT_UA.test(c.req.header("User-Agent") ?? "")) return pixel;
  // Ouverture par un closer/admin connecté (lien « Démo » du Kanban, vérification avant appel) : ignorée.
  if (await getSessionUser(c)) return pixel;

  const lead = await c.env.DB.prepare(
    "SELECT company_name, status, last_demo_viewed_at, demo_revoked, demo_expires_at FROM leads WHERE id = ?",
  )
    .bind(leadId)
    .first<{
      company_name: string;
      status: string;
      last_demo_viewed_at: string | null;
      demo_revoked?: number | null;
      demo_expires_at?: string | null;
    }>();
  if (!lead || isDemoExpiredOrRevoked(lead)) return pixel;

  const now = new Date();
  const autoExpiryIso = computeDemoExpiryIso(DEFAULT_DEMO_TTL_DAYS, now);
  await c.env.DB.prepare(
    `UPDATE leads SET demo_viewed_count = demo_viewed_count + 1, last_demo_viewed_at = ?1,
       demo_expires_at = COALESCE(demo_expires_at, ?2),
       status = CASE WHEN status IN ('won','lost') THEN status ELSE 'hot_lead' END
     WHERE id = ?3`,
  )
    .bind(now.toISOString(), autoExpiryIso, leadId)
    .run();

  const last = lead.last_demo_viewed_at ? Date.parse(lead.last_demo_viewed_at) : 0;
  if (now.getTime() - last > ALERT_COOLDOWN_MS && lead.status !== "won" && lead.status !== "lost") {
    const origin = (c.env.PUBLIC_APP_URL ?? new URL(c.req.url).origin).replace(/\/+$/, "");
    c.executionCtx.waitUntil(sendHotLeadAlert(c.env, lead.company_name, `${origin}/`));
  }
  return pixel;
});

/** GET /api/leads/:id/flyer — PDF du flyer (utilisateur connecté). */
publicRoutes.get("/api/leads/:id/flyer", requireUser(), async (c) => {
  const row = await c.env.DB.prepare("SELECT company_name, flyer_pdf_base64 AS b FROM leads WHERE id = ?")
    .bind(c.req.param("id"))
    .first<{ company_name: string; b: string | null }>();
  if (!row?.b) return c.text("Flyer introuvable", 404);
  const bin = Uint8Array.from(atob(row.b), (ch) => ch.charCodeAt(0));
  const safe = row.company_name.replace(/[^\w-]+/g, "_");
  return new Response(bin, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="flyer-${safe}.pdf"`,
    },
  });
});

export interface InboundLeadBody {
  company_name?: string;
  contact_name?: string;
  phone?: string;
  email?: string;
  activity?: string;
  city?: string;
  website_url?: string;
  offer_tier?: "static" | "admin_cms" | "custom";
  preferred_callback?: string;
  message?: string;
  honeypot?: string; // Champ caché anti-bot
}

const INBOUND_TIER_LABELS: Record<string, string> = {
  static: "Formule 1 — Site Vitrine Statique Clé-en-Main (490 € HT + 39 €/mois)",
  admin_cms: "Formule 2 — Site Dynamique avec Panneau d'Administration (1 290 € HT + 59 €/mois)",
  custom: "Formule 3 — Dév. Spécifique / E-Commerce / Synchro Compta (Sur Devis)",
};

/**
 * POST /api/public/inbound-lead — Capture d'un "Lead Volontaire" (Demande de rappel / devis)
 * depuis la Landing Page publique dissociée de l'agence (`agency-landing-web`).
 */
publicRoutes.post("/api/public/inbound-lead", async (c) => {
  await ensureAuthSchema(c.env.DB);
  const body = await c.req.json<InboundLeadBody>().catch(() => null);
  if (!body) return c.json({ error: "invalid_json" }, 400);

  // Protection anti-spam honeypot
  if (body.honeypot && body.honeypot.trim() !== "") {
    return c.json({ ok: true, ignored: true });
  }

  const companyName = (body.company_name || body.contact_name || "").trim().slice(0, 120);
  const contactName = (body.contact_name || "").trim().slice(0, 100);
  const phone = (body.phone || "").trim().slice(0, 30);
  const email = (body.email || "").trim().slice(0, 100);
  const activity = (body.activity || "Entreprise / Artisan").trim().slice(0, 100);
  const city = (body.city || "France").trim().slice(0, 80);
  const websiteUrl = (body.website_url || "").trim().slice(0, 200) || null;
  const offerTier = body.offer_tier && body.offer_tier in INBOUND_TIER_LABELS ? body.offer_tier : "static";
  const preferredCallback = (body.preferred_callback || "").trim().slice(0, 60);
  const message = (body.message || "").trim().slice(0, 1500);

  if (!companyName || (!phone && !email)) {
    return c.json(
      { error: "missing_fields", message: "Veuillez renseigner le nom de votre structure et un numéro de téléphone ou email." },
      400,
    );
  }

  const id = generateRandomHex(8); // 16 hex chars
  const now = new Date();
  const stamp = now.toISOString().slice(0, 16).replace("T", " ");
  const tierLabel = INBOUND_TIER_LABELS[offerTier]!;
  const oppType = offerTier === "custom" ? "custom" : DEFAULT_OPPORTUNITY_ID;

  // Si le prospect a choisi un créneau ISO valide, on programme directement le rappel dans Ma Journée & Agenda
  let callbackScheduledAt: string | null = null;
  if (preferredCallback) {
    const parsed = new Date(preferredCallback);
    if (!Number.isNaN(parsed.getTime())) {
      callbackScheduledAt = parsed.toISOString();
    }
  }
  if (!callbackScheduledAt) {
    // Par défaut : rappel prioritaire dans les 2 heures pour qu'il apparaisse en tête de "Ma Journée & Agenda"
    callbackScheduledAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  }

  const noteLines = [
    `[${stamp}] 📥 LEAD ENTRANT VOLONTAIRE (Demande de rappel via Landing Page Agence)`,
    contactName ? `👤 Interlocuteur : ${contactName}` : null,
    `📦 Formule souhaitée : ${tierLabel}`,
    preferredCallback ? `🕒 Créneau souhaité : ${preferredCallback}` : null,
    message ? `💬 Besoin exprimé : ${message}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const auditData = {
    summary: `Lead entrant volontaire ayant demandé à être rappelé pour « ${tierLabel} ».${message ? ` Détail : ${message}` : ""}`,
    weaknesses: [
      `Demande entrante directe (${tierLabel})`,
      websiteUrl ? `Site existant déclaré : ${websiteUrl}` : "Création ou refonte souhaitée",
    ],
    score: null, // aucune mesure : pas de score inventé
  };

  const battlecardData = {
    closerBrief: `Lead entrant volontaire (${contactName || companyName}) ayant demandé à être rappelé pour la ${tierLabel}.`,
    callScript: `Bonjour ${contactName || companyName}, c'est Loïc suite à votre demande de rappel sur notre site concernant la ${tierLabel}. Vous avez 2 minutes pour qu'on fasse le point sur votre projet ?`,
    objections: [
      {
        objection: "Comment se passe la gestion de mon nom de domaine (.fr / .com) ?",
        reply: "Nous gérons tout de A à Z : réservation ou transfert, renouvellement annuel, DNS et certificat SSL HTTPS, et vous restez 100% propriétaire légal.",
      },
      {
        objection: "Et si j'ai besoin de modifier des textes, tarifs ou photos après la mise en ligne ?",
        reply:
          offerTier === "admin_cms"
            ? "Avec la Formule 2, vous avez votre propre panneau d'administration simplifié pour publier vos chantiers et photos en 30 secondes, plus notre support inclus."
            : "Un quota de demandes de modifications gratuites est inclus dans votre suivi mensuel : un simple message WhatsApp ou email et nous faisons la mise à jour sous 24h.",
      },
    ],
    whatsappText: `Bonjour ${contactName || companyName}, merci pour votre demande de rappel ! Je suis disponible pour échanger sur votre projet (${tierLabel}). Quel horaire vous arrange ?`,
    ourAdvantages: [
      tierLabel,
      "Gestion intégrale du Nom de Domaine (.fr / .com) + Certificat SSL HTTPS",
      "Modifications gratuites incluses ou Panneau d'Administration autonome",
      "Architecture haute performance & accompagnement direct par un architecte senior (14 ans d'XP)",
    ],
  };

  const placeholderDemoHtml = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="https://cdn.tailwindcss.com"></script><title>Projet ${esc(companyName)}</title></head><body class="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-6 font-sans"><div class="max-w-lg w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-3"><span class="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">📥 Lead Entrant Volontaire</span><h1 class="text-xl font-bold">${esc(companyName)}</h1><p class="text-xs text-zinc-400">${esc(tierLabel)}</p><p class="text-xs text-zinc-300 whitespace-pre-line bg-zinc-950 p-3.5 rounded-xl border border-zinc-800">${esc(noteLines)}</p></div></body></html>`;

  await c.env.DB.prepare(
    `INSERT INTO leads (
       id, company_name, activity, city, phone, email, website_url,
       audit_data, demo_html, battlecard_data, status, demo_viewed_count,
       callback_scheduled_at, call_notes, opportunity_type, assigned_to, assigned_at, created_at
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'hot_lead', 1, ?11, ?12, ?13, 'u_admin', ?14, ?14)`,
  )
    .bind(
      id,
      companyName,
      activity,
      city,
      phone || null,
      email || null,
      websiteUrl,
      JSON.stringify(auditData),
      placeholderDemoHtml,
      JSON.stringify(battlecardData),
      callbackScheduledAt,
      noteLines,
      oppType,
      now.toISOString(),
    )
    .run();

  if (c.env.AUTO_ASSIGN === "true") {
    await assignRoundRobin(c.env.DB);
  }

  const origin = (c.env.PUBLIC_APP_URL ?? new URL(c.req.url).origin).replace(/\/+$/, "");
  c.executionCtx.waitUntil(
    sendHotLeadAlert(c.env, `📥 LEAD VOLONTAIRE : ${companyName} (${tierLabel})`, `${origin}/?view=calendar`),
  );

  return c.json({ ok: true, id, status: "hot_lead", callback_scheduled_at: callbackScheduledAt });
});
