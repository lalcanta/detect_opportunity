import type { ScanModule } from "./types";

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

      const imgSelectors = [
        'header img[src*="logo" i]',
        'nav img[src*="logo" i]',
        '.navbar img[src*="logo" i]',
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
          const src = el.currentSrc || el.getAttribute("src") || el.getAttribute("data-src");
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

    result.screenshot = await page.screenshot({ fullPage: true, type: "jpeg", quality: 55 });
  },
};
