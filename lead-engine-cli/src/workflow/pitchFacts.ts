/**
 * Ce que chaque nœud exécuté apporte à la consigne des textes commerciaux : des constats mesurés, rien quand il n'a
 * rien trouvé. Un module du site ne contribue que s'il est `done` dans la trace ; la fiche Maps, la preuve du besoin et
 * la démo complémentaire contribuent toujours (en mode préparation, leurs nœuds sont sautés car écrits par la file).
 * Une mesure absente n'apparaît pas : jamais de valeur par défaut présentée comme mesurée.
 */
import { WORKFLOW_NODES, isReportProof, type ChannelId, type OpportunityDefinition } from "../../../shared/opportunities";
import type { CompetitorPixels } from "../collector/competitorPixels";
import { dateFr } from "../generator/reportLayout";
import { CONSENT_GATED_LABEL, trackingView } from "../generator/reportScoring";
import type { MapsCompetitor, MapsLead, SiteInspection } from "../types";
import type { NodeRun, SireneInfo } from "./runner";

export interface PitchFact {
  /** Libellé court (« Titre de la page »), réutilisable plus tard pour un affichage. */
  label: string;
  /** Valeur mesurée ou calculée, déjà rédigée en français. */
  value: string;
}

/** Entrée commune aux deux modes. */
export interface PitchInput {
  def: OpportunityDefinition;
  lead: MapsLead;
  /** Lien principal `/demos/:id` (démo de site ou bilan). */
  demoUrl: string;
  primaryChannel: ChannelId;
  inspection: SiteInspection | null;
  sirene: SireneInfo | null;
  trace: NodeRun[];
  /** Bilan seulement : score et actions prioritaires (calcul déterministe, identique dans les deux modes). */
  report: { score: number; actions: string[] } | null;
  competitorPixels: CompetitorPixels[] | null;
  /** Démo de site complémentaire d'un bilan, null si elle n'est pas produite. */
  siteDemoUrl: string | null;
}

type Contribution = (p: PitchInput) => PitchFact[] | null;

const MAX_REVIEWS = 2;
const MAX_EXCERPT = 200;

const fact = (label: string, value: string): PitchFact => ({ label, value });
const nonEmpty = (facts: PitchFact[]): PitchFact[] | null => (facts.length ? facts : null);
const quote = (s: string): string => `« ${s} »`;
const ordinal = (n: number): string => (n === 1 ? "1re" : `${n}e`);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
/** Fiche Google Maps réelle derrière le prospect (sinon métier, ville, note et avis sont de remplissage). */
const hasListing = (lead: MapsLead): boolean => !lead.noMapsListing;

