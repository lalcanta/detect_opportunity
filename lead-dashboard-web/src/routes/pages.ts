import { Hono } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { parseAllowedOpportunities, type AppEnv, type LeadRow, type User } from "../types";
import { ensureAuthSchema, generateRandomHex, hashPassword, SESSION_COOKIE, requireUser, verifyPassword } from "../auth";
import { loadStats, listModelSettings, listAvailableModels } from "./admin";
import { listScans, listScheduledScans } from "./scans";
import { inviteAcceptPage, loginPage } from "../views/login";
import { closerPage } from "../views/closer";
import { adminPage } from "../views/admin";

export const pageRoutes = new Hono<AppEnv>();

pageRoutes.use("*", async (c, next) => {
  await next();
  c.header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  c.header("Pragma", "no-cache");
});

pageRoutes.get("/login", async (c) => {
  await ensureAuthSchema(c.env.DB);
  return c.html(loginPage());
});

pageRoutes.post("/login", async (c) => {
  await ensureAuthSchema(c.env.DB);
  const form = await c.req.parseBody();
  const emailRaw = typeof form["email"] === "string" ? form["email"].trim().toLowerCase() : "";
  const password = typeof form["password"] === "string" ? form["password"] : "";

  // Connexion uniquement par email whitelisté + mot de passe (plus de connexion par jeton brut : audit 5.1).
  if (!emailRaw) return c.html(loginPage("Identifiants incorrects."), 401);

  const user = await c.env.DB.prepare(
    "SELECT id, email, password_hash, invite_code, access_token, is_active FROM users WHERE LOWER(email) = ?",
  )
    .bind(emailRaw)
    .first<{
      id: string;
      email: string;
      password_hash: string | null;
      invite_code: string | null;
      access_token: string;
      is_active: number;
    }>();

  if (!user || !user.is_active) {
    return c.html(
      loginPage("Accès refusé : cette adresse email ne figure pas dans la liste blanche (Whitelist) autorisée.", emailRaw),
      401,
    );
  }

  // Compte pas encore activé : seul le lien d'invitation (secret) permet de définir le mot de passe.
  // Ne jamais le révéler à partir de l'email seul, sinon n'importe qui prend le compte (audit 5.2).
  if (!user.password_hash) {
    return c.html(
      loginPage("Compte pas encore activé : utilisez le lien d'invitation transmis par l'administrateur.", emailRaw),
      403,
    );
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    return c.html(loginPage("Mot de passe incorrect pour cette adresse autorisée.", emailRaw), 401);
  }

  setCookie(c, SESSION_COOKIE, user.access_token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return c.redirect("/");
});

/** GET /invite/:code — Page d'activation de l'invitation pour un email de la Whitelist */
pageRoutes.get("/invite/:code", async (c) => {
  await ensureAuthSchema(c.env.DB);
  const code = c.req.param("code").trim();
  const user = await c.env.DB.prepare(
    "SELECT id, name, email, role, is_active FROM users WHERE invite_code = ? AND is_active = 1",
  )
    .bind(code)
    .first<{ id: string; name: string; email: string | null; role: string; is_active: number }>();

  if (!user) {
    return c.html(loginPage("Ce lien d'invitation est invalide, expiré ou a déjà été révoqué."), 404);
  }

  return c.html(
    inviteAcceptPage({
      inviteCode: code,
      userName: user.name,
      email: user.email || "",
      role: user.role,
    }),
  );
});

/** POST /invite/:code — Enregistrement du mot de passe choisi par la personne invitée + connexion */
pageRoutes.post("/invite/:code", async (c) => {
  await ensureAuthSchema(c.env.DB);
  const code = c.req.param("code").trim();
  const form = await c.req.parseBody();
  const password = typeof form["password"] === "string" ? form["password"] : "";

  const user = await c.env.DB.prepare(
    "SELECT id, name, email, role, access_token, is_active FROM users WHERE invite_code = ? AND is_active = 1",
  )
    .bind(code)
    .first<{ id: string; name: string; email: string | null; role: string; access_token: string; is_active: number }>();

  if (!user) {
    return c.html(loginPage("Ce lien d'invitation est invalide ou expiré."), 404);
  }

  if (password.length < 6) {
    return c.html(
      inviteAcceptPage({
        inviteCode: code,
        userName: user.name,
        email: user.email || "",
        role: user.role,
        error: "Le mot de passe doit contenir au moins 6 caractères.",
      }),
      400,
    );
  }

  const pwdHash = await hashPassword(password);
  const nextInviteCode = `inv_${generateRandomHex(16)}`;
  await c.env.DB.prepare("UPDATE users SET password_hash = ?, invite_code = ? WHERE id = ?")
    .bind(pwdHash, nextInviteCode, user.id)
    .run();

  setCookie(c, SESSION_COOKIE, user.access_token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return c.redirect("/");
});

pageRoutes.get("/logout", (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" }); // supprime uniquement le cookie de session
  return c.redirect("/login");
});

const LEAD_COLUMNS = `l.id, l.company_name, l.activity, l.city, l.phone, l.email, l.website_url, l.google_rating,
  l.google_reviews_count, l.audit_data, l.flyer_pdf_url, l.battlecard_data, l.assigned_to, l.assigned_at,
  l.locked_by, l.locked_until, l.demo_viewed_count, l.last_demo_viewed_at, l.demo_revoked, l.demo_expires_at, l.status, l.callback_scheduled_at, l.call_notes, l.opportunity_type, l.created_at,
  l.primary_channel,
  l.siren,
  (SELECT group_concat(t.task || '|' || t.model || '|' || COALESCE(t.requested_model, ''), ';') FROM token_usage t WHERE t.lead_id = l.id) AS generated_by,
  (SELECT d.company_name || ' · ' || COALESCE(d.city, '') FROM leads d WHERE l.siren IS NOT NULL AND d.siren = l.siren AND d.id != l.id AND d.status != 'unqualified' LIMIT 1) AS duplicate_of,
  (SELECT lc.value FROM lead_contacts lc WHERE lc.lead_id = l.id AND lc.kind = 'contact_form' ORDER BY lc.is_primary DESC, lc.id LIMIT 1) AS contact_form_url,
  (SELECT lc.meta FROM lead_contacts lc WHERE lc.lead_id = l.id AND lc.kind = 'contact_form' ORDER BY lc.is_primary DESC, lc.id LIMIT 1) AS contact_form_meta,
  a.name AS assignee_name, k.name AS locker_name`;
const LEAD_JOINS = "FROM leads l LEFT JOIN users a ON a.id = l.assigned_to LEFT JOIN users k ON k.id = l.locked_by";

/** Vue Backlog / Pipeline Kanban */
pageRoutes.get("/", requireUser(undefined, "page"), async (c) => {
  const user = c.get("user");
  const isAdmin = user.role === "admin";
  const scope = isAdmin
    ? (["mine", "unassigned", "all"].includes(c.req.query("scope") ?? "") ? (c.req.query("scope") as string) : "all")
    : "mine"; // Le closer ne voit STRICTEMENT que ses leads attribués

  const rawView = c.req.query("view") ?? "";
  const view = rawView === "today" ? "calendar" : ["list", "calendar"].includes(rawView) ? rawView : "backlog";

  const requestedOpp = c.req.query("opp") || "all";
  const allowedOpps = parseAllowedOpportunities(user.allowed_opportunities);

  // Pour le closer, restreindre aux types d'opportunités qui lui sont activés
  const effectiveOpp = !isAdmin && requestedOpp !== "all" && !allowedOpps.includes(requestedOpp as any)
    ? "all"
    : requestedOpp;

  let querySql = "";
  let bindings: (string | number)[] = [];

  if (isAdmin) {
    if (scope === "mine") {
      if (effectiveOpp !== "all") {
        querySql = `SELECT ${LEAD_COLUMNS} ${LEAD_JOINS} WHERE l.status NOT IN ('pending_generation','unqualified') AND l.assigned_to = ?1 AND l.opportunity_type = ?2
                    ORDER BY (l.status = 'hot_lead') DESC, l.last_demo_viewed_at DESC, l.created_at DESC LIMIT 250`;
        bindings = [user.id, effectiveOpp];
      } else {
        querySql = `SELECT ${LEAD_COLUMNS} ${LEAD_JOINS} WHERE l.status NOT IN ('pending_generation','unqualified') AND l.assigned_to = ?1
                    ORDER BY (l.status = 'hot_lead') DESC, l.last_demo_viewed_at DESC, l.created_at DESC LIMIT 250`;
        bindings = [user.id];
      }
    } else if (scope === "unassigned") {
      if (effectiveOpp !== "all") {
        querySql = `SELECT ${LEAD_COLUMNS} ${LEAD_JOINS} WHERE l.status NOT IN ('pending_generation','unqualified') AND l.assigned_to IS NULL AND l.opportunity_type = ?1
                    ORDER BY (l.status = 'hot_lead') DESC, l.last_demo_viewed_at DESC, l.created_at DESC LIMIT 250`;
        bindings = [effectiveOpp];
      } else {
        querySql = `SELECT ${LEAD_COLUMNS} ${LEAD_JOINS} WHERE l.status NOT IN ('pending_generation','unqualified') AND l.assigned_to IS NULL
                    ORDER BY (l.status = 'hot_lead') DESC, l.last_demo_viewed_at DESC, l.created_at DESC LIMIT 250`;
        bindings = [];
      }
    } else {
      // scope === "all"
      if (effectiveOpp !== "all") {
        querySql = `SELECT ${LEAD_COLUMNS} ${LEAD_JOINS} WHERE l.status NOT IN ('pending_generation','unqualified') AND l.opportunity_type = ?1
                    ORDER BY (l.status = 'hot_lead') DESC, l.last_demo_viewed_at DESC, l.created_at DESC LIMIT 250`;
        bindings = [effectiveOpp];
      } else {
        querySql = `SELECT ${LEAD_COLUMNS} ${LEAD_JOINS} WHERE l.status NOT IN ('pending_generation','unqualified')
                    ORDER BY (l.status = 'hot_lead') DESC, l.last_demo_viewed_at DESC, l.created_at DESC LIMIT 250`;
        bindings = [];
      }
    }
  } else {
    // Closer : Uniquement ses leads ET uniquement dans les types d'opportunités qui lui sont activés
    if (effectiveOpp !== "all") {
      querySql = `SELECT ${LEAD_COLUMNS} ${LEAD_JOINS} WHERE l.status NOT IN ('pending_generation','unqualified') AND l.assigned_to = ?1 AND l.opportunity_type = ?2
                  ORDER BY (l.status = 'hot_lead') DESC, l.last_demo_viewed_at DESC, l.created_at DESC LIMIT 250`;
      bindings = [user.id, effectiveOpp];
    } else if (allowedOpps.length > 0) {
      const placeholders = allowedOpps.map((_, i) => `?${i + 2}`).join(", ");
      querySql = `SELECT ${LEAD_COLUMNS} ${LEAD_JOINS} WHERE l.status NOT IN ('pending_generation','unqualified') AND l.assigned_to = ?1 AND l.opportunity_type IN (${placeholders})
                  ORDER BY (l.status = 'hot_lead') DESC, l.last_demo_viewed_at DESC, l.created_at DESC LIMIT 250`;
      bindings = [user.id, ...allowedOpps];
    } else {
      querySql = `SELECT ${LEAD_COLUMNS} ${LEAD_JOINS} WHERE 1 = 0`;
      bindings = [];
    }
  }

  const stmt = c.env.DB.prepare(querySql);
  const rows = await (bindings.length > 0 ? stmt.bind(...bindings) : stmt).all<LeadRow>();
  const origin = (c.env.PUBLIC_APP_URL ?? new URL(c.req.url).origin).replace(/\/+$/, "");
  return c.html(closerPage({ user, leads: rows.results, scope, view, origin, opp: effectiveOpp }));
});

pageRoutes.get("/admin", requireUser("admin", "page"), async (c) => {
  const user: User = c.get("user");
  const tab = ["overview", "scanner", "models", "quotas", "benchmarks", "team", "attribution", "pending"].includes(c.req.query("tab") ?? "")
    ? (c.req.query("tab") as string)
    : "overview";
  const leads = await c.env.DB.prepare(`SELECT ${LEAD_COLUMNS} ${LEAD_JOINS} ORDER BY l.created_at DESC LIMIT 200`).all<LeadRow>();
  const users = await c.env.DB.prepare(
    `SELECT id, name, email, password_hash, invite_code, invited_at, role, is_active, phone_quota_weekly, allowed_opportunities, allowed_channels FROM users ORDER BY role, name`,
  ).all<User>();
  const stats = await loadStats(c.env.DB);
  const scans = await listScans(c.env.DB);
  const scheduledScans = await listScheduledScans(c.env.DB);
  const models = await listModelSettings(c.env.DB);
  const availableModels = await listAvailableModels(c.env.DB);
  return c.html(adminPage({ user, leads: leads.results, users: users.results, stats, scans, scheduledScans, models, availableModels, tab }));
});
