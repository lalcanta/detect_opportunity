import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pickCompetitors, searchLabel } from "../collector/mapsRanking";
import type { MapsCompetitor } from "../types";

const place = (rank: number): MapsCompetitor => ({
  name: `Concurrent ${rank}`,
  rank,
  rating: 4.5,
  reviewsCount: 10 * rank,
  website: null,
  category: null,
});
const places = (n: number) => Array.from({ length: n }, (_, i) => place(i + 1));
const ranks = (l: MapsCompetitor[]) => l.map((p) => p.rank);

describe("pickCompetitors", () => {
  it("prend les mieux classés puis les suivants les plus proches, sans le lead", () => {
    assert.deepEqual(ranks(pickCompetitors(places(8), 4)), [1, 2, 3, 5, 6]);
  });
  it("lead en tête : les cinq suivants", () => {
    assert.deepEqual(ranks(pickCompetitors(places(8), 1)), [2, 3, 4, 5, 6]);
  });
  it("moins de places que le maximum : toutes sauf le lead", () => {
    assert.deepEqual(ranks(pickCompetitors(places(3), 2)), [1, 3]);
  });
  it("ne dépend pas de l'ordre d'entrée", () => {
    assert.deepEqual(ranks(pickCompetitors([...places(8)].reverse(), 4)), [1, 2, 3, 5, 6]);
  });
});

describe("searchLabel", () => {
  it("garde la sous-requête qui contient déjà la ville, casse et accents ignorés", () => {
    assert.equal(searchLabel("plombier Lyon", "Lyon", false), "plombier Lyon");
    assert.equal(searchLabel("plombier saint-étienne", "Saint-Etienne", false), "plombier saint-étienne");
  });
  it("ajoute la ville sinon", () => {
    assert.equal(searchLabel("plombier", "Lyon", false), "plombier Lyon");
  });
  it("recherche par coordonnées : autour de la ville", () => {
    assert.equal(searchLabel("plombier", "Lyon", true), "plombier autour de Lyon");
  });
});
