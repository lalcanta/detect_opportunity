import * as fs from "node:fs";
import { execSync } from "node:child_process";
import { generateCraftHtmlForLead } from "./craftTemplates";

function wrapWithTracker(html: string, leadId: string, companyName: string, remoteAppUrl: string): string {
  const trackerSnippet = `<script>(function(){try{var k="seen_${leadId}";if(sessionStorage.getItem(k))return;sessionStorage.setItem(k,"1");fetch("${remoteAppUrl}"+"/api/tracker/open?leadId=${leadId}",{method:"GET",mode:"no-cors",keepalive:true,cache:"no-store"}).catch(function(){});}catch(e){}})();</script>

<!-- LeadEngine Interactive Prospect Bar -->
<div id="le-floating-bar" style="position:fixed;bottom:16px;right:16px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:calc(100vw - 32px);">
  <div style="background:rgba(9,9,11,0.94);backdrop-filter:blur(10px);color:#fff;border:1px solid rgba(255,255,255,0.14);border-radius:16px;padding:10px 14px;box-shadow:0 20px 25px -5px rgba(0,0,0,0.4);display:flex;flex-wrap:wrap;align-items:center;gap:10px;font-size:12px;">
    <div style="display:flex;align-items:center;gap:8px;">
      <span style="display:inline-block;width:8px;height:8px;border-radius:9999px;background:#10b981;"></span>
      <span style="font-weight:600;color:#e4e4e7;">Préparé pour <strong style="color:#fff;">${companyName}</strong></span>
      <span style="background:rgba(255,255,255,0.1);color:#fde68a;padding:2px 7px;border-radius:6px;font-size:11px;font-weight:600;">⏳ Expire dans 5j</span>
    </div>
    <button id="le-btn-like" type="button" onclick="(function(btn){btn.disabled=true;btn.textContent='✔ Intérêt transmis ! Nous revenons vers vous.';btn.style.background='#059669';fetch('/api/tracker/interest?leadId=${leadId}',{method:'POST'}).catch(function(){});})(this)" style="background:#4f46e5;color:#fff;border:none;border-radius:10px;padding:7px 12px;font-size:12px;font-weight:700;cursor:pointer;transition:all .15s;">
      ✅ Ce design me plaît, on en discute
    </button>
    <button type="button" onclick="document.getElementById('le-floating-bar').style.display='none'" title="Masquer ce bandeau" style="background:transparent;color:#a1a1aa;border:none;padding:4px 6px;font-size:14px;cursor:pointer;line-height:1;">✕</button>
  </div>
</div>`;

  if (html.includes("</body>")) {
    return html.replace("</body>", `${trackerSnippet}\n</body>`);
  }
  return `${html}\n${trackerSnippet}\n</body>\n</html>`;
}

async function run() {
  console.log("=== RÉGÉNÉRATION ARTISANALE HAUTE COUTURE (MODE CLI) ===");
  const raw = fs.readFileSync("../scratch_leads.json", "utf8");
  const data = JSON.parse(raw);
  const leads = data[0]?.results || [];
  console.log(`\n${leads.length} leads à traiter en production...\n`);

  for (let i = 0; i < leads.length; i++) {
    const l = leads[i];
    console.log(`[${i + 1}/${leads.length}] Confection démo sur-mesure pour : ${l.company_name} (${l.city})`);
    const craftHtml = generateCraftHtmlForLead(l);
    const finalHtml = wrapWithTracker(craftHtml, l.id, l.company_name, "https://lead-dashboard-8bx.pages.dev");

    // Écriture du fichier temporaire pour D1
    const tmpFile = `tmp_demo_${l.id}.html`;
    fs.writeFileSync(tmpFile, finalHtml, "utf8");

    // Mise à jour SQL dans D1 avec paramètre sécurisé
    const sqlFile = `tmp_update_${l.id}.sql`;
    const escapedHtml = finalHtml.replace(/'/g, "''");
    fs.writeFileSync(sqlFile, `UPDATE leads SET demo_html = '${escapedHtml}', status = 'demo_ready' WHERE id = '${l.id}';`, "utf8");

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
