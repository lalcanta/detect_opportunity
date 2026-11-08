import type { ScanModule } from "./types";

const JUNK_EMAIL_RE = /(sentry|wixpress|example\.com|domain\.com|votremail|votre-email|email@|nom@|user@|test@|noreply|no-reply|donotreply|\.(png|jpe?g|gif|svg|webp|css|js|woff2?)$)/i;

/** Extrait, nettoie et trie par pertinence les adresses email trouvées dans du texte ou des liens mailto. */
export function extractCleanEmails(rawText: string): string[] {
  const matches = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,12}/g) ?? [];
  const unique = new Set<string>();
  for (const m of matches) {
    const clean = m.toLowerCase().replace(/^u003e|^20/, "").trim();
    if (clean.length >= 6 && clean.length <= 80 && !JUNK_EMAIL_RE.test(clean)) {
      unique.add(clean);
    }
  }
  const preferredPrefix = /^(contact|hello|bonjour|info|studio|agence|commercial|direction|welcome)@/i;
  return [...unique].sort((a, b) => {
    const aPref = preferredPrefix.test(a) ? 0 : 1;
    const bPref = preferredPrefix.test(b) ? 0 : 1;
    return aPref - bPref;
  });
}

/** Extrait le nom du dirigeant / directeur de la publication depuis le texte des mentions légales. */
export function extractKeyPeopleFromText(rawText: string): string[] {
  const normalized = rawText.replace(/\s+/g, " ");
  const patterns = [
    /(?:directeur|directrice|responsable)\s+(?:de\s+(?:la\s+)?)?publication\s*(?:est|:|-|–)\s*(?:M\.|Mme|Monsieur|Madame)?\s*([A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'-]+\s+[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'-]+)/i,
    /(?:gérant|co-gérant|président|fondateur)\s*(?:est|:|-|–)\s*(?:M\.|Mme|Monsieur|Madame)?\s*([A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'-]+\s+[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'-]+)/i,
    /représentée?\s+par\s+(?:M\.|Mme|Monsieur|Madame)?\s*([A-ZÀ-ÖØ-Þ][a-zà-öø-ÿ'-]+\s+[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'-]+)/i,
  ];
  const stopWords = /^(La Société|Le Site|La Direction|Mentions Légales|Tous Droits|Hébergement|Contact|Directeur|Société)/i;
  const found: string[] = [];
  for (const re of patterns) {
    const m = normalized.match(re);
    if (m?.[1]) {
      const candidate = m[1].trim();
      if (candidate.length >= 5 && candidate.length <= 45 && !stopWords.test(candidate) && !found.includes(candidate)) {
        found.push(candidate);
      }
    }
  }
  return found;
}

export const contactsLegalModule: ScanModule = {
  id: "contacts_legal",
  label: "Emails & Décideurs (Mentions Légales / Contact)",
  description: "Extrait les emails de contact et le nom du dirigeant depuis l'accueil et les pages /mentions-legales ou /contact.",
  async afterNavigate({ page, result }) {
    const { rawEmailsBlob, rawText, internalLinks } = await page.evaluate(() => {
      const text = document.body?.innerText || "";
      const mailtos = Array.from(document.querySelectorAll("a[href^='mailto:']"))
        .map((a) => (a.getAttribute("href") || "").replace(/^mailto:/i, "").split("?")[0] || "")
        .join(" ");

      const links: string[] = [];
      for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
        const href = a.href;
        const label = (a.textContent || "") + " " + href;
        if (/mentions-l[eé]gales|legal|politique-de-confidentialit|contact/i.test(label)) {
          try {
            const u = new URL(href, location.href);
            if (u.hostname === location.hostname && !links.includes(u.href)) {
              links.push(u.href);
            }
          } catch {
            // ignore
          }
        }
      }
      return {
        rawEmailsBlob: `${mailtos} ${text}`,
        rawText: text,
        internalLinks: links.slice(0, 2),
      };
    });

    const emailSet = new Set<string>(extractCleanEmails(rawEmailsBlob));
    const peopleSet = new Set<string>(extractKeyPeopleFromText(rawText));

    if ((emailSet.size === 0 || peopleSet.size === 0) && internalLinks.length > 0) {
      for (const linkUrl of internalLinks) {
        try {
          const resp = await page.request.get(linkUrl, { timeout: 4500 });
          if (resp.ok()) {
            const subHtml = await resp.text();
            const subText = subHtml
              .replace(/<script[\s\S]*?<\/script>/gi, " ")
              .replace(/<style[\s\S]*?<\/style>/gi, " ")
              .replace(/<[^>]+>/g, " ");
            for (const e of extractCleanEmails(subHtml + " " + subText)) emailSet.add(e);
            for (const p of extractKeyPeopleFromText(subText)) peopleSet.add(p);
          }
        } catch {
          // ignore timeout
        }
      }
    }

    result.emails = [...emailSet].slice(0, 5);
    result.keyPeople = [...peopleSet].slice(0, 3);
  },
};
