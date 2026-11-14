import { EMAIL_OUTBOX_DDL, EMAIL_OUTBOX_INDEX } from "./services/emailOutbox";
import { LEAD_ACTIVITIES_DDL } from "./services/activities";
import { MODEL_QUOTAS_DDL } from "./services/geminiQuota";
import { OPPORTUNITY_DEFINITIONS_DDL, OPPORTUNITY_HISTORY_DDL } from "./services/opportunityStore";
import type { Context, MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import type { AppEnv, Role, User } from "./types";

const COOKIE = "lead_session";
export const SESSION_COOKIE = COOKIE;

const AUTH_SCHEMA_VERSION = 17;
let migrationChecked = 0;

/** Assure que les colonnes Whitelist / Invitation / Password / Expiration démo, execution_mode et la table scheduled_scans existent. */
/** Contacts d'un lead (docs/PLAN_REFONTE_LEADS.md §3.4). Doit rester identique à schema.sql. */
export const LEAD_CONTACTS_DDL = `CREATE TABLE IF NOT EXISTS lead_contacts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id     TEXT NOT NULL REFERENCES leads(id),
  kind        TEXT NOT NULL,
  value       TEXT NOT NULL,
  source      TEXT NOT NULL,
  confidence  REAL,
  meta        TEXT,
  is_primary  INTEGER NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (lead_id, kind, value)
)`;

/**
 * Version 17 : les jobs déjà `running` au déploiement n'ont pas de battement (colonne neuve). Sans ce remplissage,
 * le nettoyage les verrait muets depuis leur démarrage et les passerait en échec alors que le worker est vivant.
 * Idempotent : ne touche que les jobs sans battement.
 */
export async function backfillRunningHeartbeats(db: D1Database): Promise<void> {
  await db
    .prepare("UPDATE scan_jobs SET heartbeat_at = CURRENT_TIMESTAMP WHERE status = 'running' AND heartbeat_at IS NULL")
    .run()
    .catch(() => undefined);
}

export async function ensureAuthSchema(db: D1Database): Promise<void> {
  if (migrationChecked >= AUTH_SCHEMA_VERSION) return;
  try {
    const alterCols = [
      "ALTER TABLE users ADD COLUMN email TEXT",
      "ALTER TABLE users ADD COLUMN password_hash TEXT",
      "ALTER TABLE users ADD COLUMN invite_code TEXT",
      "ALTER TABLE users ADD COLUMN invited_at DATETIME",
      "ALTER TABLE leads ADD COLUMN demo_revoked INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE leads ADD COLUMN demo_expires_at DATETIME",
      "ALTER TABLE leads ADD COLUMN primary_channel TEXT",
      "ALTER TABLE leads ADD COLUMN siren TEXT",
      "ALTER TABLE leads ADD COLUMN site_demo_html TEXT",
      "ALTER TABLE token_usage ADD COLUMN requested_model TEXT",
      "ALTER TABLE model_settings ADD COLUMN fallback_models TEXT",
      "ALTER TABLE users ADD COLUMN allowed_channels TEXT NOT NULL DEFAULT '[\"phone\",\"email\",\"contact_form\"]'",
      "ALTER TABLE scan_jobs ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'full_auto'",
      "ALTER TABLE scheduled_scans ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'full_auto'",
      "ALTER TABLE scan_jobs ADD COLUMN job_type TEXT NOT NULL DEFAULT 'scan'",
      "ALTER TABLE scan_jobs ADD COLUMN lead_ids TEXT",
      "ALTER TABLE scan_jobs ADD COLUMN effective_mode TEXT",
      "ALTER TABLE scan_jobs ADD COLUMN opportunity_version INTEGER",
      "ALTER TABLE scan_jobs ADD COLUMN heartbeat_at DATETIME",
      "ALTER TABLE available_models ADD COLUMN is_flagship INTEGER NOT NULL DEFAULT 1",
      "ALTER TABLE available_models ADD COLUMN speed TEXT DEFAULT 'fast'",
      "ALTER TABLE available_models ADD COLUMN cost_tier TEXT DEFAULT 'eco'",
      "ALTER TABLE available_models ADD COLUMN context_window TEXT DEFAULT '1M'",
      "ALTER TABLE available_models ADD COLUMN recommended_for TEXT DEFAULT 'all'",
    ];
    for (const sql of alterCols) {
      await db.prepare(sql).run().catch(() => undefined);
    }
    await backfillRunningHeartbeats(db);

    await db.prepare(LEAD_CONTACTS_DDL).run().catch(() => undefined);
    await db.prepare(LEAD_ACTIVITIES_DDL).run().catch(() => undefined);
    await db.prepare(MODEL_QUOTAS_DDL).run().catch(() => undefined);
    await db.prepare(OPPORTUNITY_DEFINITIONS_DDL).run().catch(() => undefined);
    await db.prepare(OPPORTUNITY_HISTORY_DDL).run().catch(() => undefined);
    await db.prepare(EMAIL_OUTBOX_DDL).run().catch(() => undefined);
    await db.prepare(EMAIL_OUTBOX_INDEX).run().catch(() => undefined);
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_leads_siren ON leads(siren)").run().catch(() => undefined);
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_lead_activities_lead ON lead_activities(lead_id, created_at)").run().catch(() => undefined);
    await db.prepare("CREATE INDEX IF NOT EXISTS idx_lead_contacts_lead ON lead_contacts(lead_id, kind)").run().catch(() => undefined);
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS scheduled_scans (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        label           TEXT NOT NULL,
        cron_expr       TEXT NOT NULL,
        time_of_day     TEXT NOT NULL DEFAULT '08:30',
        days_of_week    TEXT NOT NULL DEFAULT '1,2,3,4,5',
        query           TEXT NOT NULL,
        city            TEXT NOT NULL,
        lead_limit      INTEGER NOT NULL DEFAULT 10,
        use_cdp         INTEGER NOT NULL DEFAULT 0,
        lat             REAL,
        lng             REAL,
        radius_km       REAL,
        opportunity_type TEXT NOT NULL DEFAULT 'website_redesign',
        website_filter  TEXT NOT NULL DEFAULT 'all',
        execution_mode  TEXT NOT NULL DEFAULT 'full_auto',
        is_active       INTEGER NOT NULL DEFAULT 1,
        last_run_at     DATETIME,
        next_run_at     DATETIME,
        created_by      TEXT,
        created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).run().catch(() => undefined);
    // S'assurer que le compte u_admin possède bien l'email de Loïc en whitelist par défaut s'il n'en a pas
    await db
      .prepare(
        `UPDATE users
         SET email = COALESCE(email, 'loic.alcantara@gmail.com'),
             name = CASE WHEN name = 'Admin' THEN 'Loïc Alcantara' ELSE name END,
             invite_code = COALESCE(invite_code, 'inv_' || lower(hex(randomblob(16))))
         WHERE id = 'u_admin'`,
      )
      .run()
      .catch(() => undefined);
    await db
      .prepare(
        `UPDATE users
         SET email = COALESCE(email, 'closer1@agence.local'),
             invite_code = COALESCE(invite_code, 'inv_' || lower(hex(randomblob(16))))
         WHERE id = 'u_closer1'`,
      )
      .run()
      .catch(() => undefined);

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS available_models (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        provider          TEXT NOT NULL,
        model_id          TEXT NOT NULL,
        display_name      TEXT NOT NULL,
        description       TEXT,
        supports_vision   INTEGER NOT NULL DEFAULT 1,
        supports_thinking INTEGER NOT NULL DEFAULT 0,
        is_flagship       INTEGER NOT NULL DEFAULT 1,
        speed             TEXT DEFAULT 'fast',
        cost_tier         TEXT DEFAULT 'eco',
        context_window    TEXT DEFAULT '1M',
        recommended_for   TEXT DEFAULT 'all',
        updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(provider, model_id)
      )
    `).run().catch(() => undefined);

    const cfModels = [
      ["cloudflare", "@cf/meta/llama-3.1-8b-instruct-fp8", "Meta Llama 3.1 8B FP8 (Cloudflare Workers AI - 0€)", "Modèle ultrarapide hébergé nativement sur GPUs Cloudflare. 10 000 neurones/jour offerts. Idéal battlecards et pitchs commerciaux instantanés.", 0, 0, 1, "ultra", "eco", "128k tokens", "battlecard,audit"],
      ["cloudflare", "@cf/meta/llama-3.3-70b-instruct-fp8-fast", "Meta Llama 3.3 70B Fast (Cloudflare Workers AI)", "Flagship open-weights Meta sur GPUs Cloudflare. Puissance rédactionnelle maximale.", 0, 0, 1, "fast", "standard", "128k tokens", "battlecard,demo"],
      ["cloudflare", "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b", "DeepSeek R1 32B (Cloudflare Workers AI)", "Raisonnement stratégique avec chaîne de pensée sur GPUs Cloudflare.", 0, 1, 1, "deep", "standard", "64k tokens", "audit,battlecard"],
    ];

    for (const m of cfModels) {
      await db.prepare(`
        INSERT INTO available_models
        (provider, model_id, display_name, description, supports_vision, supports_thinking, is_flagship, speed, cost_tier, context_window, recommended_for)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
        ON CONFLICT(provider, model_id) DO UPDATE SET
          display_name = excluded.display_name,
          description = excluded.description,
          is_flagship = excluded.is_flagship,
          speed = excluded.speed,
          cost_tier = excluded.cost_tier,
          context_window = excluded.context_window,
          recommended_for = excluded.recommended_for
      `).bind(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8], m[9], m[10]).run().catch(() => undefined);
    }

    migrationChecked = AUTH_SCHEMA_VERSION;
  } catch {
    // Ignore
  }
}

/** Utilisateur actif correspondant au cookie de session, ou null (visiteur anonyme). */
export async function getSessionUser(c: Context<AppEnv>): Promise<User | null> {
  const token = getCookie(c, COOKIE);
  if (!token) return null;
  return c.env.DB.prepare(
    "SELECT id, name, email, invite_code, role, is_active, phone_quota_weekly, allowed_opportunities, allowed_channels FROM users WHERE access_token = ? AND is_active = 1",
  )
    .bind(token)
    .first<User>();
}

/** Authentifie via cookie HttpOnly contenant le access_token de l'utilisateur. */
export const requireUser =
  (role?: Role, mode: "page" | "api" = "api"): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    await ensureAuthSchema(c.env.DB);
    const user = await getSessionUser(c);
    if (!user) return mode === "page" ? c.redirect("/login") : c.json({ error: "unauthorized" }, 401);
    if (role && user.role !== role && user.role !== "admin") return c.json({ error: "forbidden" }, 403);
    c.set("user", user);
    await next();
  };

/** Génère un jeton hexadécimal aléatoire de `byteLength` octets. */
export function generateRandomHex(byteLength = 24): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Hache un mot de passe avec PBKDF2-SHA256 (Web Crypto API compatible Cloudflare Workers & Node 20). */
export async function hashPassword(password: string, saltHex?: string): Promise<string> {
  const salt = saltHex || generateRandomHex(16);
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]);
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: enc.encode(salt),
      iterations: 50000,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );
  const hashArray = Array.from(new Uint8Array(derivedBits));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `pbkdf2$${salt}$${hashHex}`;
}

/** Vérifie un mot de passe contre un hash stocké `pbkdf2$salt$hash`. */
export async function verifyPassword(password: string, storedHash: string | null | undefined): Promise<boolean> {
  if (!password || !storedHash || !storedHash.startsWith("pbkdf2$")) return false;
  const parts = storedHash.split("$");
  if (parts.length !== 3) return false;
  const salt = parts[1];
  const computed = await hashPassword(password, salt);
  return bearerMatches(`Bearer ${computed}`, storedHash);
}

/** Comparaison à temps constant du Bearer token de sync. */
export function bearerMatches(header: string | undefined, secret: string): boolean {
  if (!header || !secret) return false;
  const given = header.replace(/^Bearer\s+/i, "");
  const enc = new TextEncoder();
  const a = enc.encode(given);
  const b = enc.encode(secret);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}
