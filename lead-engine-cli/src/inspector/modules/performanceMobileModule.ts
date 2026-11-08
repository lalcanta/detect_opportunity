import type { ScanModule } from "./types";

export const performanceMobileModule: ScanModule = {
  id: "perf_mobile",
  label: "Performance & Responsive Mobile",
  description: "Vérifie l'adaptation mobile (viewport 390×844) et détecte les débordements horizontaux.",
  async afterNavigate({ page, result }) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(350);
    result.isResponsive = await page.evaluate(() => {
      const hasMeta = !!document.querySelector('meta[name="viewport"]');
      return hasMeta && document.documentElement.scrollWidth <= window.innerWidth + 2;
    });
  },
};