function excerpt(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= MAX_EXCERPT) return t;
  const cut = t.slice(0, MAX_EXCERPT - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > MAX_EXCERPT / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** Note et nombre d'avis, chacun seulement s'il a été lu ; null si aucun des deux. */
function ratingText(rating: number | null, reviews: number | null): string | null {
  const parts = [isNum(rating) ? `${rating}/5` : null, isNum(reviews) ? `${reviews} avis` : null].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function competitorText(c: MapsCompetitor): string {
  const r = ratingText(c.rating, c.reviewsCount);
  return `${c.name} (${ordinal(c.rank)}${r ? `, ${r}` : ""})`;
}

const sortedCompetitors = (lead: MapsLead): MapsCompetitor[] => [...(lead.competitors ?? [])].sort((a, b) => a.rank - b.rank);

/** Fiche Maps : identité, note, avis, recherche, rang et concurrents, seulement ce qui a été lu. */
const mapsListing: Contribution = ({ lead }) => {
  const facts = [fact("Entreprise", lead.name)];
  if (!hasListing(lead)) return facts;
  if (lead.activity?.trim()) facts.push(fact("Métier", lead.activity.trim()));
  if (lead.city?.trim()) facts.push(fact("Ville", lead.city.trim()));
  const rating = ratingText(lead.rating, lead.reviewsCount);
  if (rating) facts.push(fact("Note Google", rating));
  for (const r of lead.recentReviews.filter((r) => r.text?.trim()).slice(0, MAX_REVIEWS)) {
    const author = r.author?.trim();
    facts.push(fact("Avis client", `${quote(excerpt(r.text))}${author ? ` — ${author}` : ""}`));
  }
  const query = lead.mapsQuery?.trim();
  const date = dateFr(lead.mapsCheckedAt);
  if (query) facts.push(fact("Recherche Google Maps", `${quote(query)}${date ? `, constat du ${date}` : ""}`));
  if (isNum(lead.mapsRank)) facts.push(fact("Position sur Google Maps", `${ordinal(lead.mapsRank)} sur cette recherche`));
  const competitors = sortedCompetitors(lead).slice(0, 5);
  if (competitors.length) facts.push(fact("Concurrents relevés", competitors.map(competitorText).join(" ; ")));
  return facts;
};

/** Métier et ville dans le titre ou le H1 (même règle que la démo complémentaire : prospect avec fiche seulement). */
function keywordsText(lead: MapsLead, i: SiteInspection): string | null {
  const seo = i.seo!;
  if (!hasListing(lead)) return null;
  const a = seo.activityInTitleOrH1;
  const c = seo.cityInTitleOrH1;
  if (a && c) return "le métier et la ville figurent dans le titre ou le H1";
  if (!a && !c) return "ni le métier ni la ville ne figurent dans le titre ou le H1";
  return a
    ? "la ville ne figure ni dans le titre ni dans le H1 ; le métier y figure"
    : "le métier ne figure ni dans le titre ni dans le H1 ; la ville y figure";
}

const seoOnPage: Contribution = ({ lead, inspection: i }) => {
  const seo = i?.seo;
  if (!i || !seo) return null;
  const keywords = keywordsText(lead, i);
  const title = seo.title?.trim() ? quote(seo.title.trim()) : "aucun titre";
  return [
    fact("Titre de la page", `${title}${keywords ? ` — ${keywords}` : ""}`),
    fact("Titre principal (H1)", seo.h1?.trim() ? quote(seo.h1.trim()) : "aucun H1"),
    fact("Description de la page", seo.metaDescription?.trim() ? quote(seo.metaDescription.trim()) : "aucune description"),
  ];
};

/** Dirigeant cité sur le site (les noms venus de SIRENE, fusionnés dans l'inspection, sont retirés). */
const contactsLegal: Contribution = ({ inspection: i, sirene }) => {
  const fromSirene = new Set(sirene?.keyPeople ?? []);
  const people = (i?.keyPeople ?? []).filter((n) => !fromSirene.has(n));
  return people.length ? [fact("Dirigeant cité sur le site", people.join(", "))] : null;
};

const dirigeantSirene: Contribution = ({ sirene }) => {
  if (!sirene) return null;
  const facts: PitchFact[] = [];
  if (sirene.keyPeople.length) facts.push(fact("Dirigeant (registre SIRENE)", sirene.keyPeople.join(", ")));
  const created = dateFr(sirene.createdAt);
  if (created) facts.push(fact("Date de création de l'entreprise", created));
  return nonEmpty(facts);
};

const perfMobile: Contribution = ({ inspection: i }) => {
  if (typeof i?.isResponsive !== "boolean") return null;
  return [fact("Affichage sur téléphone", i.isResponsive ? "correct, sans débordement" : "débordements constatés sur téléphone")];
};

const freshnessSsl: Contribution = ({ inspection: i }) => {
  if (!i) return null;
  const facts: PitchFact[] = [];
  if (typeof i.isHttps === "boolean") facts.push(fact("HTTPS", i.isHttps ? "site servi en HTTPS" : "site servi en HTTP, non sécurisé"));
  if (isNum(i.copyrightYear)) facts.push(fact("Année du copyright", String(i.copyrightYear)));
  if (i.obsolescenceSignals?.length) facts.push(fact("Signaux d'obsolescence", i.obsolescenceSignals.join(" ; ")));
  return nonEmpty(facts);
};

const techStack: Contribution = ({ inspection: i }) =>
  i?.stack?.length ? [fact("Technologie du site", i.stack.join(", "))] : null;

/** Pixels publicitaires : relevés à la visite, ou seulement présents dans la page derrière le bandeau cookies. */
const adsPixelSpy: Contribution = ({ inspection: i }) => {
  if (!i) return null;
  // Pixels non relevés à la visite : les identifiants lus derrière le bandeau restent des constats, l'absence non.
  const measured = Array.isArray(i.paidAdsDetected);
  const { consentGated, pixels, afterConsent } = trackingView(measured ? i : { ...i, paidAdsDetected: [] });
  if (!pixels || (!measured && !afterConsent.length)) return null;
  const facts: PitchFact[] = [];
  if (pixels.length) {
    const value = pixels
      .map((px) => `${px} : ${afterConsent.includes(px) ? CONSENT_GATED_LABEL : "relevé à la visite de la page"}`)
      .join(" ; ");
    facts.push(fact("Pixels publicitaires", value));
  } else {
    facts.push(fact("Pixels publicitaires", consentGated
      ? "aucun relevé à la visite ; bandeau cookies présent, un pixel déclenché après accord n'est pas vérifié"
      : "aucun relevé à la visite de la page"));
  }
  const ids = consentGated ? [...(i.htmlTagIds?.googleAds ?? []), ...(i.htmlTagIds?.metaPixel ?? [])] : [];
  if (ids.length) facts.push(fact("Identifiants publicitaires lus dans la page", ids.join(", ")));
  return facts;
};

const SOCIAL_LABELS = { facebook: "Facebook", instagram: "Instagram", linkedin: "LinkedIn" } as const;

const socialLinks: Contribution = ({ inspection: i }) => {
  const links = i?.socialLinks;
  if (!links) return null;
  const found = (Object.keys(SOCIAL_LABELS) as (keyof typeof SOCIAL_LABELS)[]).filter((k) => links[k]?.length).map((k) => SOCIAL_LABELS[k]);
  return found.length ? [fact("Réseaux sociaux liés au site", found.join(", "))] : null;
};

/** Présence du formulaire seulement, pas ses champs. */
const contactForm: Contribution = ({ inspection: i }) =>
  i?.contactForm ? [fact("Formulaire de contact", `présent sur ${i.contactForm.url}`)] : null;

const reportLabel = (p: PitchInput): string =>
  p.def.proof.kind === "visibility_report" ? "bilan de visibilité locale" : "bilan d'acquisition";

/** Preuve « bilan » : lien principal, score et actions prioritaires (et pixels des concurrents pour l'acquisition). */
const reportProof: Contribution = (p) => {
  const facts = [fact(`Lien du ${reportLabel(p)}`, p.demoUrl)];
  if (p.report) {
    facts.push(fact("Score du bilan", `${p.report.score}/100 sur les critères mesurés`));
    if (p.report.actions.length) facts.push(fact("Actions prioritaires du bilan", p.report.actions.join(" ; ")));
  }
  if (p.def.proof.kind === "acquisition_report") {
    for (const c of [...(p.competitorPixels ?? [])].sort((a, b) => a.rank - b.rank)) {
      const pixels = c.pixels === null ? "non vérifié" : c.pixels.length ? c.pixels.join(", ") : "aucun pixel publicitaire relevé sur l'accueil";
      facts.push(fact("Pixels d'un concurrent", `${c.name} (${ordinal(c.rank)} sur Google Maps) : ${pixels}`));
    }
  }
  return facts;
};

const demoProof: Contribution = (p) => [fact("Lien de la démo de site", p.demoUrl)];

/** Démo de site complémentaire d'un bilan, seulement si elle est produite. */
const siteDemo: Contribution = (p) =>
  isReportProof(p.def.proof.kind) && p.siteDemoUrl ? [fact("Démo de site complémentaire", p.siteDemoUrl)] : null;

/** Contribution de chaque nœud, indexée par identifiant de nœud. */
const CONTRIBUTIONS: Partial<Record<string, Contribution>> = {
  maps_search: mapsListing,
  seo_onpage: seoOnPage,
  contacts_legal: contactsLegal,
  dirigeant_sirene: dirigeantSirene,
  perf_mobile: perfMobile,
  freshness_ssl: freshnessSsl,
  tech_stack: techStack,
  ads_pixel_spy: adsPixelSpy,
  social_links: socialLinks,
  contact_form: contactForm,
  demo_web: demoProof,
  visibility_report: reportProof,
  acquisition_report: reportProof,
  site_demo: siteDemo,
};

/** Nœuds qui contribuent sans dépendre de la trace : la fiche Maps, la preuve du besoin et la démo complémentaire. */
function contributesAlways(nodeId: string, def: OpportunityDefinition): boolean {
  const node = WORKFLOW_NODES.find((n) => n.id === nodeId);
  if (!node) return false;
  if (node.id === "maps_search" || node.binding.kind === "site_demo") return true;
  return node.binding.kind === "proof" && node.binding.proof === def.proof.kind;
}

/** Constats, dans l'ordre de `WORKFLOW_NODES` ; la fiche Maps d'abord. */
export function pitchFacts(p: PitchInput): PitchFact[] {
  const done = new Set(p.trace.filter((t) => t.status === "done").map((t) => t.node));
  return WORKFLOW_NODES.flatMap((node) => {
    const contribution = CONTRIBUTIONS[node.id];
    if (!contribution) return [];
    if (!contributesAlways(node.id, p.def) && !done.has(node.id)) return [];
    return contribution(p) ?? [];
  });
}

/** Angle du bilan de visibilité selon le rang mesuré. */
function visibilityConstat(lead: MapsLead): string {
  const rank = hasListing(lead) ? lead.mapsRank : null;
  if (!isNum(rank)) return "un constat tiré du bilan (avis, fiche ou site), sans évoquer de classement sur Google Maps : il n'a pas été mesuré";
  const query = lead.mapsQuery?.trim() ? `sur ${quote(lead.mapsQuery.trim())}` : "sur Google Maps";
  const competitors = sortedCompetitors(lead);
  if (rank === 1) {
    const next = competitors.find((c) => c.rank > 1);
    if (!next) return `il est 1er ${query} : l'enjeu est de consolider son avance`;
    let gap = "";
    if (isNum(lead.reviewsCount) && isNum(next.reviewsCount)) {
      const diff = lead.reviewsCount - next.reviewsCount;
      gap = diff > 0 ? `, qui a ${diff} avis de moins que lui`
        : diff < 0 ? `, qui a déjà ${-diff} avis de plus que lui`
        : ", qui a autant d'avis que lui";
    }
    return `il est 1er ${query} : l'enjeu est de consolider son avance face à ${next.name} (${ordinal(next.rank)})${gap}`;
  }
  const ahead = competitors.filter((c) => c.rank < rank).map((c) => c.name);
  const who = ahead.length ? `les concurrents qui passent devant lui (${ahead.join(", ")})` : "les concurrents qui passent devant lui";
  return `il est ${ordinal(rank)} ${query} : ${who}`;
}

/** Angle de la preuve du besoin : comment présenter le lien principal. Une ou deux phrases. */
export function proofAngle(p: PitchInput): string {
  const kind = p.def.proof.kind;
  if (kind === "demo_web") {
    return p.lead.website
      ? "Présente la maquette de site préparée pour lui (lien principal) face à son site actuel."
      : "Présente la maquette de site préparée pour lui (lien principal) : il n'a pas de site aujourd'hui.";
  }
  if (kind === "audit_report") return "";
  const constat = kind === "visibility_report"
    ? visibilityConstat(p.lead)
    : "un constat sur le suivi des conversions, les pixels publicitaires ou la page d'arrivée";
  const demo = p.siteDemoUrl
    ? "La démo de site complémentaire n'est qu'un complément éventuel ; le lien principal reste le bilan."
    : "Aucune démo de site n'est produite : ne propose pas de nouveau site.";
  return `Présente le ${reportLabel(p)} préparé pour lui (lien principal), un bilan chiffré de sa situation et pas une maquette de site, avec un seul constat : ${constat}. ${demo}`;
}
