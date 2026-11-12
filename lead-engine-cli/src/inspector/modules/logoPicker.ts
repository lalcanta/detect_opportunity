/**
 * Choix du logo d'un prospect sur son site.
 *
 * Erreurs vues en production : icône Instagram de l'en-tête prise pour le logo, logo d'un partenaire (autre atelier)
 * trouvé plus bas dans la page, photo de devanture (og:image ou grande image d'en-tête), GIF transparent 1×1 d'un
 * chargement différé. D'où trois étapes : collecte des candidats dans la page, notation (fonction pure, testée),
 * puis contrôle des octets téléchargés.
 */

export interface LogoCandidate {
  url: string;
  /** Taille affichée et position dans la page (px). */
  w: number;
  h: number;
  top: number;
  /** Taille réelle de l'image (0 si pas encore chargée). */
  naturalW: number;
  naturalH: number;
  /** src, alt, title, class et id de l'image et de ses deux parents, en minuscules. */
  text: string;
  /** Lien qui entoure l'image. */
  href: string;
  inHeader: boolean;
  inFooter: boolean;
  /** Signal fort du CMS : custom-logo, site-logo, site-branding, lien rel="home". */
  strong: boolean;
  /** Le lien pointe vers l'accueil du site. */
  linksHome: boolean;
  isSvg: boolean;
}

// Mots entiers seulement : « rge » ne doit pas écarter « forge », ni « visa » « visage ».
const SOCIAL_OR_SERVICE_RE = new RegExp(
  "(?<![a-z])(?:" +
    [
      "facebook", "fb", "instagram", "insta", "linkedin", "twitter", "x-logo", "tiktok", "youtube", "pinterest", "whatsapp",
      "snapchat", "tripadvisor", "google-?maps", "google-?reviews", "google-?my-?business", "trustpilot", "yelp", "pagesjaunes",
      "houzz", "paypal", "visa", "mastercard", "stripe", "cb", "apple-?pay", "qualibat", "rge", "label", "labels", "certification",
      "partenaires?", "partners?", "sponsors?", "cookies?", "cookiebot", "axeptio", "tarteaucitron", "didomi", "recaptcha",
      "flags?", "drapeaux?", "wpml", "emoji", "social", "sociaux", "share", "partage",
    ].join("|") +
    ")(?![a-z])",
  "i",
);

/** URL ou texte d'une icône de réseau social, d'un moyen de paiement, d'un label ou d'un service tiers. */
export function isSocialOrServiceUrl(value: string): boolean {
  return SOCIAL_OR_SERVICE_RE.test(value);
}

/** Mots du nom de l'entreprise assez distinctifs pour être cherchés dans src/alt (≥ 4 lettres, hors mots génériques). */
function nameTokens(companyName?: string): string[] {
  if (!companyName) return [];
  const generic = new Set(["espace", "metiers", "services", "societe", "groupe", "artisans", "ariege", "sarl", "eurl", "sas", "sasu", "entreprise", "artisan", "atelier", "maison", "boulangerie", "patisserie", "menuiserie", "couverture", "plomberie", "electricite", "restaurant", "saint", "sainte", "france"]);
  return companyName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !generic.has(w));
}

