/**
 * Le CRM charge Tailwind v3 par CDN (docs/agents/interface-crm.md) : une classe apparue avec v4 n'y produit aucun
 * style, sans erreur. Ce test refuse les plus courantes ; il ne contrôle pas les valeurs fractionnaires (`py-0.2`).
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";

/** Tout ce qui écrit des classes : vues serveur, routes qui rendent du HTML, scripts client. */
const DIRS = ["../views/", "../routes/", "../../public/static/"].map((d) => new URL(d, import.meta.url));
/** Utilitaires propres à Tailwind v4 (sans équivalent v3 sous ce nom). */
const V4_ONLY =
  /(?<![\w-])(shadow-2?xs|inset-shadow-[\w-]+|text-shadow-[\w-]+|drop-shadow-xs|rounded-xs|blur-xs|bg-linear-[\w-]+|bg-radial(?:-[\w-]+)?|bg-conic(?:-[\w-]+)?|outline-hidden|field-sizing-[\w-]+)(?![\w-])/g;

describe("interface : Tailwind v3 uniquement", () => {
  for (const dir of DIRS) {
    for (const file of readdirSync(dir).filter((f) => /\.(ts|js)$/.test(f))) {
      const url = new URL(file, dir);
      it(`${url.pathname.split("/lead-dashboard-web/")[1]} n'utilise aucune classe propre à Tailwind v4`, () => {
        const found = [...readFileSync(url, "utf-8").matchAll(V4_ONLY)].map((m) => m[1]);
        assert.deepEqual(found, [], `classes v4 : ${found.join(", ")}`);
      });
    }
  }
});
