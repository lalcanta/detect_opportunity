import type { ScanModule } from "./types";

export function extractCopyrightYearFromText(text: string, currentYear = new Date().getFullYear()): number | null {
  const regex = /(?:©|&copy;|copyright|tous droits réservés)[^0-9]{0,25}((?:199\d|20[0-2]\d)(?:\s*[-–]\s*(20[0-2]\d))?)/gi;
  const years: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const rawRange = match[1] ?? "";
    const yearMatches = rawRange.match(/199\d|20[0-2]\d/g) ?? [];
    for (const yStr of yearMatches) {
      const y = Number(yStr);
      if (y >= 1995 && y <= currentYear + 1) {
        years.push(y);
      }
    }
  }
  if (years.length === 0) return null;
  return Math.max(...years);
}

export function buildObsolescenceSignals(opts: {
  finalUrl: string;
  copyrightYear: number | null;
  brokenImagesCount?: number;
  currentYear?: number;
}): { isHttps: boolean; signals: string[] } {
  const currentYear = opts.currentYear ?? new Date().getFullYear();
  const isHttps = /^https:\/\//i.test(opts.finalUrl.trim());
  const signals: string[] = [];

  if (!isHttps) {
    signals.push("Site non sécurisé (HTTP sans cadenas SSL : alerte 'Non sécurisé' sur mobile/Chrome)");
  }
  if (opts.copyrightYear && opts.copyrightYear <= currentYear - 2) {
    signals.push(`Site non mis à jour depuis ${opts.copyrightYear} (Copyright © ${opts.copyrightYear})`);
  }
  if ((opts.brokenImagesCount ?? 0) > 0) {
    signals.push(`${opts.brokenImagesCount} image(s) cassée(s) sur la page d'accueil`);
  }

  return { isHttps, signals };
}

export const freshnessSslModule: ScanModule = {
  id: "freshness_ssl",
  label: "Fraîcheur, SSL & Obsolescence Technique",
  description: "Vérifie le certificat HTTPS, l'année du copyright de pied de page et les images cassées.",
  async afterNavigate(ctx) {
    const finalUrl = ctx.page.url() || ctx.url;
    const pageMeta = await ctx.page
      .evaluate(() => {
        const text = document.body?.innerText || "";
        const imgs = Array.from(document.querySelectorAll("img"));
        const broken = imgs.filter((img) => img.complete && img.naturalWidth === 0 && img.getAttribute("src")).length;
        return { text: text.slice(-5000), broken };
      })
      .catch(() => ({ text: "", broken: 0 }));

    const copyrightYear = extractCopyrightYearFromText(pageMeta.text);
    const { isHttps, signals } = buildObsolescenceSignals({
      finalUrl,
      copyrightYear,
      brokenImagesCount: pageMeta.broken,
    });

    ctx.result.isHttps = isHttps;
    ctx.result.copyrightYear = copyrightYear;
    ctx.result.obsolescenceSignals = signals;
  },
};
