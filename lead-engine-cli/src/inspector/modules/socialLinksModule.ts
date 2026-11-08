import type { ScanModule } from "./types";

const SHARE_NOISE_RE = /\/sharer|\/share\?|\/intent\/|linkedin\.com\/sharing|facebook\.com\/tr\b|facebook\.com\/plugins/i;

/** Extrait passivement les liens vers LinkedIn, Facebook et Instagram présents dans le HTML. */
export function extractSocialLinksFromHtml(html: string): {
  linkedin: string[];
  facebook: string[];
  instagram: string[];
} {
  const urls = html.match(/https?:\/\/(?:www\.|fr\.)?(?:linkedin\.com\/(?:in|company)\/[a-zA-Z0-9_-]+|facebook\.com\/[a-zA-Z0-9._-]+|instagram\.com\/[a-zA-Z0-9._-]+)/gi) ?? [];
  const linkedin = new Set<string>();
  const facebook = new Set<string>();
  const instagram = new Set<string>();

  for (const raw of urls) {
    if (SHARE_NOISE_RE.test(raw)) continue;
    const clean = raw.replace(/\/+$/, "");
    if (/linkedin\.com/i.test(clean)) linkedin.add(clean);
    else if (/facebook\.com/i.test(clean)) facebook.add(clean);
    else if (/instagram\.com/i.test(clean)) instagram.add(clean);
  }

  return {
    linkedin: [...linkedin].slice(0, 5),
    facebook: [...facebook].slice(0, 3),
    instagram: [...instagram].slice(0, 3),
  };
}

export const socialLinksModule: ScanModule = {
  id: "social_links",
  label: "Réseaux Sociaux Passifs (LinkedIn / Facebook / Instagram)",
  description: "Extrait sans risque de blocage les profils LinkedIn (fondateurs/entreprise), Facebook et Instagram liés sur le site.",
  async afterNavigate({ page, result }) {
    const html = await page.evaluate(() => document.documentElement.outerHTML);
    result.socialLinks = extractSocialLinksFromHtml(html);
  },
};
