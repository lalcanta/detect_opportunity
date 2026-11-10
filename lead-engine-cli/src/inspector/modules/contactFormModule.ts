import type { ContactFormInfo } from "../../types";
import type { ScanModule } from "./types";

/** Liens vers une page de contact probable (texte ou URL). */
const CONTACT_LINK_RE = /contact|nous-contacter|contactez|devis|rendez-vous|rdv|ecrivez-nous|écrivez-nous/i;

/** Formulaires tiers embarqués en iframe ou par script. */
const EMBED_PROVIDERS: Array<[RegExp, string]> = [
  [/typeform\.com/i, "Typeform"],
  [/hsforms\.(com|net)|hs-scripts\.com|hbspt\.forms/i, "HubSpot Forms"],
  [/jotform\.com/i, "Jotform"],
  [/tally\.so/i, "Tally"],
  [/docs\.google\.com\/forms|forms\.gle/i, "Google Forms"],
];

const CAPTCHA_PATTERNS: Array<[RegExp, string]> = [
  [/challenges\.cloudflare\.com\/turnstile|cf-turnstile/i, "Cloudflare Turnstile"],
  [/hcaptcha\.com|h-captcha/i, "hCaptcha"],
  [/google\.com\/recaptcha|recaptcha\/api\.js|g-recaptcha|grecaptcha/i, "reCAPTCHA"],
  [/friendlycaptcha|frc-captcha/i, "Friendly Captcha"],
];

const CONSENT_RE = /rgpd|gdpr|consent|données personnelles|donnees personnelles|politique de confidentialit|j'accepte|j’accepte/i;

function attr(tag: string, name: string): string {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return (m?.[2] ?? m?.[3] ?? m?.[4] ?? "").trim();
}

export function detectCaptcha(html: string): string | null {
  for (const [re, name] of CAPTCHA_PATTERNS) if (re.test(html)) return name;
  return null;
}

/**
 * Cherche un formulaire de contact exploitable dans du HTML.
 * Retenu : un `<form>` avec une zone de message (textarea ou champ « message ») et un champ email,
 * ou un formulaire tiers embarqué (Typeform, HubSpot…). Écartés : recherche, newsletter, connexion.
 */
export function analyzeContactFormsInHtml(html: string, pageUrl: string): ContactFormInfo | null {
  const captcha = detectCaptcha(html);

  for (const match of html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
    const formTag = match[1] ?? "";
    const inner = match[2] ?? "";
    const meta = `${attr(`<f ${formTag}>`, "action")} ${attr(`<f ${formTag}>`, "id")} ${attr(`<f ${formTag}>`, "class")} ${attr(`<f ${formTag}>`, "role")}`;
    if (/search|recherche|newsletter|subscribe|login|connexion|panier|cart/i.test(meta)) continue;

    const fields: string[] = [];
    let hasMessage = false;
    let hasEmail = false;
    let hasPassword = false;
    for (const field of inner.matchAll(/<(input|textarea|select)\b([^>]*)>/gi)) {
      const tagName = (field[1] ?? "").toLowerCase();
      const tag = `<x ${field[2] ?? ""}>`;
      const type = attr(tag, "type").toLowerCase();
      if (["hidden", "submit", "button", "image", "reset"].includes(type)) continue;
      const name = attr(tag, "name") || attr(tag, "id") || attr(tag, "placeholder") || type || tagName;
      if (type === "password") hasPassword = true;
      if (tagName === "textarea" || /message|demande|commentaire|projet|description/i.test(name)) hasMessage = true;
      if (type === "email" || /e-?mail|courriel/i.test(name)) hasEmail = true;
      if (!fields.includes(name)) fields.push(name);
    }
    if (hasPassword || !hasMessage || !hasEmail) continue;

    return {
      url: pageUrl,
      fields: fields.slice(0, 12),
      captcha,
      hasConsentCheckbox: /type\s*=\s*["']?checkbox/i.test(inner) && CONSENT_RE.test(inner),
      provider: null,
    };
  }

  for (const [re, provider] of EMBED_PROVIDERS) {
    if (re.test(html)) return { url: pageUrl, fields: [], captcha, hasConsentCheckbox: false, provider };
  }
  return null;
}

/** Liens internes vers les pages de contact probables, dans l'ordre de la page, sans doublon. */
export function findContactPageLinks(links: Array<{ href: string; text: string }>, pageUrl: string, max = 3): string[] {
  let origin: string;
  try {
    origin = new URL(pageUrl).hostname.replace(/^www\./i, "");
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const { href, text } of links) {
    if (!CONTACT_LINK_RE.test(`${text} ${href}`)) continue;
    try {
      const u = new URL(href, pageUrl);
      if (!/^https?:$/.test(u.protocol) || u.hostname.replace(/^www\./i, "") !== origin) continue;
      u.hash = "";
      if (u.href !== pageUrl && !out.includes(u.href)) out.push(u.href);
    } catch {
      // lien invalide
    }
    if (out.length >= max) break;
  }
  return out;
}

export const contactFormModule: ScanModule = {
  id: "contact_form",
  label: "Formulaire de contact",
  description:
    "Détecte un formulaire de contact exploitable (accueil puis pages contact / devis) : URL, champs, captcha, case de consentement.",
  async afterNavigate({ page, result }) {
    const pageUrl = page.url();
    const homeHtml = await page.content().catch(() => "");
    const onHome = analyzeContactFormsInHtml(homeHtml, pageUrl);
    if (onHome) {
      result.contactForm = onHome;
      return;
    }

    const links = await page
      .evaluate(() =>
        Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).map((a) => ({ href: a.href, text: a.textContent || "" })),
      )
      .catch(() => [] as Array<{ href: string; text: string }>);

    for (const link of findContactPageLinks(links, pageUrl)) {
      try {
        const resp = await page.request.get(link, { timeout: 4500 });
        if (!resp.ok()) continue;
        const found = analyzeContactFormsInHtml(await resp.text(), link);
        if (found) {
          result.contactForm = found;
          return;
        }
      } catch {
        // page lente ou inaccessible : on passe à la suivante
      }
    }
    result.contactForm = null;
  },
};
