import { Hono } from "hono";
import { LEAD_STATUSES, parseAllowedOpportunities, type AppEnv, type Battlecard, type LeadRow, type LeadStatus, type OpportunityTypeId } from "../types";
import { requireUser } from "../auth";
import { createPaymentLink } from "../services/stripe";
import { syncLeadToGoogleCalendar } from "../services/googleCalendar";

export const leadRoutes = new Hono<AppEnv>();
const LOCK_MINUTES = 15;

/** POST /api/leads/:id/lock — verrou atomique de 15 min (anti-doublon d'appel). */
leadRoutes.post("/api/leads/:id/lock", requireUser("closer"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const currentLead = await c.env.DB.prepare(
    "SELECT id, assigned_to, opportunity_type FROM leads WHERE id = ?",
  )
    .bind(id)
    .first<{ id: string; assigned_to: string | null; opportunity_type: string | null }>();
  if (!currentLead) return c.json({ error: "not_found" }, 404);

  if (user.role === "closer") {
    if (currentLead.assigned_to && currentLead.assigned_to !== user.id) {
      return c.json({ error: "forbidden", message: "Ce lead ne vous est pas attribué." }, 403);
    }
    const allowed = parseAllowedOpportunities(user.allowed_opportunities);
    const opp = (currentLead.opportunity_type || "website") as OpportunityTypeId;
    if (!allowed.includes(opp)) {
      return c.json({ error: "forbidden", message: "Ce type d'opportunité n'est pas activé pour vous." }, 403);
    }
  }

  const now = new Date();
  const until = new Date(now.getTime() + LOCK_MINUTES * 60_000).toISOString();
  const res = await c.env.DB.prepare(
    `UPDATE leads SET locked_by = ?1, locked_until = ?2
     WHERE id = ?3 AND (locked_until IS NULL OR locked_until < ?4 OR locked_by = ?1)`,
  )
    .bind(user.id, until, id, now.toISOString())
    .run();

  if (res.meta.changes === 0) {
    const row = await c.env.DB.prepare(
      "SELECT u.name AS who, l.locked_until FROM leads l LEFT JOIN users u ON u.id = l.locked_by WHERE l.id = ?",
    )
      .bind(id)
      .first<{ who: string | null; locked_until: string | null }>();
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json({ error: "locked", locked_by: row.who, locked_until: row.locked_until }, 409);
  }
  return c.json({ ok: true, locked_until: until });
});

interface StatusBody {
  status?: string;
  notes?: string;
  sendStripe?: boolean;
  offerTier?: "static" | "admin_cms" | "custom";
  customAmountEur?: number;
}

/** POST /api/leads/:id/status — compte-rendu, libération du lock, lien Stripe optionnel. */
leadRoutes.post("/api/leads/:id/status", requireUser("closer"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req.json<StatusBody>().catch(() => ({}) as StatusBody);
  const status = body.status as LeadStatus | undefined;
  if (!status || !LEAD_STATUSES.includes(status)) return c.json({ error: "invalid_status" }, 400);

  const lead = await c.env.DB.prepare(
    "SELECT company_name, phone, status, battlecard_data, locked_by, locked_until, call_notes, assigned_to, opportunity_type FROM leads WHERE id = ?",
  )
    .bind(id)
    .first<{ company_name: string; phone: string | null; status: LeadStatus; battlecard_data: string | null; locked_by: string | null; locked_until: string | null; call_notes: string | null; assigned_to: string | null; opportunity_type: string | null }>();
  if (!lead) return c.json({ error: "not_found" }, 404);

  // Le closer ne peut agir que sur ses leads attribués et dans ses types d'opportunités activés
  if (user.role === "closer") {
    if (lead.assigned_to && lead.assigned_to !== user.id) {
      return c.json({ error: "forbidden", message: "Ce lead ne vous est pas attribué." }, 403);
    }
    const allowed = parseAllowedOpportunities(user.allowed_opportunities);
    const opp = (lead.opportunity_type || "website") as OpportunityTypeId;
    if (!allowed.includes(opp)) {
      return c.json({ error: "forbidden", message: "Ce type d'opportunité n'est pas activé pour vous." }, 403);
    }
    if ((lead.status === "won" || lead.status === "lost") && status !== lead.status) {
      return c.json({ error: "forbidden", message: "Seul l'administrateur peut modifier un dossier clôturé (gagné ou perdu)." }, 403);
    }
  }

  const lockedByOther =
    lead.locked_by && lead.locked_by !== user.id && lead.locked_until && lead.locked_until > new Date().toISOString();
  if (lockedByOther && user.role !== "admin") return c.json({ error: "locked" }, 409);

  let paymentUrl: string | null = null;
  if (body.sendStripe) {
    try {
      const customCents =
        body.customAmountEur && Number(body.customAmountEur) >= 10
          ? Math.round(Number(body.customAmountEur) * 100)
          : undefined;
      paymentUrl = await createPaymentLink(c.env, id, lead.company_name, {
        offerTier: body.offerTier,
        customAmountCents: customCents,
      });
    } catch (err) {
      return c.json({ error: "stripe_failed", message: (err as Error).message }, 502);
    }
  }

  const finalNotes = body.notes !== undefined ? body.notes.slice(0, 4000) : (lead.call_notes ?? "");
  const nowIso = new Date().toISOString();
  const autoExpireIso = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
  const shouldRevoke = status === "lost" ? 1 : 0;
  const shouldArmExpiry = status === "called" || status === "callback_scheduled";

  await c.env.DB.prepare(
    `UPDATE leads SET status = ?1, call_notes = ?2, locked_by = NULL, locked_until = NULL,
       assigned_to = COALESCE(assigned_to, ?3), assigned_at = COALESCE(assigned_at, ?4),
       demo_revoked = CASE WHEN ?5 = 1 THEN 1 ELSE demo_revoked END,
       demo_expires_at = CASE WHEN ?6 = 1 THEN COALESCE(demo_expires_at, ?7) ELSE demo_expires_at END
     WHERE id = ?8`,
  )
    .bind(status, finalNotes, user.id, nowIso, shouldRevoke, shouldArmExpiry ? 1 : 0, autoExpireIso, id)
    .run();

  return c.json({ ok: true, paymentUrl });
});

