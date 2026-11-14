import type { OpportunityId } from "../../../shared/opportunities";
/**
 * Système de templating des emails.
 *
 * Règle métier : AUCUN email ne part automatiquement. Les templates servent uniquement
 * à pré-remplir un brouillon que l'utilisateur relit, modifie puis envoie lui-même
 * (mailto / copie), avant de le marquer explicitement comme envoyé.
 *
 * Syntaxe : {{variable}} ou {{variable|valeur de repli}}.
 * Pour ajouter un template : ajouter une entrée dans EMAIL_TEMPLATES.
 */

export interface EmailTemplate {
  id: string;
  label: string;
  /** Opportunités pour lesquelles le template est proposé ("*" = toutes). */
  /** Identifiants de shared/opportunities, ou "*" pour toutes. */
  opportunities: (OpportunityId | "*")[];
  /** Étape du cycle : premier contact, relance, etc. */
  stage: "first_contact" | "follow_up" | "proof" | "closing";
  subject: string;
  body: string;
}

export const SENDER = {
  name: "Loïc Alcantara",
  email: "loic.alcantara@gmail.com",
  signature: `--
Loïc Alcantara
Développeur Web Senior (14 ans d'exp) | Performance & Architecture
Applications critiques et SaaS (PHP / Symfony, microservices, robustesse système & monitoring).
loic.alcantara@gmail.com | https://www.linkedin.com/in/loicalcantara/`,
};

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: "qa_trackers_first",
    label: "Traceurs RGPD — Premier contact dev-to-dev",
    opportunities: ["audit_qa_trackers"],
    stage: "first_contact",
    subject: "[Dev QA] Petite régression réseau repérée sur {{domain}} (tags avant CMP)",
    body: `{{greeting}}

{{stack_compliment|Je suis tombé sur votre site en faisant un tour des réalisations d'agences.}}

Pour situer : je suis développeur backend depuis 14 ans (architecture, robustesse système) et je conçois des briques de QA réseau et d'automatisation CI/CD pour les équipes techniques.

{{qa_trackers_intro}}

Dans 9 cas sur 10, c'est simplement un tag marketing mal conditionné dans Google Tag Manager, ou une petite régression passée inaperçue lors d'un déploiement.

Le rapport détaillé est ici, en accès libre pour vos devs :
👉 {{report_url}}

J'ai automatisé ce check en CI/CD headless : il surveille l'ensemble des sites d'un portfolio et alerte dès qu'une CMP saute ou qu'un nouveau tag fuit sans consentement.

Si ça vous intéresse d'avoir ce filet de sécurité continu sur vos sites clients, dites-moi simplement par retour de mail et je vous branche ça rapidement (je fonctionne 100% à l'écrit / asynchrone).

Bonne continuation,

{{sender_signature}}`,
  },
  {
    id: "qa_trackers_follow_up",
    label: "Traceurs RGPD — Relance douce J+4",
    opportunities: ["audit_qa_trackers"],
    stage: "follow_up",
    subject: "Re: [Dev QA] Petite régression réseau repérée sur {{domain}}",
    body: `{{greeting}}

Petit suivi rapide : votre équipe a-t-elle pu jeter un œil au rapport ?
👉 {{report_url}}

Les scripts concernés se déclenchent toujours avant consentement au premier chargement. Si c'est déjà corrigé côté GTM, ignorez simplement ce message.

Bonne journée,

{{sender_signature}}`,
  },
  {
    id: "perf_audit_first",
    label: "Audit Performance — Temps de chargement mobile",
    opportunities: ["*"],
    stage: "proof",
    subject: "Quelques points relevés sur {{domain}}",
    body: `{{greeting}}

{{perf_audit_intro}}

Si vous voulez le détail technique, dites-le-moi simplement par retour de mail.

{{sender_signature}}`,
  },
  {
    id: "website_demo",
    label: "Site Web — Envoi de la démo interactive",
    opportunities: ["website_redesign", "website_creation", "website"],
    stage: "proof",
    subject: "Démo de votre futur site web pour {{company_name}}",
    body: `Bonjour,

Comme convenu, voici la démo du nouveau site que nous avons préparée pour {{company_name}} :
👉 {{demo_url}}

Elle est pensée pour le mobile, avec un bouton d'appel direct et vos avis Google mis en valeur.

N'hésitez pas à me faire vos retours par simple réponse à ce mail.

Bien cordialement,
{{sender_name}}`,
  },
];

