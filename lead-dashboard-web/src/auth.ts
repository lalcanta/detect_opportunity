import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import type { AppEnv, Role, User } from "./types";

const COOKIE = "lead_session";
export const SESSION_COOKIE = COOKIE;

const AUTH_SCHEMA_VERSION = 4;
let migrationChecked = 0;

/** Assure que les colonnes Whitelist / Invitation / Password / Expiration démo, execution_mode et la table scheduled_scans existent. */
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
      "ALTER TABLE scan_jobs ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'full_auto'",
      "ALTER TABLE scheduled_scans ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'full_auto'",
    ];
    for (const sql of alterCols) {
      await db.prepare(sql).run().catch(() => undefined);
    }

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
        opportunity_type TEXT NOT NULL DEFAULT 'website',
        website_filter  TEXT NOT NULL DEFAULT 'all',
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
             invite_code = COALESCE(invite_code, 'inv_admin_loic_initial')
         WHERE id = 'u_admin'`,
      )
      .run()
      .catch(() => undefined);
    await db
      .prepare(
        `UPDATE users
         SET email = COALESCE(email, 'closer1@agence.local'),
             invite_code = COALESCE(invite_code, 'inv_closer1_initial')
         WHERE id = 'u_closer1'`,
      )
      .run()
      .catch(() => undefined);
    migrationChecked = AUTH_SCHEMA_VERSION;
  } catch {
    // Ignore
  }
}

/** Authentifie via cookie HttpOnly contenant le access_token de l'utilisateur. */
export const requireUser =
  (role?: Role, mode: "page" | "api" = "api"): MiddlewareHandler<AppEnv> =>
  async (c, next) => {
    await ensureAuthSchema(c.env.DB);
    const token = getCookie(c, COOKIE);
    const user = token
      ? await c.env.DB.prepare(
          "SELECT id, name, email, invite_code, role, is_active, phone_quota_weekly, allowed_opportunities FROM users WHERE access_token = ? AND is_active = 1",
        )
          .bind(token)
          .first<User>()
      : null;
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
