import type { ScanModule } from "./types";
import { collectLogoCandidates, guessImageType, isSocialOrServiceUrl, isUsableLogoImage, pickLogoCandidate, siteMatchesCompany, type LogoCandidate } from "./logoPicker";

/** Convertit une chaîne CSS rgb(...) ou rgba(...) en code hexadécimal (#rrggbb). */
export function parseRgbToHex(rgb: string): string | null {
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!m) return null;
  if (m[4] !== undefined && Number(m[4]) < 0.5) return null;
  const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (Math.max(r, g, b) - Math.min(r, g, b) < 18) return null;
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** Résout une URL relative en URL absolue selon la page hôte. */
export function resolveLogoUrl(u: string | null, baseUrl: string): string | null {
  if (!u || u.startsWith("data:")) return u;
  try {
    return new URL(u, baseUrl).href;
  } catch {
    return null;
  }
}

/** URL qui n'est manifestement pas une photo (logo, icône, pixel de suivi, emoji, image vectorielle). */
const NOT_A_PHOTO_RE = /logo|icon|favicon|sprite|emoji|avatar|placeholder|spinner|loader|pixel|tracking|facebook\.com\/tr|google-analytics|doubleclick|gravatar|\.svg(\?|$)|\.gif(\?|$)/i;

/**
 * Garde les vraies photos du site : assez grandes (≥ 300×180 affichées ou en taille réelle), hors logo et icônes,
 * sans doublon, les plus grandes d'abord. 8 au maximum.
 */
