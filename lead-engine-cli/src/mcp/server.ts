import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { detectArtDirection } from "./artDirectionEngine";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../..");
const WEB_DIR = path.resolve(ROOT_DIR, "lead-dashboard-web");
const REMOTE_APP_URL = "https://lead-dashboard-8bx.pages.dev";

function wrapWithTracker(html: string, leadId: string, companyName: string): string {
  const trackerSnippet = `<script>(function(){try{var k="seen_${leadId}";if(sessionStorage.getItem(k))return;sessionStorage.setItem(k,"1");fetch("${REMOTE_APP_URL}"+"/api/tracker/open?leadId=${leadId}",{method:"GET",mode:"no-cors",keepalive:true,cache:"no-store"}).catch(function(){});}catch(e){}})();</script>

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

// Outils MCP
const TOOLS: Tool[] = [
  {
    name: "leadengine_list_tasks",
    description: "Liste tous les leads de production qui attendent une génération ou régénération de démo / battlecard (pending_generation ou liste complète pour révision de design).",
    inputSchema: {
      type: "object",
      properties: {
        filter: {
          type: "string",
          enum: ["pending_only", "all"],
          description: "'pending_only' pour traiter uniquement les nouveaux leads en attente (0€ prep), ou 'all' pour voir l'ensemble des prospects existants.",
          default: "all",
        },
        limit: {
          type: "number",
          description: "Nombre maximum de leads à lister (défaut : 20)",
          default: 20,
        },
      },
    },
  },
  {
    name: "leadengine_get_task_context",
    description: "Fournit TOUT le contexte d'un artisan : données d'entreprise, avis réels, téléphone, ainsi que la DIRECTION ARTISTIQUE SUR-MESURE OBLIGATOIRE (palette Tailwind, typographie Google Fonts, et le code du composant interactif signature à intégrer).",
    inputSchema: {
      type: "object",
      properties: {
        lead_id: {
          type: "string",
          description: "L'identifiant unique du prospect (ex: '7d4a75e8e92f6d26')",
        },
      },
      required: ["lead_id"],
    },
  },
  {
    name: "leadengine_submit_assets",
    description: "Valide, injecte la barre prospect et publie le code HTML de la démo confectionnée directement dans la base Cloudflare D1 de production.",
    inputSchema: {
      type: "object",
      properties: {
        lead_id: {
          type: "string",
          description: "L'identifiant du prospect mis à jour",
        },
        demo_html: {
          type: "string",
          description: "Le code HTML5 Tailwind complet de la landing page avec ses composants interactifs.",
        },
        battlecard_data: {
          type: "object",
          description: "Données optionnelles de la battlecard (script d'appel closer, objections).",
        },
      },
      required: ["lead_id", "demo_html"],
    },
  },
];

const server = new Server(
  {
    name: "leadengine-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // 1. LIST TASKS
    if (name === "leadengine_list_tasks") {
      const filter = (args?.filter as string) || "all";
      const limit = Number(args?.limit) || 20;

      const whereClause = filter === "pending_only" ? "WHERE status = 'pending_generation'" : "";
      const sql = `SELECT id, company_name, activity, city, phone, website_url, google_rating, google_reviews_count, status, (demo_html IS NOT NULL AND length(demo_html) > 500) AS has_demo FROM leads ${whereClause} ORDER BY created_at DESC LIMIT ${limit};`;

      const raw = execSync(
        `npx wrangler d1 execute lead-dashboard-db --remote --json --command="${sql}"`,
        { cwd: WEB_DIR, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
      );
      const parsed = JSON.parse(raw);
      const rows = parsed[0]?.results || [];

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                count: rows.length,
                leads: rows.map((r: any) => ({
                  id: r.id,
                  company_name: r.company_name,
                  activity: r.activity,
                  city: r.city,
                  phone: r.phone,
                  google_rating: r.google_rating,
                  reviews_count: r.google_reviews_count,
                  status: r.status,
                  has_demo: Boolean(r.has_demo),
                  view_url: `${REMOTE_APP_URL}/demos/${r.id}`,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // 2. GET TASK CONTEXT
    if (name === "leadengine_get_task_context") {
      const leadId = String(args?.lead_id || "").trim();
      if (!leadId) throw new Error("lead_id requis");

      const sql = `SELECT id, company_name, activity, city, phone, email, website_url, google_rating, google_reviews_count, audit_data, status FROM leads WHERE id = '${leadId}';`;
      const raw = execSync(
        `npx wrangler d1 execute lead-dashboard-db --remote --json --command="${sql}"`,
        { cwd: WEB_DIR, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
      );
      const parsed = JSON.parse(raw);
      const lead = parsed[0]?.results?.[0];
      if (!lead) throw new Error(`Lead introuvable pour l'id : ${leadId}`);

      let auditParsed = {};
      if (lead.audit_data) {
        try {
          auditParsed = JSON.parse(lead.audit_data);
        } catch {}
      }

      // Calcul de la direction artistique sur-mesure
      const artDirection = detectArtDirection(lead.activity, lead.company_name);

      const instructions = `CONSIGNES DE FABRICATION HAUTE COUTURE (Frontend Craft) :
1. Produisez un document HTML5 autonome avec Tailwind CSS CDN (script src="https://cdn.tailwindcss.com") et les icônes Lucide (https://unpkg.com/lucide@latest).
2. Utilisez OBLIGATOIREMENT la typographie et la palette de la direction artistique ci-jointe (${artDirection.archetypeName}).
3. Intégrez OBLIGATOIREMENT le composant interactif signature fourni (${artDirection.signatureComponent.name}) avec son fonctionnement interactif en pur JavaScript sans bibliothèque lourde.
4. Intégrez le bandeau sticky mobile pour appel direct ('tel:${lead.phone || ""}') et WhatsApp.
5. Respectez les coordonnées locales réelles : ${lead.company_name} à ${lead.city || "Ariège"}, téléphone : ${lead.phone || "Non renseigné"}, note Google : ${lead.google_rating || "4.8"}/5.
6. Ne mettez AUCUN placeholder générique ("Lorem ipsum", etc.). Le résultat doit être prêt à présenter au client.`;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                lead: {
                  id: lead.id,
                  company_name: lead.company_name,
                  activity: lead.activity,
                  city: lead.city,
                  phone: lead.phone,
                  email: lead.email,
                  website_url: lead.website_url,
                  google_rating: lead.google_rating,
                  reviews_count: lead.google_reviews_count,
                  audit: auditParsed,
                },
                art_direction: artDirection,
                guidelines: instructions,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // 3. SUBMIT ASSETS
    if (name === "leadengine_submit_assets") {
      const leadId = String(args?.lead_id || "").trim();
      const rawHtml = String(args?.demo_html || "").trim();
      if (!leadId || !rawHtml) throw new Error("lead_id et demo_html requis");

      // Récupérer le nom de l'entreprise pour le bandeau prospect
      const infoSql = `SELECT company_name FROM leads WHERE id = '${leadId}';`;
      const rawInfo = execSync(
        `npx wrangler d1 execute lead-dashboard-db --remote --json --command="${infoSql}"`,
        { cwd: WEB_DIR, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
      );
      const companyName = JSON.parse(rawInfo)[0]?.results?.[0]?.company_name || "Votre Entreprise";

      // Injection du script de tracking et du bandeau interactif
      const finalHtml = wrapWithTracker(rawHtml, leadId, companyName);

      // Sauvegarde temporaire pour exécution SQL
      const sqlFile = path.resolve(ROOT_DIR, `tmp_mcp_update_${leadId}.sql`);
      const escapedHtml = finalHtml.replace(/'/g, "''");
      fs.writeFileSync(
        sqlFile,
        `UPDATE leads SET demo_html = '${escapedHtml}', status = 'demo_ready' WHERE id = '${leadId}';`,
        "utf8"
      );

      try {
        execSync(
          `npx wrangler d1 execute lead-dashboard-db --remote --file=${sqlFile}`,
          { cwd: WEB_DIR, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
        );
      } finally {
        if (fs.existsSync(sqlFile)) fs.unlinkSync(sqlFile);
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ok: true,
              lead_id: leadId,
              company_name: companyName,
              demo_url: `${REMOTE_APP_URL}/demos/${leadId}`,
              message: `✔ Démo mise à jour et publiée en production avec succès pour ${companyName} (${finalHtml.length} caractères).`,
            }),
          },
        ],
      };
    }

    throw new Error(`Outil inconnu : ${name}`);
  } catch (err: any) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Erreur MCP : ${err?.message || String(err)}`,
        },
      ],
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Serveur MCP LeadEngine démarré sur stdio.");
}

main().catch((err) => {
  console.error("Erreur fatale serveur MCP :", err);
  process.exit(1);
});