/** Note un candidat ; `null` s'il est écarté. */
export function scoreLogoCandidate(c: LogoCandidate, companyName?: string): number | null {
  if (!c.url) return null;
  const haystack = `${c.url} ${c.text} ${c.href}`.toLowerCase();
  if (isSocialOrServiceUrl(haystack)) return null;
  if (/^https?:\/\/(?:www\.)?(?:facebook|instagram|linkedin|twitter|x|tiktok|youtube|pinterest)\.com/i.test(c.href)) return null;
  if (c.inFooter && !c.strong) return null;
  // Trop petit pour être lisible, ou GIF/pixel de remplacement.
  if (c.w < 16 || c.h < 12) return null;
  if (c.naturalW > 0 && c.naturalH > 0 && (c.naturalW < 16 || c.naturalH < 12)) return null;
  // Une photo n'est pas un logo : grande surface affichée ou format très « photo ».
  if (c.h > 240 || c.w > 560 || c.w * c.h > 90_000) return null;
  // Logo d'un partenaire ou image de contenu : loin du haut de la page, sans signal fort.
  if (!c.strong && !c.inHeader && c.top > 400) return null;

  let score = 0;
  if (c.strong) score += 50;
  if (c.inHeader) score += 20;
  if (c.linksHome) score += 20;
  if (/logo/.test(c.text) || /logo/.test(c.url.toLowerCase())) score += 25;
  if (/brand|marque/.test(c.text)) score += 5;
  const tokens = nameTokens(companyName);
  if (tokens.some((t) => haystack.includes(t))) score += 15;
  if (c.top < 150) score += 10;
  if (c.isSvg) score += 3;
  // Une icône carrée minuscule dans l'en-tête ressemble plus à un pictogramme qu'à un logo.
  if (c.w <= 32 && c.h <= 32 && !c.strong && !/logo/.test(c.text)) score -= 25;
  return score;
}

/**
 * Le site semble-t-il être celui de l'entreprise ? Vrai si le téléphone de la fiche figure sur la page, si un mot
 * distinctif du nom figure dans le domaine ou le titre, ou si le nom n'a aucun mot distinctif (on ne peut pas conclure).
 */
