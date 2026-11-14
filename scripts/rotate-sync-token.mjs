#!/usr/bin/env node
/**
 * Change le jeton partagé entre le worker et le CRM (`SYNC_SECRET_TOKEN`), sans jamais l'afficher :
 *   1. génère un jeton aléatoire ;
 *   2. le pose en secret Cloudflare Pages (`lead-dashboard`) avec wrangler ;
 *   3. le recopie dans `lead-engine-cli/.env` et `lead-dashboard-web/.dev.vars` (seulement s'ils existent).
 *
 * Lancement, depuis la racine et par le propriétaire des secrets : `npm run secret:rotate-sync`.
 * Ensuite : redéployer la production (le secret n'est lu qu'au déploiement suivant), puis redémarrer le worker.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const NAME = "SYNC_SECRET_TOKEN";
const PROJECT = "lead-dashboard";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = join(ROOT, "lead-dashboard-web");
const LOCAL_FILES = [join(ROOT, "lead-engine-cli", ".env"), join(WEB, ".dev.vars")];

/** Remplace la ligne `NAME=…` (ou l'ajoute à la fin) ; le reste du fichier est conservé tel quel. */
export function withToken(content, token) {
  const line = `${NAME}=${token}`;
  const re = new RegExp(`^[ \\t]*(?:export[ \\t]+)?${NAME}[ \\t]*=.*$`, "m");
  if (re.test(content)) return content.replace(re, line);
  const sep = content === "" || content.endsWith("\n") ? "" : "\n";
  return `${content}${sep}${line}\n`;
}

async function main() {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 22) {
    console.error(`Node 22 requis (wrangler 4), Node ${process.versions.node} actif : lance \`nvm use\` puis recommence.`);
    process.exit(1);
  }
  const wrangler = join(WEB, "node_modules", ".bin", "wrangler");
  if (!existsSync(wrangler)) {
    console.error("wrangler introuvable : lance `npm --prefix lead-dashboard-web install`.");
    process.exit(1);
  }

  if (!process.argv.includes("--yes")) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(
      `Remplacer ${NAME} en production (${PROJECT}) et dans les fichiers locaux ? Le worker devra être redémarré. (o/N) `,
    );
    rl.close();
    if (!/^o(ui)?$/i.test(answer.trim())) {
      console.log("Rien n'a été changé.");
      return;
    }
  }

  const token = `sync_${randomBytes(32).toString("hex")}`;

  console.log(`→ Secret Cloudflare ${NAME} (${PROJECT})…`);
  const put = spawnSync(wrangler, ["pages", "secret", "put", NAME, "--project-name", PROJECT], {
    cwd: WEB,
    input: token,
    stdio: ["pipe", "inherit", "inherit"],
  });
  if (put.status !== 0) {
    console.error("Échec de wrangler : la production et les fichiers locaux n'ont pas été modifiés.");
    process.exit(1);
  }

  for (const file of LOCAL_FILES) {
    const rel = file.slice(ROOT.length + 1);
    if (!existsSync(file)) {
      console.log(`→ ${rel} absent, ignoré.`);
      continue;
    }
    writeFileSync(file, withToken(readFileSync(file, "utf8"), token));
    console.log(`→ ${rel} mis à jour.`);
  }

  console.log(`
Jeton changé (jamais affiché). Il reste deux étapes :
  1. Redéployer la production pour que le CRM lise le nouveau secret :
     Cloudflare → Workers & Pages → ${PROJECT} → Deployments → dernier déploiement de production → « Retry deployment ».
  2. Redémarrer le worker : arrêter \`npm run worker:prod\` puis le relancer.
Entre les deux, le worker est refusé par le CRM (401) : c'est normal.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
