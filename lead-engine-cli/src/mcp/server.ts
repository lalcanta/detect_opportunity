import { getOpportunityOrDefault } from "../../../shared/opportunities";
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
import { injectTracker } from "../generator/demoGenerator";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "../../..");
const WEB_DIR = path.resolve(ROOT_DIR, "lead-dashboard-web");
const REMOTE_APP_URL = "https://lead-dashboard-8bx.pages.dev";

// Les ids viennent de sha1 (hex) : on refuse tout le reste avant de les interpoler dans le SQL wrangler.
const LEAD_ID_RE = /^[a-f0-9]{8,64}$/;

function requireLeadId(value: unknown): string {
  const leadId = String(value || "").trim();
  if (!LEAD_ID_RE.test(leadId)) throw new Error("lead_id invalide (identifiant hexadécimal attendu)");
  return leadId;
}

// Seul le pixel d'ouverture est stocké : le bandeau prospect est ajouté au rendu par /demos/:id
// (qui le remplace par un badge « Aperçu interne » pour un closer connecté).
function withTracker(html: string, leadId: string): string {
  return html.includes("/api/tracker/open") ? html : injectTracker(html, leadId, REMOTE_APP_URL);
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
      const limit = Math.min(Math.max(Math.trunc(Number(args?.limit)) || 20, 1), 200);

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
      const leadId = requireLeadId(args?.lead_id);

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
      const leadId = requireLeadId(args?.lead_id);
      const rawHtml = String(args?.demo_html || "").trim();
      if (!rawHtml) throw new Error("demo_html requis");

      const infoSql = `SELECT company_name, opportunity_type FROM leads WHERE id = '${leadId}';`;
      const rawInfo = execSync(
        `npx wrangler d1 execute lead-dashboard-db --remote --json --command="${infoSql}"`,
        { cwd: WEB_DIR, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
      );
      const info = JSON.parse(rawInfo)[0]?.results?.[0] as { company_name: string; opportunity_type?: string } | undefined;
      if (!info) throw new Error(`Lead introuvable pour l'id : ${leadId}`);
      if (getOpportunityOrDefault(info.opportunity_type).proof.kind !== "demo_web") {
        // La preuve est un rapport déterministe et le lead attend un cold email : passer par la file + sync-queue.
        throw new Error("Lead dont la preuve est un rapport généré par prep (audit QA) : ne pas le remplacer (utiliser la file / sync-queue)");
      }
      const companyName = info.company_name;

      const finalHtml = withTracker(rawHtml, leadId);

      // Sauvegarde temporaire pour exécution SQL
      const sqlFile = path.resolve(ROOT_DIR, `tmp_mcp_update_${leadId}.sql`);
      const escapedHtml = finalHtml.replace(/'/g, "''");
      fs.writeFileSync(
        sqlFile,
        // Comme /api/sync : seul un lead encore en attente de génération change de statut (audit 1.1).
        `UPDATE leads SET demo_html = '${escapedHtml}',
           status = CASE WHEN status = 'pending_generation' THEN 'demo_ready' ELSE status END
         WHERE id = '${leadId}';`,
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
