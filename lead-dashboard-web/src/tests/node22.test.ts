/** wrangler 4 exige Node 22 : le contrôle doit s'arrêter tout de suite, avec un message clair, sous Node 20. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
// @ts-expect-error module .mjs sans déclaration de types
import { nodeVersionError } from "../../scripts/require-node22.mjs";

const root = new URL("../../../", import.meta.url);

describe("exigence Node 22", () => {
  it("refuse Node 20 avec le message demandé, accepte 22 et plus", () => {
    assert.equal(nodeVersionError("20.18.0"), "wrangler 4 exige Node 22 (actuel : v20.18.0). Faire `nvm use` à la racine du dépôt.");
    assert.equal(nodeVersionError("22.3.0"), null);
    assert.equal(nodeVersionError("24.0.0"), null);
  });

  it("le script s'arrête avec un code non nul sous un Node trop ancien", () => {
    const node20 = "/opt/homebrew/opt/node@20/bin/node";
    if (!existsSync(node20)) return; // pas de Node 20 sur ce poste (CI en 22) : le cas pur ci-dessus suffit
    const r = spawnSync(node20, [new URL("lead-dashboard-web/scripts/require-node22.mjs", root).pathname], { encoding: "utf8" });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /wrangler 4 exige Node 22 \(actuel : v20\./);
  });

  it(".nvmrc vaut 22 et les points d'entrée appellent le contrôle", () => {
    assert.equal(readFileSync(new URL(".nvmrc", root), "utf8").trim(), "22");
    assert.match(readFileSync(new URL("lead-dashboard-web/scripts/db-local-reset.mjs", root), "utf8"), /requireNode22\(\)/);
    const pkg = JSON.parse(readFileSync(new URL("lead-dashboard-web/package.json", root), "utf8")).scripts;
    assert.match(pkg.dev, /^node scripts\/require-node22\.mjs && /);
    assert.match(readFileSync(new URL("tests/setupTestEnv.ts", root), "utf8"), /requireNode22\(\)/);
  });
});
