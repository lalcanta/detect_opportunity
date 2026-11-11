import { readFile, writeFile } from "node:fs/promises";
import { existsSync, unlinkSync } from "node:fs";
import type { Config } from "./config";
import type { ModelRouter } from "./llm/modelRouter";
import { DEMO_SYSTEM_PROMPT, finalizeDemoHtml } from "./generator/demoGenerator";
import { API_LOCK_FILE, API_USAGE_FILE, syncQueue } from "./syncQueue";
import { log, stripCodeFences } from "./utils/helpers";
import type { TokenUsageRecord } from "./types";

/**
 * Génération par API des leads préparés (queue/pending) : le worker remplit les mêmes fichiers que l'agent
 * (demo.html, battlecard.json) à partir des consignes prompt_demo.md / prompt_battlecard.md, puis synchronise.
 * Déclenché depuis l'onglet File d'attente du dashboard (job « generate »).
 */

const PENDING_DIR = "queue/pending";
/** Guide de conception lu par l'agent : le modèle API reçoit le même, pour des démos comparables. */
const CRAFT_GUIDE_PATH = "../.agents/skills/artisan-frontend-craft/SKILL.md";

export interface ApiGenerationHooks {
  onProgress?: (processed: number, total: number, message: string) => Promise<boolean | void>;
}

export interface ApiGenerationResult {
  processed: number;
  total: number;
  cancelled: boolean;
  failures: { id: string; reason: string }[];
}

/** Consigne de démo pour un modèle API : celle de l'agent, sans les instructions d'écriture de fichier. */
export function buildApiDemoPrompt(agentPrompt: string, craftGuide: string | null): string {
  return [
    "Voici la consigne de démo préparée pour ce prospect. Applique-la intégralement.",
    "Tu ne peux pas écrire de fichier : réponds UNIQUEMENT avec le code HTML complet (<!DOCTYPE html> ... </html>), sans bloc markdown ni commentaire avant ou après.",
    "",
    agentPrompt.trim(),
    craftGuide ? `\n---\n\n# Guide de conception à respecter (checklist qualité)\n\n${craftGuide.replace(/^---[\s\S]*?---\s*/, "").trim()}` : "",
  ].join("\n");
}

/** Consigne de battlecard pour un modèle API. */
export function buildApiBattlecardPrompt(agentPrompt: string): string {
  return [
    agentPrompt.trim(),
    "",
    "Tu ne peux pas écrire de fichier : réponds UNIQUEMENT avec le JSON valide demandé, sans bloc markdown ni texte autour.",
  ].join("\n");
}

function imageOf(buf: Buffer): { mimeType: string; data: Buffer } {
  const png = buf.length > 4 && buf[0] === 0x89 && buf[1] === 0x50;
  return { mimeType: png ? "image/png" : "image/jpeg", data: buf };
}

async function readUsage(dir: string): Promise<TokenUsageRecord[]> {
  try {
    const raw = JSON.parse(await readFile(`${dir}/${API_USAGE_FILE}`, "utf-8"));
    return Array.isArray(raw) ? (raw as TokenUsageRecord[]) : [];
  } catch {
    return [];
  }
}

