import type { ScanModule } from "./types";

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
  async afterNavigate({ page, result }) {
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

    const rawLogoInfo = await page.evaluate(() => {
      function abs(u: string | null): string | null {
        if (!u || u.startsWith("data:")) return u;
        try {
          return new URL(u, location.href).href;
        } catch {
          return null;
        }
      }

      function getImgSrc(el: HTMLImageElement): string | null {
        const isPlaceholder = (s: string | null) => !s || (s.startsWith("data:") && s.length < 500);
        const candidates = [
          el.getAttribute("data-lazy-src"),
          el.getAttribute("data-src"),
          el.getAttribute("data-original"),
          el.currentSrc,
          el.getAttribute("src"),
        ];
        for (const c of candidates) {
          if (c && !isPlaceholder(c)) return c;
        }
        const srcset = el.getAttribute("data-srcset") || el.getAttribute("srcset");
        if (srcset) {
          const first = srcset.split(",")[0]?.trim().split(/\s+/)[0];
          if (first && !isPlaceholder(first)) return first;
        }
        return el.currentSrc || el.getAttribute("src");
      }

      const imgSelectors = [
        'header img[src*="logo" i]',
        'nav img[src*="logo" i]',
        '.navbar img[src*="logo" i]',
        'img[class*="custom-logo" i]',
        'img[class*="site-logo" i]',
        '.site-branding img',
        '.header-logo img',
        'a[rel="home"] img',
        'img[alt*="logo" i]',
        '[class*="logo" i] img',
        '[id*="logo" i] img',
        'img[src*="logo" i]',
        'a[class*="brand" i] img',
        'a[class*="navbar-brand" i] img',
        'header a[href="/"] img',
        'header a[href="./"] img',
        'nav a[href="/"] img',
        'header img',
        'nav img',
        '[role="banner"] img',
      ];

      for (const sel of imgSelectors) {
        const els = Array.from(document.querySelectorAll<HTMLImageElement>(sel));
        for (const el of els) {
          const src = getImgSrc(el);
          const resolved = abs(src);
          if (resolved) {
            const rect = el.getBoundingClientRect();
            if (rect.width >= 16 && rect.height >= 12) {
              return { url: resolved, isSvg: false };
            }
          }
        }
      }

      const svgLogo = document.querySelector(
        'header svg[class*="logo" i], nav svg[class*="logo" i], a[class*="brand" i] svg, .logo svg, header a[href="/"] svg',
      );
      if (svgLogo) {
        const rect = svgLogo.getBoundingClientRect();
        if (rect.width >= 16 && rect.height >= 12) {
          const svgCode = svgLogo.outerHTML;
          return {
            url: `data:image/svg+xml;utf8,${encodeURIComponent(svgCode)}`,
            isSvg: true,
          };
        }
      }

      const appleTouch = abs(document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href") ?? null);
      if (appleTouch) return { url: appleTouch, isSvg: false };

      const iconHighRes = abs(
        document.querySelector('link[rel*="icon"][sizes*="192"], link[rel*="icon"][sizes*="180"]')?.getAttribute("href") ??
          null,
      );
      if (iconHighRes) return { url: iconHighRes, isSvg: false };

      const ogImage = abs(document.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? null);
      if (ogImage) return { url: ogImage, isSvg: false };

      return null;
    });

    if (rawLogoInfo?.url) {
      if (rawLogoInfo.url.startsWith("data:")) {
        result.logoUrl = rawLogoInfo.url;
      } else {
        try {
          const imgResp = await page.request.get(rawLogoInfo.url, { timeout: 6000 });
          if (imgResp.ok()) {
            const buf = await imgResp.body();
            const contentType = (imgResp.headers()["content-type"] || "image/png").split(";")[0]?.trim() || "image/png";
            if (buf.length > 0 && buf.length < 2 * 1024 * 1024) {
              result.logoUrl = `data:${contentType};base64,${buf.toString("base64")}`;
            } else {
              result.logoUrl = rawLogoInfo.url;
            }
          } else {
            result.logoUrl = rawLogoInfo.url;
          }
        } catch {
          result.logoUrl = rawLogoInfo.url;
        }
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
