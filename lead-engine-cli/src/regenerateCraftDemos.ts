import { assertKnownOptions } from "./utils/cliArgs";
import * as fs from "node:fs";
import { execSync } from "node:child_process";
import { generateCraftHtmlForLead } from "./craftTemplates";
import { injectTracker } from "./generator/demoGenerator";

const LEAD_ID_RE = /^[a-f0-9]{8,64}$/;

async function run() {
  assertKnownOptions({});
  console.log("=== RÉGÉNÉRATION ARTISANALE HAUTE COUTURE (MODE CLI) ===");
  const raw = fs.readFileSync("../scratch_leads.json", "utf8");
  const data = JSON.parse(raw);
  const leads = data[0]?.results || [];
  console.log(`\n${leads.length} leads à traiter en production...\n`);

  for (let i = 0; i < leads.length; i++) {
    const l = leads[i];
    if (!LEAD_ID_RE.test(String(l.id))) {
      console.error(`[SKIP] id invalide : ${l.id}`);
      continue;
    }
    console.log(`[${i + 1}/${leads.length}] Confection démo sur-mesure pour : ${l.company_name} (${l.city})`);
    const craftHtml = generateCraftHtmlForLead(l);
    // Le bandeau prospect est ajouté au rendu par /demos/:id : on ne stocke que le pixel d'ouverture.
    const finalHtml = injectTracker(craftHtml, l.id, "https://lead-dashboard-8bx.pages.dev");

    // Écriture du fichier temporaire pour D1
    const tmpFile = `tmp_demo_${l.id}.html`;
    fs.writeFileSync(tmpFile, finalHtml, "utf8");

    // Mise à jour SQL dans D1 avec paramètre sécurisé
    const sqlFile = `tmp_update_${l.id}.sql`;
    const escapedHtml = finalHtml.replace(/'/g, "''");
    fs.writeFileSync(sqlFile, `UPDATE leads SET demo_html = '${escapedHtml}', status = CASE WHEN status = 'pending_generation' THEN 'demo_ready' ELSE status END WHERE id = '${l.id}';`, "utf8");

    try {
      execSync(`npx --prefix ../lead-dashboard-web wrangler d1 execute lead-dashboard-db --remote --file=${sqlFile}`, {
        stdio: "pipe"
      });
      console.log(`✔ Démo publiée avec succès pour ${l.company_name} (${finalHtml.length} car.)\n`);
    } catch (err: any) {
      console.error(`Erreur sur ${l.company_name} :`, err?.message || err);
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
      if (fs.existsSync(sqlFile)) fs.unlinkSync(sqlFile);
    }
  }

  console.log("🎉 Toutes les démos ont été régénérées avec une direction artistique d'exception !");
}

run().catch(console.error);
