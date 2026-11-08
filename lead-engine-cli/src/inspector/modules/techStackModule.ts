import type { ScanModule } from "./types";

/** Détecte la stack technique à partir du HTML et des URLs de scripts. */
export function detectTechStackFromHtml(html: string, scripts: string = ""): string[] {
  const stack: string[] = [];
  if (/data-wf-site|content=["'][^"']*Webflow/i.test(html) || /webflow\.js/i.test(scripts)) stack.push("Webflow");
  if (/gsap|ScrollTrigger/i.test(scripts) || /gsap/i.test(html)) stack.push("GSAP");
  if (/tailwindcss|tailwind/i.test(html) || /backdrop-blur|tracking-tight|grid-cols-/i.test(html)) stack.push("Tailwind CSS");
  if (/__NEXT_DATA__|\/_next\/static\//i.test(html + " " + scripts)) stack.push("Next.js");
  if (/__NUXT__|\/_nuxt\//i.test(html + " " + scripts)) stack.push("Nuxt");
  if (/wp-content|wp-includes/i.test(html)) stack.push("WordPress");
  if (/elementor/i.test(html)) stack.push("Elementor");
  if (/cdn\.shopify\.com/i.test(html)) stack.push("Shopify");
  if (/prestashop/i.test(html)) stack.push("PrestaShop");
  if (/framerusercontent\.com|framer/i.test(html)) stack.push("Framer");
  if (/wix\.com|parastorage\.com/i.test(html)) stack.push("Wix");
  return stack;
}

export const techStackModule: ScanModule = {
  id: "tech_stack",
  label: "Stack Technique & Frameworks",
  description: "Détecte les technologies frontend/CMS utilisées (Webflow, GSAP, Tailwind CSS, Next.js, WordPress, Shopify...).",
  async afterNavigate({ page, result }) {
    const { html, scripts } = await page.evaluate(() => ({
      html: document.documentElement.outerHTML,
      scripts: Array.from(document.querySelectorAll("script[src]"))
        .map((s) => s.getAttribute("src") || "")
        .join(" "),
    }));
    result.stack = detectTechStackFromHtml(html, scripts);
  },
};
