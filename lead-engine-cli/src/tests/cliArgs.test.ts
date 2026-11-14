import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findUnknownOption, suggestOption } from "../utils/cliArgs";
import { PREP_CLI_OPTIONS } from "../prepScan";

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

describe("points d'entrée : option inconnue", () => {
  const cliDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const tsx = path.join(cliDir, "node_modules/.bin/tsx");
  for (const entry of ["index.ts", "prepScan.ts", "syncQueue.ts", "worker.ts", "regenerateExistingLeads.ts"]) {
    it(`${entry} s'arrête avant toute action`, () => {
      const res = spawnSync(tsx, [`src/${entry}`, "--opportunity_type", "seo"], {
        cwd: cliDir,
        encoding: "utf8",
        timeout: 60_000,
        env: { PATH: process.env.PATH, HOME: process.env.HOME },
      });
      assert.equal(res.status, 1);
      assert.match(res.stderr, /Option inconnue : --opportunity_type/);
      assert.doesNotMatch(res.stdout, /Configuration|scan|Préparation/i);
    });
  }
});