/** Remplit les fichiers manquants d'un lead de la file. Lève une erreur lisible si la génération échoue. */
async function generateOne(id: string, cfg: Config, router: ModelRouter, craftGuide: string | null, step: (m: string) => Promise<void>): Promise<void> {
  const dir = `${PENDING_DIR}/${id}`;
  const meta = JSON.parse(await readFile(`${dir}/meta.json`, "utf-8")) as { company_name?: string; logoUrl?: string | null };
  const usage = await readUsage(dir);

  if (!existsSync(`${dir}/demo.html`)) {
    if (!existsSync(`${dir}/prompt_demo.md`)) throw new Error("prompt_demo.md absent");
    await step("🎨 Génération de la démo par API...");
    const screenshot = existsSync(`${dir}/screenshot.png`) ? await readFile(`${dir}/screenshot.png`) : null;
    const { text } = await router.generate({
      task: "demo",
      prompt: buildApiDemoPrompt(await readFile(`${dir}/prompt_demo.md`, "utf-8"), craftGuide),
      system: DEMO_SYSTEM_PROMPT,
      images: screenshot ? [imageOf(screenshot)] : undefined,
      usageSink: usage,
    });
    const html = finalizeDemoHtml(text, { leadId: id, logoUrl: meta.logoUrl ?? null, remoteAppUrl: cfg.REMOTE_APP_URL });
    if (!/<html[\s>]/i.test(html) || html.length < 2000) throw new Error(`démo inexploitable (${html.length} caractères)`);
    await writeFile(`${dir}/demo.html`, html);
    await writeFile(`${dir}/${API_USAGE_FILE}`, JSON.stringify(usage, null, 2));
  }

  if (!existsSync(`${dir}/battlecard.json`)) {
    if (!existsSync(`${dir}/prompt_battlecard.md`)) throw new Error("prompt_battlecard.md absent");
    await step("🧠 Génération de la battlecard par API...");
    const { text } = await router.generate({
      task: "battlecard",
      prompt: buildApiBattlecardPrompt(await readFile(`${dir}/prompt_battlecard.md`, "utf-8")),
      json: true,
      usageSink: usage,
    });
    const json = stripCodeFences(text);
    try {
      JSON.parse(json);
    } catch {
      throw new Error("battlecard renvoyée en JSON invalide");
    }
    await writeFile(`${dir}/battlecard.json`, json);
    await writeFile(`${dir}/${API_USAGE_FILE}`, JSON.stringify(usage, null, 2));
  }
}

export async function generateQueuedLeadsViaApi(
  ids: string[],
  cfg: Config,
  router: ModelRouter,
  hooks: ApiGenerationHooks = {},
): Promise<ApiGenerationResult> {
  const total = ids.length;
  const failures: { id: string; reason: string }[] = [];
  if (router.isZeroCostMode()) {
    throw new Error("Coupe-circuit 0 € actif : aucune génération par API possible. Désactivez-le dans l'onglet Modèles ou laissez l'agent traiter la file.");
  }
  const craftGuide = existsSync(CRAFT_GUIDE_PATH) ? await readFile(CRAFT_GUIDE_PATH, "utf-8") : null;

  const ready: string[] = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!;
    const dir = `${PENDING_DIR}/${id}`;
    const prefix = `[${i + 1}/${total}] ${id.slice(0, 8)}`;
    if ((await hooks.onProgress?.(i, total, `${prefix} : démarrage`)) === false) return { processed: i, total, cancelled: true, failures };
    if (!existsSync(`${dir}/meta.json`)) {
      const reason = "dossier absent de queue/pending sur ce Mac (déjà synchronisé, ou préparé sur une autre machine)";
      failures.push({ id, reason });
      await hooks.onProgress?.(i, total, `⚠️ ${prefix} : ${reason}`);
      continue;
    }
    const lock = `${dir}/${API_LOCK_FILE}`;
    await writeFile(lock, new Date().toISOString());
    try {
      await generateOne(id, cfg, router, craftGuide, async (m) => {
        await hooks.onProgress?.(i, total, `${prefix} : ${m}`);
      });
      ready.push(id);
    } catch (err) {
      const reason = (err as Error).message.slice(0, 200);
      failures.push({ id, reason });
      log("generate", `✘ ${id} : ${reason}`);
      await hooks.onProgress?.(i, total, `⚠️ ${prefix} : ${reason}`);
    } finally {
      if (existsSync(lock)) unlinkSync(lock);
    }
  }

  if (ready.length) {
    await hooks.onProgress?.(ready.length, total, `☁️ Synchronisation de ${ready.length} lead(s) vers le CRM...`);
    const sync = await syncQueue({ only: ready, quiet: true });
    for (const w of sync.waiting) failures.push({ id: w.id, reason: `resté en attente : ${w.reason}` });
    for (const f of sync.failed) failures.push(f);
    return { processed: sync.synced.length, total, cancelled: false, failures };
  }
  return { processed: 0, total, cancelled: false, failures };
}