export interface TemplateLeadInput {
  company_name: string;
  website_url?: string | null;
  city?: string | null;
  activity?: string | null;
  demo_url: string;
  audit?: Record<string, unknown> | null;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
}

export function extractDomain(url?: string | null): string {
  if (!url) return "";
  return url.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/[/?#].*$/, "");
}

/** Construit le dictionnaire de variables injectables à partir d'un lead. */
export function buildTemplateVars(lead: TemplateLeadInput): Record<string, string> {
  const audit = lead.audit ?? {};
  const keyPeople = asStringArray(audit.key_people);
  const stack = asStringArray(audit.stack);
  const awards = asStringArray(audit.awards);
  const trackers = asStringArray(audit.trackers_found);
  const weaknesses = asStringArray(audit.weaknesses);
  const reportUrl = typeof audit.report_url === "string" && audit.report_url ? audit.report_url : lead.demo_url;

  const domain = extractDomain(lead.website_url) || lead.company_name;
  const weaknessesList = weaknesses.map((w) => `- ${w}`).join("\n");

  const firstName = keyPeople[0]?.split(" ")[0] ?? "";
  const greeting = firstName
    ? `Hello ${firstName} & l'équipe ${lead.company_name},`
    : `Hello l'équipe ${lead.company_name},`;

  let stackCompliment = "";
  if (awards.length) stackCompliment = `Bravo pour ${awards.join(", ")}, c'est mérité.`;
  if (stack.length) {
    stackCompliment += `${stackCompliment ? " " : ""}Le travail sur votre stack (${stack.join(", ")}) est propre.`;
  }

  const trackersList = (trackers.length ? trackers : weaknesses).map((t) => `- ${t}`).join("\n");

  return {
    company_name: lead.company_name,
    agency_name: lead.company_name,
    domain,
    city: lead.city ?? "",
    activity: lead.activity ?? "",
    key_people: firstName,
    greeting,
    stack: stack.join(", "),
    awards: awards.join(", "),
    stack_compliment: stackCompliment,
    trackers_list: trackersList,
    // Sans traceur à citer, l'introduction disparaît avec la liste (même principe que perf_audit_intro).
    qa_trackers_intro: trackersList
      ? `En inspectant la cascade réseau au premier chargement de ${domain} (session Chromium vierge, sans clic sur le bandeau de consentement), certains scripts s'exécutent immédiatement :\n${trackersList}`
      : "",
    // Sans faiblesse mesurée, pas de « quelques points » suivi de rien : le paragraphe devient une simple proposition.
    perf_audit_intro: weaknesses.length
      ? `En regardant ${domain}, j'ai relevé quelques points sur votre site :\n${weaknessesList}\n\nJe peux vous détailler chacun d'eux si cela vous est utile.`
      : `Je me suis intéressé à ${domain} et je peux vous envoyer un diagnostic rapide du chargement sur mobile.`,
    weaknesses_list: weaknessesList,
    report_url: reportUrl,
    demo_url: lead.demo_url,
    sender_name: SENDER.name,
    sender_email: SENDER.email,
    sender_signature: SENDER.signature,
  };
}

/** Remplace {{var}} et {{var|fallback}}. Une variable vide ou inconnue utilise le repli (ou chaîne vide). */
export function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{\{\s*([a-z0-9_]+)\s*(?:\|([^}]*))?\}\}/gi, (_m, key: string, fallback?: string) => {
    const v = vars[key];
    return v !== undefined && v !== "" ? v : (fallback ?? "");
  });
}

/** Templates proposés pour une opportunité donnée (spécifiques d'abord, puis génériques). */
export function templatesForOpportunity(opportunityId: string): EmailTemplate[] {
  const specific = EMAIL_TEMPLATES.filter((t) => (t.opportunities as string[]).includes(opportunityId));
  const generic = EMAIL_TEMPLATES.filter((t) => t.opportunities.includes("*"));
  return [...specific, ...generic];
}
