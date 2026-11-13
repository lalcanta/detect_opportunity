import test from "node:test";
import assert from "node:assert/strict";
import { fetchCompetitorPixels } from "../collector/competitorPixels";
import { detectPaidAdsInHtml } from "../inspector/modules/adsPixelSpyModule";
import type { MapsCompetitor } from "../types";

const comp = (name: string, rank: number, website: string | null): MapsCompetitor => ({
  name, rank, rating: null, reviewsCount: null, website, category: null,
});
const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });

test("detectPaidAdsInHtml détecte le pixel Meta", () => {
  assert.deepEqual(detectPaidAdsInHtml(`<script>fbq('init', '1')</script>`), ["Meta Ads (Facebook Pixel)"]);
  assert.deepEqual(detectPaidAdsInHtml("<p>rien</p>"), []);
});

test("fetchCompetitorPixels : pixel, 500, timeout, sans site, non-HTML", async () => {
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("a.fr")) return html(`<script>fbq('init','1')</script>`);
    if (u.includes("b.fr")) return html("oops", 500);
    if (u.includes("d.fr")) return new Response("{}", { headers: { "content-type": "application/json" } });
    return new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("timeout")));
    });
  }) as typeof fetch;
  const out = await fetchCompetitorPixels(
    [comp("A", 1, "https://a.fr"), comp("B", 2, "https://b.fr"), comp("N", 3, null), comp("C", 4, "https://c.fr"), comp("D", 5, "https://d.fr")],
    fetcher,
    30,
  );
  assert.deepEqual(out, [
    { name: "A", rank: 1, website: "https://a.fr", pixels: ["Meta Ads (Facebook Pixel)"] },
    { name: "B", rank: 2, website: "https://b.fr", pixels: null },
    { name: "C", rank: 4, website: "https://c.fr", pixels: null },
    { name: "D", rank: 5, website: "https://d.fr", pixels: null },
  ]);
});
