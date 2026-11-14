/**
 * `dev-local/` expose le CRM à wrangler par des liens symboliques. `.gitignore` désignore `dev-local/.dev.vars`
 * (le chemin, pas le lien) : si ce lien devenait un fichier ordinaire (éditeur qui enregistre par renommage, `cp -L`,
 * archive), il contiendrait les secrets et serait suivi par git. Ce test échoue alors avant tout commit.
 */
import assert from "node:assert/strict";
import { lstatSync, readlinkSync } from "node:fs";
import { describe, it } from "node:test";

const LIENS: Array<[string, string]> = [
  [".dev.vars", "../.dev.vars"],
  ["functions", "../functions"],
  ["wrangler.toml", "../wrangler.local.toml"],
];

describe("dev-local : liens symboliques", () => {
  for (const [nom, cible] of LIENS) {
    it(`dev-local/${nom} est un lien symbolique vers ${cible}`, () => {
      const url = new URL(`../../dev-local/${nom}`, import.meta.url);
      assert.ok(lstatSync(url).isSymbolicLink(), `dev-local/${nom} n'est plus un lien symbolique${nom === ".dev.vars" ? " : il risque de contenir les secrets et d'être commité" : ""}`);
      assert.equal(readlinkSync(url), cible);
    });
  }
});
