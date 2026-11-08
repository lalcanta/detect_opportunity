import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const TEST_PORT = 8789;
export const TEST_BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
export const TEST_DB_DIR = "/tmp/lead-d1-test-state/v3/d1/miniflare-D1DatabaseObject";
export const TEST_DB_FILE = path.join(TEST_DB_DIR, "e7352547963de7050bd7d94658afc4fe78b61811b7815da12d90be8e863abf4d.sqlite");

/**
 * Réinitialise complètement la base SQLite dédiée aux tests fonctionnels.
 * Supprime les anciennes tables et réinjecte schema.sql + seed.sql de manière déterministe.
 * Ne touche JAMAIS à la base de travail (/tmp/lead-d1-state).
 */
export function resetTestDatabase(): void {
  fs.mkdirSync(TEST_DB_DIR, { recursive: true });

  const rootDir = path.resolve(__dirname, "..");
  const schemaPath = path.join(rootDir, "lead-dashboard-web/schema.sql");
  const seedPath = path.join(rootDir, "lead-dashboard-web/seed.sql");

  const resetSql = `
    PRAGMA foreign_keys = OFF;
    DROP TABLE IF EXISTS leads;
    DROP TABLE IF EXISTS users;
    DROP TABLE IF EXISTS model_settings;
    DROP TABLE IF EXISTS scan_jobs;
    DROP TABLE IF EXISTS token_usage;
    DROP TABLE IF EXISTS audit_benchmarks;
    DROP TABLE IF EXISTS available_models;
    PRAGMA foreign_keys = ON;
  `;

  execSync(`sqlite3 "${TEST_DB_FILE}" "${resetSql}"`, { stdio: "pipe" });
  execSync(`sqlite3 "${TEST_DB_FILE}" < "${schemaPath}"`, { stdio: "pipe" });
  execSync(`sqlite3 "${TEST_DB_FILE}" < "${seedPath}"`, { stdio: "pipe" });
}

/**
 * Vérifie si le serveur de test tourne sur TEST_PORT.
 */
export async function isTestServerRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${TEST_BASE_URL}/login`, { method: "GET", signal: AbortSignal.timeout(1000) });
    return res.status === 200 || res.status === 302;
  } catch {
    return false;
  }
}

/**
 * Démarre le serveur de test dédié sur le port 8789 s'il n'est pas déjà lancé.
 */
export async function ensureTestServer(): Promise<void> {
  if (await isTestServerRunning()) {
    resetTestDatabase();
    return;
  }

  resetTestDatabase();

  const rootDir = path.resolve(__dirname, "..");
  const dashboardDir = path.join(rootDir, "lead-dashboard-web");

  const child = spawn(
    "npx",
    [
      "wrangler",
      "pages",
      "dev",
      "public",
      "--port",
      String(TEST_PORT),
      "--ip",
      "127.0.0.1",
      "--d1=DB",
      "--compatibility-date=2024-11-01",
      "--persist-to=/tmp/lead-d1-test-state",
    ],
    {
      cwd: dashboardDir,
      detached: true,
      stdio: "ignore",
    }
  );
  child.unref();

  // Attendre jusqu'à 15 secondes que le serveur réponde
  const start = Date.now();
  while (Date.now() - start < 15000) {
    if (await isTestServerRunning()) {
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  throw new Error(`Impossible de démarrer le serveur de test sur ${TEST_BASE_URL} après 15 secondes`);
}