/** POST /api/leads/:id/demo-access — révoquer immédiatement ou prolonger / réactiver la démo (+5 jours). */
leadRoutes.post("/api/leads/:id/demo-access", requireUser("closer"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await c.req
    .json<{ action?: "revoke" | "extend" | "unlimited"; days?: number }>()
    .catch(() => ({}) as { action?: "revoke" | "extend" | "unlimited"; days?: number });

  const current = await c.env.DB.prepare("SELECT * FROM leads WHERE id = ?").bind(id).first<LeadRow>();
  if (!current) return c.json({ error: "not_found" }, 404);
  if (user.role === "closer" && current.assigned_to && current.assigned_to !== user.id) {
    return c.json({ error: "forbidden" }, 403);
  }

  const days = Math.max(1, Math.min(90, Number(body.days) || 5));
  let demoRevoked = 0;
  let demoExpiresAt: string | null = null;

  if (body.action === "revoke") {
    demoRevoked = 1;
    demoExpiresAt = current.demo_expires_at ?? null;
  } else if (body.action === "unlimited") {
    demoRevoked = 0;
    demoExpiresAt = null;
  } else {
    // extend (par défaut +5 jours à partir de maintenant)
    demoRevoked = 0;
    demoExpiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  }

  await c.env.DB.prepare("UPDATE leads SET demo_revoked = ?1, demo_expires_at = ?2 WHERE id = ?3")
    .bind(demoRevoked, demoExpiresAt, id)
    .run();

  return c.json({
    ok: true,
    id,
    demo_revoked: demoRevoked,
    demo_expires_at: demoExpiresAt,
  });
});

interface EmailSentBody {
  to?: string;
  subject?: string;
  body?: string;
  template_id?: string;
}

/**
 * POST /api/leads/:id/email-sent — historise un email envoyé MANUELLEMENT par l'utilisateur.
 * Cet endpoint n'envoie rien : il trace l'action humaine (destinataire, objet, modèle) dans les notes.
 */
leadRoutes.post("/api/leads/:id/email-sent", requireUser("closer"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const b = await c.req.json<EmailSentBody>().catch(() => ({}) as EmailSentBody);
  const to = (b.to ?? "").trim().slice(0, 100);
  const subject = (b.subject ?? "").trim().slice(0, 300);
  if (!to || !subject || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return c.json({ error: "invalid_payload", message: "Destinataire valide et objet requis." }, 400);
  }

  const current = await c.env.DB.prepare("SELECT * FROM leads WHERE id = ?").bind(id).first<LeadRow>();
  if (!current) return c.json({ error: "not_found" }, 404);
  if (user.role === "closer") {
    if (current.assigned_to && current.assigned_to !== user.id) {
      return c.json({ error: "forbidden", message: "Ce lead ne vous est pas attribué." }, 403);
    }
    const allowed = parseAllowedOpportunities(user.allowed_opportunities);
    if (!allowed.includes((current.opportunity_type || "website") as OpportunityTypeId)) {
      return c.json({ error: "forbidden", message: "Ce type d'opportunité n'est pas activé pour vous." }, 403);
    }
  }

  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const entry = `[${stamp}] ✉️ Email envoyé par ${user.name} à ${to} — « ${subject} »${b.template_id ? ` (modèle : ${b.template_id})` : ""}`;
  const notes = (current.call_notes ? `${current.call_notes}\n${entry}` : entry).slice(-4000);
  const email = current.email || to;

  await c.env.DB.prepare(
    "UPDATE leads SET call_notes = ?1, email = ?2, assigned_to = COALESCE(assigned_to, ?3) WHERE id = ?4",
  )
    .bind(notes, email, user.id, id)
    .run();

  return c.json({ ok: true, call_notes: notes });
});