export function siteMatchesCompany(host: string, title: string, companyName?: string, pageDigits = "", phone?: string | null): boolean {
  // Le numéro de la fiche Maps sur la page : le site est le sien, même sous une autre enseigne (« BG Forge » → beaudic-ferronnerie.com).
  const phoneCore = (phone || "").replace(/\D/g, "").replace(/^(33|0)/, "");
  if (phoneCore.length >= 9 && pageDigits.includes(phoneCore)) return true;
  const tokens = nameTokens(companyName);
  if (tokens.length === 0) return true;
  const hay = `${host} ${title}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const compact = hay.replace(/[^a-z0-9]/g, "");
  return tokens.some((t) => hay.includes(t) || compact.includes(t));
}

/**
 * Meilleur candidat (score ≥ 20), ou `null` : mieux vaut un monogramme qu'un faux logo.
 * Sur un site qui ne semble pas être celui de l'entreprise (ex. site d'un autre atelier indiqué sur la fiche),
 * seul un logo qui porte le nom de l'entreprise est accepté.
 */
export function pickLogoCandidate(candidates: LogoCandidate[], companyName?: string, siteIsCompany = true): LogoCandidate | null {
  const tokens = nameTokens(companyName);
  let best: { c: LogoCandidate; s: number } | null = null;
  for (const c of candidates) {
    const s = scoreLogoCandidate(c, companyName);
    if (s === null || s < 20) continue;
    if (!siteIsCompany && !tokens.some((t) => `${c.url} ${c.text}`.toLowerCase().includes(t))) continue;
    if (!best || s > best.s) best = { c, s };
  }
  return best?.c ?? null;
}

export function guessImageType(url: string): string {
  const ext = url.toLowerCase().split("?")[0]!.split(".").pop();
  return ext === "svg" ? "image/svg+xml" : ext === "webp" ? "image/webp" : ext === "gif" ? "image/gif" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png";
}

/** Dimensions lues dans l'en-tête PNG ou GIF ; `null` pour les autres formats. */
export function imageDimensions(buf: Buffer): { w: number; h: number } | null {
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf.length >= 10 && buf.toString("ascii", 0, 3) === "GIF") return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
  return null;
}

/** Les octets téléchargés sont-ils un vrai logo (image, pas un pixel 1×1 ni une page HTML d'erreur) ? */
export function isUsableLogoImage(buf: Buffer, contentType: string): boolean {
  if (!/^image\//i.test(contentType)) return false;
  if (buf.length < 120) return false;
  const dims = imageDimensions(buf);
  if (dims && (dims.w < 16 || dims.h < 12)) return false;
  return true;
}

/**
 * Exécuté dans la page (Playwright) : candidats logo de l'en-tête et du haut de page, images et SVG.
 * Autonome : aucune référence extérieure.
 */
export function collectLogoCandidates(): LogoCandidate[] {
  const out: LogoCandidate[] = [];
  const seen = new Set<Element>();
  const home = location.origin + "/";
  const abs = (u: string | null | undefined): string | null => {
    if (!u) return null;
    if (u.startsWith("data:")) return u;
    try {
      return new URL(u, location.href).href;
    } catch {
      return null;
    }
  };
  const srcOf = (el: HTMLImageElement): string | null => {
    const isPlaceholder = (s: string | null) => !s || (s.startsWith("data:") && s.length < 500);
    for (const c of [el.getAttribute("data-lazy-src"), el.getAttribute("data-src"), el.getAttribute("data-original"), el.currentSrc, el.getAttribute("src")]) {
      if (c && !isPlaceholder(c)) return c;
    }
    const srcset = el.getAttribute("data-srcset") || el.getAttribute("srcset");
    const first = srcset ? srcset.split(",")[0]?.trim().split(/\s+/)[0] : null;
    return first && !isPlaceholder(first) ? first : null;
  };
  const describe = (el: Element): string => {
    const parts: string[] = [];
    let node: Element | null = el;
    for (let i = 0; i < 3 && node; i++) {
      parts.push(node.getAttribute("src") || "", node.getAttribute("alt") || "", node.getAttribute("title") || "", node.getAttribute("aria-label") || "", typeof node.className === "string" ? node.className : (node.getAttribute("class") || ""), node.id || "");
      node = node.parentElement;
    }
    return parts.join(" ").toLowerCase();
  };
  const push = (el: Element, url: string | null, isSvg: boolean) => {
    if (!url || seen.has(el)) return;
    seen.add(el);
    const r = el.getBoundingClientRect();
    const link = el.closest("a");
    const href = link ? abs(link.getAttribute("href")) || "" : "";
    const inHeader = !!el.closest('header, nav, [role="banner"], [class*="header" i], [id*="header" i], [class*="navbar" i]');
    const inFooter = !!el.closest('footer, [role="contentinfo"], [class*="footer" i], [id*="footer" i]');
    const strong = !!el.closest('.custom-logo-link, .site-branding, .site-logo, [class*="custom-logo" i], a[rel="home"]') || /custom-logo|site-logo/i.test(el.getAttribute("class") || "");
    const linksHome = !!href && (href === home || href === location.origin || href.replace(/[?#].*$/, "") === home || href.endsWith("/index.html"));
    const img = el as HTMLImageElement;
    out.push({
      url,
      w: Math.round(r.width),
      h: Math.round(r.height),
      top: Math.round(r.top + window.scrollY),
      naturalW: isSvg ? 0 : img.naturalWidth || 0,
      naturalH: isSvg ? 0 : img.naturalHeight || 0,
      text: describe(el),
      href,
      inHeader,
      inFooter,
      strong,
      linksHome,
      isSvg,
    });
  };

  for (const img of Array.from(document.querySelectorAll<HTMLImageElement>("img"))) {
    const r = img.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const top = r.top + window.scrollY;
    const hinted = /logo|brand/i.test(`${img.getAttribute("src") || ""} ${img.alt} ${img.className} ${img.parentElement?.className || ""}`);
    if (top > 900 && !hinted) continue;
    push(img, abs(srcOf(img)), false);
  }
  for (const svg of Array.from(document.querySelectorAll("svg"))) {
    const r = svg.getBoundingClientRect();
    if (r.top + window.scrollY > 400 || r.width < 40) continue;
    const hinted = /logo|brand/i.test(`${svg.getAttribute("class") || ""} ${svg.parentElement?.className || ""} ${svg.closest("a")?.className || ""}`) || !!svg.closest('a[rel="home"], header a[href="/"]');
    if (!hinted) continue;
    push(svg, `data:image/svg+xml;utf8,${encodeURIComponent(svg.outerHTML)}`, true);
  }
  return out.slice(0, 80);
}
