/**
 * Le CRM charge Tailwind v3 par CDN (docs/agents/interface-crm.md) : une classe apparue avec v4 n'y produit aucun
 * style, sans erreur. Ce test refuse celles qui ont déjà été écrites par erreur ou s'en approchent.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { describe, it } from "node:test";

const VIEWS = new URL("../views/", import.meta.url);
/** Utilitaires propres à Tailwind v4 (sans équivalent v3 sous ce nom). */
const V4_ONLY =
  /(?<![\w-])(shadow-2?xs|inset-shadow-[\w-]+|text-shadow-[\w-]+|drop-shadow-xs|rounded-xs|blur-xs|bg-linear-[\w-]+|bg-radial(?:-[\w-]+)?|bg-conic(?:-[\w-]+)?|outline-hidden|field-sizing-[\w-]+)(?![\w-])/g;

describe("interface : Tailwind v3 uniquement", () => {
  for (const file of readdirSync(VIEWS).filter((f) => f.endsWith(".ts"))) {
    it(`${file} n'utilise aucune classe propre à Tailwind v4`, () => {
      const found = [...readFileSync(new URL(file, VIEWS), "utf-8").matchAll(V4_ONLY)].map((m) => m[1]);
      assert.deepEqual(found, [], `classes v4 dans src/views/${file} : ${found.join(", ")}`);
    });
  }
});