interface UpdateLeadBody {
  phone?: string;
  email?: string;
  status?: LeadStatus;
  callback_scheduled_at?: string | null;
  call_notes?: string;
}

/** POST /api/leads/:id/update — modification directe téléphone, email, notes, agenda rappel, statut. */
leadRoutes.post("/api/leads/:id/update", requireUser("closer"), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const b = await c.req.json<UpdateLeadBody>().catch(() => ({}) as UpdateLeadBody);

  const current = await c.env.DB.prepare("SELECT * FROM leads WHERE id = ?").bind(id).first<LeadRow>();
  if (!current) return c.json({ error: "not_found" }, 404);

  // Le closer ne peut agir que sur ses leads attribués et dans ses types d'opportunités activés
  if (user.role === "closer") {
    if (current.assigned_to && current.assigned_to !== user.id) {
      return c.json({ error: "forbidden", message: "Ce lead ne vous est pas attribué." }, 403);
    }
    const allowed = parseAllowedOpportunities(user.allowed_opportunities);
    const opp = (current.opportunity_type || "website") as OpportunityTypeId;
    if (!allowed.includes(opp)) {
      return c.json({ error: "forbidden", message: "Ce type d'opportunité n'est pas activé pour vous." }, 403);
    }
    if ((current.status === "won" || current.status === "lost") && b.status && b.status !== current.status) {
      return c.json({ error: "forbidden", message: "Seul l'administrateur peut modifier un dossier clôturé (gagné ou perdu)." }, 403);
    }
  }

  const phone = b.phone !== undefined ? (b.phone.trim().slice(0, 30) || null) : current.phone;
  const email = b.email !== undefined ? (b.email.trim().slice(0, 100) || null) : current.email;
  const status = b.status && LEAD_STATUSES.includes(b.status) ? b.status : current.status;
  const callback = b.callback_scheduled_at !== undefined ? (b.callback_scheduled_at?.trim() || null) : current.callback_scheduled_at;
  const notes = b.call_notes !== undefined ? b.call_notes.slice(0, 4000) : current.call_notes;

  await c.env.DB.prepare(
    `UPDATE leads SET phone = ?1, email = ?2, status = ?3, callback_scheduled_at = ?4, call_notes = ?5,
       assigned_to = COALESCE(assigned_to, ?6)
     WHERE id = ?7`,
  )
    .bind(phone, email, status, callback, notes, user.id, id)
    .run();

  let googleCalendarResult: { ok: boolean; eventId?: string; error?: string } | null = null;
  if (callback && callback !== current.callback_scheduled_at) {
    const origin = new URL(c.req.url).origin;
    googleCalendarResult = await syncLeadToGoogleCalendar(
      c.env.DB,
      user.id,
      {
        companyName: current.company_name,
        activity: current.activity,
        phone,
        city: current.city,
        callNotes: notes,
        leadId: id,
        origin,
        existingEventId: current.google_calendar_event_id,
      },
      callback,
      c.env,
    );
  }

  return c.json({
    ok: true,
    phone,
    email,
    status,
    callback_scheduled_at: callback,
    call_notes: notes,
    google_calendar: googleCalendarResult,
  });
});

/** GET /api/leads/:id — récupération JSON détaillée du lead. */
leadRoutes.get("/api/leads/:id", requireUser("closer"), async (c) => {
  const user = c.get("user");
  const row = await c.env.DB.prepare("SELECT * FROM leads WHERE id = ?").bind(c.req.param("id")).first<LeadRow>();
  if (!row) return c.json({ error: "not_found" }, 404);

  if (user.role === "closer") {
    if (row.assigned_to && row.assigned_to !== user.id) {
      return c.json({ error: "forbidden", message: "Ce lead ne vous est pas attribué." }, 403);
    }
    const allowed = parseAllowedOpportunities(user.allowed_opportunities);
    const opp = (row.opportunity_type || "website") as OpportunityTypeId;
    if (!allowed.includes(opp)) {
      return c.json({ error: "forbidden", message: "Ce type d'opportunité n'est pas activé pour vous." }, 403);
    }
  }

  return c.json({ ok: true, lead: row });
});

function formatIcsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

/** GET /api/leads/:id/calendar.ics — Téléchargement fichier .ics standard pour n'importe quel calendrier (Apple, Outlook, Android). */
leadRoutes.get("/api/leads/:id/calendar.ics", requireUser("closer"), async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM leads WHERE id = ?").bind(c.req.param("id")).first<import("../types").LeadRow>();
  if (!row || !row.callback_scheduled_at) {
    return c.text("Aucun rappel programmé pour ce lead.", 404);
  }

  const origin = new URL(c.req.url).origin;
  const start = new Date(row.callback_scheduled_at);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const now = new Date();

  const summary = `📞 Relance : ${row.company_name} (${row.activity || "Artisan"})`;
  const description = [
    `🏢 Entreprise : ${row.company_name}`,
    `📞 Téléphone : ${row.phone || "Non renseigné"}`,
    `📍 Ville : ${row.city || ""}`,
    `🌐 Démo Tailwind : ${origin}/demos/${row.id}`,
    `📋 CRM Lead : ${origin}/?view=calendar`,
    `📝 Notes : ${row.call_notes || "Aucune note"}`,
  ].join("\\n");
  const location = row.phone ? `Tél: ${row.phone}` : (row.city || "");

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LeadEngine CRM//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${row.id}@leadengine.local`,
    `DTSTAMP:${formatIcsDate(now)}`,
    `DTSTART:${formatIcsDate(start)}`,
    `DTEND:${formatIcsDate(end)}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${location}`,
    "STATUS:CONFIRMED",
    "BEGIN:VALARM",
    "TRIGGER:-PT10M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Rappel Relance Prospect",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const filename = `relance-${row.company_name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.ics`;
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});

/** GET /api/closer/calendar.ics — Flux global de toutes les relances programmées du closer. */
leadRoutes.get("/api/closer/calendar.ics", requireUser("closer"), async (c) => {
  const user = c.get("user");
  const origin = new URL(c.req.url).origin;
  const now = new Date();

  const query = user.role === "admin"
    ? "SELECT * FROM leads WHERE callback_scheduled_at IS NOT NULL ORDER BY callback_scheduled_at ASC LIMIT 100"
    : "SELECT * FROM leads WHERE callback_scheduled_at IS NOT NULL AND (assigned_to = ?1 OR assigned_to IS NULL) ORDER BY callback_scheduled_at ASC LIMIT 100";

  const rows = await c.env.DB.prepare(query).bind(user.id).all<import("../types").LeadRow>();

  const events: string[] = [];
  for (const row of rows.results) {
    if (!row.callback_scheduled_at) continue;
    const start = new Date(row.callback_scheduled_at);
    if (isNaN(start.getTime())) continue;
    const end = new Date(start.getTime() + 30 * 60 * 1000);

    const summary = `📞 Relance : ${row.company_name} (${row.activity || "Artisan"})`;
    const description = [
      `🏢 Entreprise : ${row.company_name}`,
      `📞 Téléphone : ${row.phone || "Non renseigné"}`,
      `📍 Ville : ${row.city || ""}`,
      `🌐 Démo : ${origin}/demos/${row.id}`,
      `📝 Notes : ${row.call_notes || ""}`,
    ].join("\\n");

    events.push([
      "BEGIN:VEVENT",
      `UID:${row.id}@leadengine.local`,
      `DTSTAMP:${formatIcsDate(now)}`,
      `DTSTART:${formatIcsDate(start)}`,
      `DTEND:${formatIcsDate(end)}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      `LOCATION:${row.phone ? `Tél: ${row.phone}` : (row.city || "")}`,
      "STATUS:CONFIRMED",
      "BEGIN:VALARM",
      "TRIGGER:-PT10M",
      "ACTION:DISPLAY",
      "DESCRIPTION:Rappel Relance",
      "END:VALARM",
      "END:VEVENT",
    ].join("\r\n"));
  }

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LeadEngine CRM//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:Relances LeadEngine (${user.name})`,
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="agenda-relances.ics"',
    },
  });
});

export function parseBattlecard(raw: string | null): Battlecard | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Battlecard;
  } catch {
    return null;
  }
}
