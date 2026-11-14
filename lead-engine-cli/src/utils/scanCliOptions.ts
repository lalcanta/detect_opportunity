import type { CliOptionSpec } from "./cliArgs";

/** Options acceptées par `npm run scan` (`src/index.ts`) ; toute autre arrête la commande. */
export const SCAN_CLI_OPTIONS: CliOptionSpec = {
  values: ["--query", "--domains", "--city", "--limit", "--opportunity", "--target", "--website-filter", "--lat", "--lng", "--radius"],
  flags: ["--cdp", "--dry-run"],
};
