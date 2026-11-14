import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseSireneApiResponse } from "../inspector/modules/sireneDirigeantModule";

const people = (nom: string, prenoms = "Nataniel") =>
  parseSireneApiResponse({ results: [{ siren: "1", dirigeants: [{ nom, prenoms }] }] }).keyPeople;

describe("dirigeant SIRENE : nom d'usage", () => {
  it("retire le nom d'usage qui répète le nom de famille", () => {
    assert.deepEqual(people("DRAY (DRAY)"), ["Nataniel Dray"]);
    assert.deepEqual(people("DRAY (dray)"), ["Nataniel Dray"]);
  });
  it("compare sans casse ni accents", () => {
    assert.deepEqual(people("LEVÊQUE (Leveque)"), ["Nataniel Levêque"]);
  });
  it("garde un nom d'usage différent", () => {
    assert.deepEqual(people("DUPONT (DRAY)"), ["Nataniel Dupont (Dray)"]);
  });
  it("sans parenthèses : inchangé", () => {
    assert.deepEqual(people("DE LA TOUR"), ["Nataniel De La Tour"]);
  });
});
