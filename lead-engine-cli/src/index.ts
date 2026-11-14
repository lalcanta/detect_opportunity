import { parseArgs } from "node:util";
import { loadConfig } from "./config";
import { ModelRouter } from "./llm/modelRouter";
import { runScan } from "./scanRunner";
import { assertKnownOptions } from "./utils/cliArgs";
import { SCAN_CLI_OPTIONS } from "./utils/scanCliOptions";

import { ALL_OPPORTUNITY_IDS, DEFAULT_DIRECT_DOMAINS_OPPORTUNITY_ID, DEFAULT_OPPORTUNITY_ID } from "../../shared/opportunities";

const USAGE = `Usage: npm run scan -- --query "plombier" --city "Lyon" [--limit 10] [--opportunity website] [--website-filter all] [--lat 45.76 --lng 4.83 --radius 10] [--cdp] [--dry-run]
  --opportunity     Type d'opportunité : ${ALL_OPPORTUNITY_IDS.join(" | ")}
  --website-filter  Filtre présence web : all | no_website | has_website
  --domains         Liste de domaines en direct sans Maps (ex: --domains "digidop.fr, studio.fr")
  --cdp             Se connecte au Chrome ouvert avec --remote-debugging-port=9222
  --dry-run         Ne synchronise pas : écrit les résultats dans ./output
Pour piloter les scans depuis le dashboard : npm run worker`;

async function main(): Promise<void> {
  assertKnownOptions(SCAN_CLI_OPTIONS, USAGE);
  const { values } = parseArgs({
    options: {
      query: { type: "string" },
      domains: { type: "string" },
      city: { type: "string", default: "France" },
      limit: { type: "string", default: "10" },
      opportunity: { type: "string" },
      target: { type: "string" },
      "website-filter": { type: "string", default: "all" },
      lat: { type: "string" },
      lng: { type: "string" },
      radius: { type: "string" },
      cdp: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
    },
    strict: false,
  });

  const queryStr = values.domains ? `domains:${String(values.domains)}` : String(values.query ?? "");
  if (!queryStr) {
    console.error(USAGE);
    process.exit(1);
  }
  const oppType = String(values.target || values.opportunity || (values.domains ? DEFAULT_DIRECT_DOMAINS_OPPORTUNITY_ID : DEFAULT_OPPORTUNITY_ID));
  const wfRaw = String(values["website-filter"] ?? "all");
  const websiteFilter = wfRaw === "no_website" || wfRaw === "has_website" ? wfRaw : "all";

  const cfg = loadConfig();
  const router = new ModelRouter(cfg);
  await runScan(
    {
      query: queryStr,
      city: String(values.city ?? "France"),
      limit: Math.max(1, Number.parseInt(String(values.limit ?? "10"), 10) || 10),
      opportunity_type: oppType,
      website_filter: websiteFilter,
      lat: values.lat ? Number.parseFloat(String(values.lat)) : undefined,
      lng: values.lng ? Number.parseFloat(String(values.lng)) : undefined,
      radius_km: values.radius ? Number.parseFloat(String(values.radius)) : undefined,
      cdp: Boolean(values.cdp),
      dryRun: Boolean(values["dry-run"]),
    },
    cfg,
    router,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
