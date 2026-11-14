import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findUnknownOption, suggestOption } from "../utils/cliArgs";
import { PREP_CLI_OPTIONS, parsePrepArgs } from "../prepScan";
import { SCAN_CLI_OPTIONS } from "../utils/scanCliOptions";

const SPEC = { values: ["--query", "--opportunity", "--lat", "--website-filter"], flags: ["--cdp", "--dry-run"] };

describe("findUnknownOption", () => {
  it("suggère --opportunity pour --opportunity_type", () => {
    const msg = findUnknownOption(["--query", "x", "--opportunity_type", "seo"], SPEC);
    assert.ok(msg);
    assert.match(msg, /Option inconnue : --opportunity_type\./);
    assert.match(msg, /Options valides : .*--opportunity/);
    assert.match(msg, /Vouliez-vous dire --opportunity \?/);
  });

  it("suggère l'option au même mot à _/- près et par faute de frappe", () => {
    assert.equal(suggestOption("--website_filter", ["--website-filter", "--cdp"]), "--website-filter");
    assert.equal(suggestOption("--dryrun", ["--dry-run", "--cdp"]), "--dry-run");
    assert.equal(suggestOption("--zzzzzzzz", ["--dry-run", "--cdp"]), null);
  });

  it("accepte les options valides, y compris celles de config.ts et --help", () => {
    assert.equal(findUnknownOption(["--query", "x", "--cdp", "--dry-run", "--prod", "--remote", "--local", "--help"], SPEC), null);
    assert.equal(findUnknownOption(["--opportunity=seo"], SPEC), null);
  });

  it("une valeur commençant par un tiret n'est pas prise pour une option", () => {
    assert.equal(findUnknownOption(["--lat", "-1.5", "--query", "-bizarre"], SPEC), null);
  });

  it("une option sans valeur ne consomme pas le mot suivant", () => {
    assert.match(findUnknownOption(["--cdp", "--inconnue"], SPEC) ?? "", /Option inconnue : --inconnue/);
  });

  it("accepte toutes les options historiques de prep", () => {
    const all = [...(PREP_CLI_OPTIONS.values ?? []).flatMap((o) => [o, "v"]), ...(PREP_CLI_OPTIONS.flags ?? [])];
    assert.equal(findUnknownOption(all, PREP_CLI_OPTIONS), null);
  });
});

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (file: string): string => readFileSync(path.join(srcDir, file), "utf8");
const declared = (spec: { values?: string[]; flags?: string[] }): Set<string> => new Set([...(spec.values ?? []), ...(spec.flags ?? [])]);

describe("points d'entrée : option inconnue (sans rien exécuter)", () => {
  const LISTES = { scan: SCAN_CLI_OPTIONS, prep: PREP_CLI_OPTIONS, "sans option propre": {} };
  for (const [nom, liste] of Object.entries(LISTES)) {
    it(`${nom} : --opportunity_type est refusé`, () => {
      assert.match(findUnknownOption(["--opportunity_type", "seo"], liste) ?? "", /Option inconnue : --opportunity_type/);
    });
  }

  it("scan : toutes les options lues par parseArgs de index.ts sont déclarées (et inversement)", () => {
    const src = source("index.ts");
    const bloc = src.slice(src.indexOf("options: {"), src.indexOf("strict:"));
    const lues = new Set([...bloc.matchAll(/^\s+"?([\w-]+)"?: \{ type/gm)].map((m) => `--${m[1]}`));
    assert.ok(lues.size >= 10, "options de parseArgs introuvables dans index.ts");
    assert.deepEqual([...lues].sort(), [...declared(SCAN_CLI_OPTIONS)].sort());
    assert.match(src, /assertKnownOptions\(SCAN_CLI_OPTIONS/);
  });

  it("prep : tous les littéraux comparés à un argument dans parsePrepArgs sont déclarés (et inversement)", () => {
    const src = source("prepScan.ts");
    const corps = src.slice(src.indexOf("export function parsePrepArgs"), src.indexOf("function parseArgs()"));
    const lus = new Set([...corps.matchAll(/arg === "(-{1,2}[\w-]+)"/g)].map((m) => m[1] as string));
    assert.ok(lus.size >= 15, "littéraux de parsePrepArgs introuvables");
    assert.deepEqual([...lus].sort(), [...declared(PREP_CLI_OPTIONS)].sort());
    assert.match(src, /assertKnownOptions\(PREP_CLI_OPTIONS/);
  });

  it("les autres points d'entrée appellent la garde et ne lisent aucune option propre", () => {
    for (const file of ["syncQueue.ts", "worker.ts", "regenerateExistingLeads.ts", "regenerateCraftDemos.ts"]) {
      const src = source(file);
      assert.match(src, /assertKnownOptions\(\{\}\)/, `${file} sans garde`);
      assert.doesNotMatch(src, /process\.argv(?!\[1\])/, `${file} lit process.argv`);
    }
  });
});

describe("parsePrepArgs", () => {
  it("lit --opportunity=seo_local comme --opportunity seo_local", () => {
    assert.equal(parsePrepArgs(["--opportunity=seo_local"]).opportunity_type, "seo_local");
    assert.equal(parsePrepArgs(["--opportunity", "seo_local"]).opportunity_type, "seo_local");
  });

  it("coupe au premier = (la valeur peut en contenir) et lit les autres options", () => {
    const o = parsePrepArgs(["--query=a=b", "--limit=3", "--website-filter=no_website", "--cdp"]);
    assert.equal(o.query, "a=b");
    assert.equal(o.limit, 3);
    assert.equal(o.website_filter, "no_website");
    assert.equal(o.cdp, true);
  });
});
