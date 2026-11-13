import { detectPaidAdsInHtml } from "../inspector/modules/adsPixelSpyModule";
import type { MapsCompetitor } from "../types";

export interface CompetitorPixels {
  name: string;
  rank: number;
  website: string;
  /** null = non vérifié (échec réseau, timeout, non-2xx, non-HTML) — jamais « aucun pixel ». */
  pixels: string[] | null;
}

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function checkOne(website: string, fetcher: typeof fetch, timeoutMs: number): Promise<string[] | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Garde-fou : même un fetcher qui ignore le signal ne dépasse pas le délai.
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  const run = (async (): Promise<string[] | null> => {
    const res = await fetcher(website, {
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    if (!/html/i.test(res.headers.get("content-type") ?? "")) return null;
    return detectPaidAdsInHtml(await res.text());
  })().catch(() => null);
  try {
    return await Promise.race([run, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchCompetitorPixels(
  competitors: MapsCompetitor[],
  fetcher: typeof fetch = fetch,
  timeoutMs = 5000,
): Promise<CompetitorPixels[]> {
  const withSite = competitors.filter((c): c is MapsCompetitor & { website: string } => !!c.website);
  return Promise.all(
    withSite.map(async (c) => ({
      name: c.name,
      rank: c.rank,
      website: c.website,
      pixels: await checkOne(c.website, fetcher, timeoutMs),
    })),
  );
}
