import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { BrowserContext } from "playwright";
import { scrapeMaps } from "../collector/mapsScraper";

/** Contexte factice : toute navigation est comptée, aucun navigateur n'est lancé. */
function fakeContext() {
  const calls = { goto: 0, closed: false };
  const page = {
    goto: async () => {
      calls.goto++;
    },
    close: async () => {
      calls.closed = true;
    },
  };
  const context = { newPage: async () => page } as unknown as BrowserContext;
  return { context, calls };
}

describe("scrapeMaps : annulation", () => {
  it("s'arrête avant toute navigation quand onProgress renvoie false", async () => {
    const { context, calls } = fakeContext();
    const messages: string[] = [];
    const res = await scrapeMaps({
      query: "plombier",
      city: "Lyon",
      limit: 3,
      context,
      interactive: false,
      onProgress: async (msg) => {
        messages.push(msg);
        return false;
      },
    });
    assert.equal(calls.goto, 0);
    assert.equal(messages.length, 1);
    assert.deepEqual(res, { qualifiedLeads: [], potentialCount: 0 });
    assert.equal(calls.closed, true);
  });
});