export function pickSiteImages(
  candidates: Array<{ url: string; w: number; h: number; alt?: string }>,
  logoUrl?: string | null,
  max = 8,
): string[] {
  const seen = new Set<string>();
  return candidates
    .filter((c) => /^https?:\/\//i.test(c.url) && !NOT_A_PHOTO_RE.test(c.url) && !/logo/i.test(c.alt || ""))
    .filter((c) => c.w >= 300 && c.h >= 180 && c.w / c.h < 4.5)
    .filter((c) => !logoUrl || c.url !== logoUrl)
    .sort((a, b) => b.w * b.h - a.w * a.h)
    .map((c) => c.url.split("#")[0]!)
    .filter((u) => (seen.has(u) ? false : (seen.add(u), true)))
    .slice(0, max);
}

export const brandingVisualModule: ScanModule = {
  id: "branding_visual",
  label: "Identité Visuelle, Logo Base64 & Capture HD",
  description: "Extrait les couleurs dominantes, le vrai logo client encodé en Base64 et la capture d'écran pleine page.",
  async afterNavigate({ page, result, companyName, phone }) {
    result.dominantColors = await page.evaluate(() => {
      const counts = new Map<string, number>();
      function toHex(rgb: string): string | null {
        const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (!m) return null;
        if (m[4] !== undefined && Number(m[4]) < 0.5) return null;
        const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
        if (Math.max(r, g, b) - Math.min(r, g, b) < 18) return null;
        return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
      }
      document.querySelectorAll("body *").forEach((el) => {
        const cs = getComputedStyle(el);
        for (const c of [cs.backgroundColor, cs.color]) {
          const hex = toHex(c);
          if (hex) counts.set(hex, (counts.get(hex) ?? 0) + 1);
        }
      });
      return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([h]) => h);
    });

    const candidates = await page.evaluate(collectLogoCandidates).catch(() => [] as LogoCandidate[]);
    const identity = await page
      .evaluate(() => ({
        host: location.hostname,
        title: document.title || "",
        // Chiffres de la page (texte et liens tel:), pour retrouver le numéro de la fiche quel que soit son format.
        digits: ((document.body?.innerText || "") + " " + Array.from(document.querySelectorAll('a[href^="tel:"]')).map((a) => a.getAttribute("href")).join(" ")).replace(/\D/g, ""),
      }))
      .catch(() => ({ host: "", title: "", digits: "" }));
    const siteIsCompany = siteMatchesCompany(identity.host, identity.title, companyName, identity.digits, phone);
    const pick = pickLogoCandidate(candidates, companyName, siteIsCompany);
    const fallbacks = await page
      .evaluate(() => {
        const abs = (u: string | null | undefined) => {
          if (!u) return null;
          try {
            return new URL(u, location.href).href;
          } catch {
            return null;
          }
        };
        return [
          abs(document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href")),
          abs(document.querySelector('link[rel*="icon"][sizes*="192"], link[rel*="icon"][sizes*="180"]')?.getAttribute("href")),
        ].filter((u): u is string => !!u);
      })
      .catch(() => [] as string[]);
    // og:image n'est pas un repli : c'est presque toujours une photo (devanture, plat, chantier).
    // Icônes du site (apple-touch-icon…) : seulement si le site est bien celui de l'entreprise.
    const urls = [...(pick ? [pick.url] : []), ...(siteIsCompany ? fallbacks.filter((u) => !isSocialOrServiceUrl(u)) : [])];

    for (const url of urls) {
      if (url.startsWith("data:")) {
        if (url.startsWith("data:image/svg") || url.length > 500) {
          result.logoUrl = url;
          break;
        }
        continue;
      }
      try {
        const imgResp = await page.request.get(url, { timeout: 6000 });
        if (!imgResp.ok()) continue;
        const buf = await imgResp.body();
        const contentType = (imgResp.headers()["content-type"] || "").split(";")[0]?.trim() || guessImageType(url);
        if (!isUsableLogoImage(buf, contentType)) continue;
        result.logoUrl = buf.length < 2 * 1024 * 1024 ? `data:${contentType};base64,${buf.toString("base64")}` : url;
        break;
      } catch {
        // Logo injoignable : on essaie le suivant.
      }
    }

    // Vraies photos du prospect (réalisations, boutique, produits) pour la démo, au lieu d'images génériques.
    const imageCandidates = await page
      .evaluate(() => {
        const out: Array<{ url: string; w: number; h: number; alt: string }> = [];
        const og = document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content;
        if (og) out.push({ url: og, w: 1200, h: 630, alt: "og:image" });
        const pickSrcset = (ss: string): string => {
          const parts = ss.split(",").map((p) => p.trim().split(/\s+/));
          parts.sort((a, b) => (parseInt(b[1] || "0", 10) || 0) - (parseInt(a[1] || "0", 10) || 0));
          return parts[0]?.[0] || "";
        };
        document.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
          const r = img.getBoundingClientRect();
          const src =
            (img.srcset && pickSrcset(img.srcset)) ||
            img.getAttribute("data-src") ||
            img.getAttribute("data-lazy-src") ||
            (img.getAttribute("data-srcset") ? pickSrcset(img.getAttribute("data-srcset") || "") : "") ||
            img.currentSrc ||
            img.src;
          out.push({ url: src, w: Math.max(r.width, img.naturalWidth), h: Math.max(r.height, img.naturalHeight), alt: img.alt || "" });
        });
        document.querySelectorAll<HTMLElement>("section, header, div, figure, a").forEach((el) => {
          const bg = getComputedStyle(el).backgroundImage;
          const m = bg && bg.match(/url\(["']?([^"')]+)["']?\)/);
          if (!m || !m[1]) return;
          const r = el.getBoundingClientRect();
          out.push({ url: m[1], w: r.width, h: r.height, alt: "background" });
        });
        return out.map((c) => {
          try {
            return { ...c, url: new URL(c.url, location.href).href };
          } catch {
            return { ...c, url: "" };
          }
        });
      })
      .catch(() => [] as Array<{ url: string; w: number; h: number; alt: string }>);
    result.siteImages = pickSiteImages(imageCandidates, result.logoUrl);

    result.screenshot = await page.screenshot({ fullPage: true, type: "jpeg", quality: 55 });
  },
};
