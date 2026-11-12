/**
 * Workflow d'un besoin vu comme un graphe de nœuds qui complètent un dossier partagé (le « dossier prospect »).
 *
 * Chaque nœud déclare les clés du dossier qu'il lit et celles qu'il écrit. L'ordre se déduit des dépendances, les
 * prérequis manquants se calculent, et un workflow incohérent (un email envoyé sans module qui trouve l'email) est
 * refusé. Les nœuds d'un besoin se déduisent de ses champs (`scanModules`, `channels`, `pitch`, `proof`, `flyer`) :
 * le graphe ne stocke rien de plus, il rend ces champs lisibles et éditables au clic.
 *
 * Pur et sans dépendance : utilisé par la validation, l'onglet Besoins (catalogue JSON) et, plus tard, le worker.
 */
import {
  CHANNEL_IDS,
  PITCH_GENERATOR_IDS,
  SCAN_MODULE_IDS,
  type ChannelId,
  type OpportunityDefinition,
  type PitchGeneratorId,
  type ScanModuleId,
  type WebsiteRequirement,
} from "./types";

/** Clés du dossier prospect. */
export const DATA_KEYS = {
  fiche: { label: "Fiche Maps", description: "Nom, catégorie, ville, note, avis et lien de la fiche." },
  prospect: { label: "Prospect retenu", description: "Le prospect a passé le filtre Maps." },
  telephone: { label: "Téléphone", description: "Numéro de la fiche Maps (peut manquer)." },
  site: { label: "Site web", description: "Adresse du site du prospect (absente pour un besoin « sans site »)." },
  site_garanti: { label: "Site garanti", description: "Le filtre Maps exige un site : il est toujours présent." },
  identite: { label: "Identité visuelle", description: "Logo, couleurs dominantes, photos et capture du site." },
  email: { label: "Email", description: "Adresse trouvée sur le site." },
  formulaire: { label: "Formulaire", description: "Formulaire de contact du site." },
  reseaux: { label: "Réseaux sociaux", description: "Liens Facebook, Instagram, LinkedIn…" },
  dirigeant: { label: "Dirigeant", description: "SIREN et nom du dirigeant." },
  mobile: { label: "Diagnostic mobile", description: "Affichage sur téléphone et débordements." },
  fraicheur: { label: "HTTPS et fraîcheur", description: "Certificat, année du copyright, images cassées." },
  techno: { label: "Technologie", description: "CMS ou constructeur du site." },
  pixels: { label: "Pixels publicitaires", description: "Google Ads, Meta, TikTok…" },
  traceurs: { label: "Traceurs mesurés", description: "Traceurs tiers déclenchés avant consentement." },
  lead_qualifie: { label: "Lead qualifié", description: "Contacts exigés vérifiés après l'inspection." },
  preuve: { label: "Preuve", description: "Démo de site ou rapport d'audit." },
  rapport: { label: "Rapport d'audit", description: "Rapport des traceurs, cité par l'email d'audit." },
  flyer: { label: "Flyer", description: "PDF avec QR code vers les avis Google." },
  script_appel: { label: "Script d'appel", description: "Accroche, arguments et objections pour le closer." },
  message_ecrit: { label: "Message écrit", description: "Email d'approche, aussi collé dans un formulaire." },
  lead_crm: { label: "Lead dans le CRM", description: "Lead synchronisé et attribué à un closer." },
} as const;
export type DataKey = keyof typeof DATA_KEYS;

/** Étapes du workflow, dans l'ordre d'affichage (une ligne du graphe par étape). */
export const WORKFLOW_STAGES = [
  { id: "source", label: "Collecte" },
  { id: "filter", label: "Filtre" },
  { id: "inspect", label: "Inspection du site" },
  { id: "qualify", label: "Qualification" },
  { id: "produce", label: "Preuve" },
  { id: "message", label: "Messages" },
  { id: "handoff", label: "Remise" },
  { id: "channel", label: "Premier contact" },
] as const;
export type WorkflowStage = (typeof WORKFLOW_STAGES)[number]["id"];

/** Ce qu'un nœud représente dans la définition du besoin. */
export type NodeBinding =
  | { kind: "fixed" }
  | { kind: "module"; module: ScanModuleId }
  | { kind: "channel"; channel: ChannelId }
  | { kind: "pitch"; generator: PitchGeneratorId }
  | { kind: "proof"; proof: "demo_web" | "audit_report" }
  | { kind: "flyer" };

export interface WorkflowNodeType {
  id: string;
  stage: WorkflowStage;
  label: string;
  description: string;
  icon: string;
  /** Clés indispensables : sans elles le nœud ne peut pas tourner. */
  reads: readonly DataKey[];
  /** Clés utilisées si elles sont présentes (enrichissent le résultat). */
  optionalReads?: readonly DataKey[];
  writes: readonly DataKey[];
  binding: NodeBinding;
}

const mod = (
  module: ScanModuleId,
  label: string,
  description: string,
  icon: string,
  writes: DataKey[],
  reads: DataKey[] = ["site"],
): WorkflowNodeType => ({ id: module, stage: "inspect", label, description, icon, reads, writes, binding: { kind: "module", module } });

/** Optionnels lus par les messages : faiblesses et contexte trouvés pendant l'inspection. */
const PITCH_CONTEXT: DataKey[] = ["fiche", "dirigeant", "mobile", "fraicheur", "techno", "pixels", "reseaux"];

/** Catalogue des nœuds. L'ordre sert de préférence quand plusieurs nœuds peuvent fournir une clé. */
export const WORKFLOW_NODES: readonly WorkflowNodeType[] = [
  {
    id: "maps_search",
    stage: "source",
    label: "Recherche Maps",
    description: "Interroge Google Maps avec la requête et la zone du scan, puis lit chaque fiche.",
    icon: "search",
    reads: [],
    writes: ["fiche"],
    binding: { kind: "fixed" },
  },
  {
    id: "maps_filter",
    stage: "filter",
    label: "Filtre Maps",
    description: "Retient ou écarte la fiche avant toute visite du site : site, note et nombre d'avis.",
    icon: "sliders",
    reads: ["fiche"],
    writes: ["prospect", "telephone", "site", "site_garanti"],
    binding: { kind: "fixed" },
  },
  mod("branding_visual", "Logo et couleurs", "Logo, couleurs dominantes, photos et capture de l'accueil.", "sparkles", ["identite"]),
  mod("contacts_legal", "Email et mentions", "Emails et dirigeant sur l'accueil, la page contact et les mentions légales.", "mail", ["email"]),
  mod("contact_form", "Formulaire de contact", "Repère un formulaire utilisable et ses champs.", "message", ["formulaire"]),
  mod("social_links", "Réseaux sociaux", "Liens Facebook, Instagram, LinkedIn… du site.", "users", ["reseaux"]),
  mod("dirigeant_sirene", "Dirigeant (SIRENE)", "SIREN et dirigeant dans la base SIRENE, à partir du nom et de la ville.", "user", ["dirigeant"], ["prospect"]),
  mod("perf_mobile", "Affichage mobile", "Affichage sur téléphone (390 px) et débordements.", "phone", ["mobile"]),
  mod("freshness_ssl", "HTTPS et fraîcheur", "Certificat HTTPS, année du copyright, images cassées.", "shield", ["fraicheur"]),
  mod("tech_stack", "Technologie du site", "CMS ou constructeur (WordPress, Wix, Shopify…).", "cpu", ["techno"]),
  mod("ads_pixel_spy", "Pixels publicitaires", "Pixels Google Ads, Meta, TikTok…", "target", ["pixels"]),
  mod("trackers_cmp", "Traceurs RGPD", "Traceurs tiers déclenchés avant l'accord du bandeau cookies.", "eye", ["traceurs"]),
  {
    id: "qualify",
    stage: "qualify",
    label: "Qualification",
    description: "Après l'inspection, écarte le lead s'il manque un contact exigé.",
    icon: "check-circle",
    reads: ["prospect"],
    optionalReads: ["telephone", "email", "formulaire"],
    writes: ["lead_qualifie"],
    binding: { kind: "fixed" },
  },
  {
    id: "demo_web",
    stage: "produce",
    label: "Démo de site",
    description: "Site de démonstration personnalisé, hébergé et suivi.",
    icon: "sparkles",
    reads: ["lead_qualifie"],
    optionalReads: ["fiche", "identite", "reseaux"],
    writes: ["preuve"],
    binding: { kind: "proof", proof: "demo_web" },
  },
  {
    id: "audit_report",
    stage: "produce",
    label: "Rapport d'audit",
    description: "Rapport des traceurs mesurés, sans modèle de langage.",
    icon: "file-text",
    reads: ["lead_qualifie", "traceurs", "site_garanti"],
    optionalReads: ["pixels", "techno"],
    writes: ["preuve", "rapport"],
    binding: { kind: "proof", proof: "audit_report" },
  },
  {
    id: "flyer",
    stage: "produce",
    label: "Flyer PDF",
    description: "Flyer avec QR code vers le formulaire d'avis Google.",
    icon: "layers",
    reads: ["lead_qualifie"],
    optionalReads: ["identite"],
    writes: ["flyer"],
    binding: { kind: "flyer" },
  },
  {
    id: "llm_phone_battlecard",
    stage: "message",
    label: "Script d'appel",
    description: "Accroche, arguments et réponses aux objections, rédigés par le modèle.",
    icon: "phone",
    reads: ["preuve"],
    optionalReads: PITCH_CONTEXT,
    writes: ["script_appel"],
    binding: { kind: "pitch", generator: "llm_phone_battlecard" },
  },
  {
    id: "llm_cold_email",
    stage: "message",
    label: "Email rédigé",
    description: "Email d'approche personnalisé, rédigé par le modèle.",
    icon: "mail",
    reads: ["preuve"],
    optionalReads: PITCH_CONTEXT,
    writes: ["message_ecrit"],
    binding: { kind: "pitch", generator: "llm_cold_email" },
  },
  {
    id: "tracker_cold_email",
    stage: "message",
    label: "Email d'audit",
    description: "Email qui cite les traceurs mesurés et le lien du rapport.",
    icon: "file-text",
    reads: ["rapport", "traceurs"],
    optionalReads: ["dirigeant", "techno"],
    writes: ["message_ecrit"],
    binding: { kind: "pitch", generator: "tracker_cold_email" },
  },
  {
    id: "crm_handoff",
    stage: "handoff",
    label: "CRM et closer",
    description: "Le lead part dans le CRM au statut « démo prête » et est attribué à un closer.",
    icon: "inbox",
    reads: ["preuve"],
    optionalReads: ["script_appel", "message_ecrit", "flyer"],
    writes: ["lead_crm"],
    binding: { kind: "fixed" },
  },
  {
    id: "channel_phone",
    stage: "channel",
    label: "Appel",
    description: "Le closer appelle le numéro de la fiche avec le script.",
    icon: "phone",
    reads: ["telephone", "script_appel", "lead_crm"],
    writes: [],
    binding: { kind: "channel", channel: "phone" },
  },
  {
    id: "channel_email",
    stage: "channel",
    label: "Email",
    description: "Email d'approche envoyé à l'adresse trouvée sur le site.",
    icon: "mail",
    reads: ["email", "message_ecrit", "lead_crm"],
    writes: [],
    binding: { kind: "channel", channel: "email" },
  },
  {
    id: "channel_contact_form",
    stage: "channel",
    label: "Formulaire",
    description: "Message collé par le closer dans le formulaire du site.",
    icon: "message",
    reads: ["formulaire", "message_ecrit", "lead_crm"],
    writes: [],
    binding: { kind: "channel", channel: "contact_form" },
  },
];

const NODE_BY_ID = new Map(WORKFLOW_NODES.map((n) => [n.id, n]));

export function workflowNode(id: string): WorkflowNodeType | undefined {
  return NODE_BY_ID.get(id);
}

export const channelNodeId = (c: ChannelId): string => `channel_${c}`;

type WorkflowFields = Pick<OpportunityDefinition, "requirements" | "channels" | "scanModules" | "proof" | "pitch" | "flyer">;

/** Nœuds d'un besoin, dans l'ordre du catalogue (les canaux dans l'ordre de préférence du besoin). */
export function workflowNodeIds(def: WorkflowFields): string[] {
  const ids: string[] = ["maps_search", "maps_filter"];
  for (const m of SCAN_MODULE_IDS) if (def.scanModules.includes(m)) ids.push(m);
  ids.push("qualify", def.proof.kind);
  if (def.flyer) ids.push("flyer");
  const generators = new Set(def.channels.map((c) => def.pitch[c]).filter((g): g is PitchGeneratorId => Boolean(g)));
  for (const g of PITCH_GENERATOR_IDS) if (generators.has(g)) ids.push(g);
  ids.push("crm_handoff");
  for (const c of def.channels) if ((CHANNEL_IDS as readonly string[]).includes(c)) ids.push(channelNodeId(c));
  return ids;
}

/** Clés que le filtre Maps n'écrit pas, selon le prérequis de site. */
export function keysBlockedBy(website: WebsiteRequirement): DataKey[] {
  if (website === "forbidden") return ["site", "site_garanti"];
  if (website === "optional") return ["site_garanti"];
  return [];
}

/** Clés disponibles dans le dossier une fois tous les nœuds passés. */
export function availableKeys(nodeIds: readonly string[], website: WebsiteRequirement): Set<DataKey> {
  const blocked = new Set(keysBlockedBy(website));
  const keys = new Set<DataKey>();
  for (const id of nodeIds) for (const k of workflowNode(id)?.writes ?? []) if (!blocked.has(k)) keys.add(k);
  return keys;
}

/** Nœuds du catalogue qui écrivent une clé. */
export function providersOf(key: DataKey): WorkflowNodeType[] {
  return WORKFLOW_NODES.filter((n) => n.writes.includes(key));
}

/** Conseil pour obtenir une clé manquante. */
function hintFor(key: DataKey, website: WebsiteRequirement): string {
  if (key === "site" && website === "forbidden") return "impossible pour un besoin « sans site »";
  if (key === "site_garanti") return "réglez le filtre Maps sur « Site exigé »";
  const providers = providersOf(key).filter((p) => p.binding.kind !== "fixed");
  if (providers.length === 0) return "aucun nœud ne la fournit";
  return `ajoutez ${providers.map((p) => `« ${p.label} »`).join(" ou ")}`;
}

/**
 * Cohérence du graphe : chaque nœud trouve ses clés indispensables, et chaque clé n'a qu'un seul auteur.
 * Remplace les anciennes règles au cas par cas (canal email ⇒ module contacts, rapport d'audit ⇒ site exigé…).
 */
export function checkWorkflow(def: WorkflowFields): string[] {
  const errors: string[] = [];
  const ids = workflowNodeIds(def);
  const website = def.requirements.website;
  const keys = availableKeys(ids, website);

  const writers = new Map<DataKey, string[]>();
  for (const id of ids) {
    const node = workflowNode(id);
    if (!node) continue;
    for (const k of node.writes) writers.set(k, [...(writers.get(k) ?? []), node.label]);
  }
  for (const [k, labels] of writers) {
    if (labels.length > 1) errors.push(`${labels.map((l) => `« ${l} »`).join(" et ")} produisent tous deux « ${DATA_KEYS[k].label} » : n'en gardez qu'un`);
  }

  for (const id of ids) {
    const node = workflowNode(id);
    if (!node) continue;
    for (const k of node.reads) {
      if (!keys.has(k)) errors.push(`« ${node.label} » a besoin de « ${DATA_KEYS[k].label} » : ${hintFor(k, website)}`);
    }
  }
  return errors;
}

/**
 * Ordre d'exécution : des vagues de nœuds, chacune ne dépendant que des vagues précédentes. Les nœuds d'une même vague
 * sont indépendants et peuvent tourner en parallèle. Une dépendance est une clé lue (indispensable ou facultative) qu'un
 * autre nœud du besoin écrit : un nœud qui utilise l'email s'il existe passe donc après celui qui le cherche.
 */
export function workflowWaves(nodeIds: readonly string[], website: WebsiteRequirement): string[][] {
  const blocked = new Set(keysBlockedBy(website));
  const nodes = nodeIds.map((id) => workflowNode(id)).filter((n): n is WorkflowNodeType => Boolean(n));
  const writerOf = new Map<DataKey, string>();
  for (const n of nodes) for (const k of n.writes) if (!blocked.has(k) && !writerOf.has(k)) writerOf.set(k, n.id);

  const deps = new Map<string, Set<string>>();
  for (const n of nodes) {
    const d = new Set<string>();
    for (const k of [...n.reads, ...(n.optionalReads ?? [])]) {
      const w = writerOf.get(k);
      if (w && w !== n.id) d.add(w);
    }
    deps.set(n.id, d);
  }

  const waves: string[][] = [];
  const placed = new Set<string>();
  let remaining = nodes.map((n) => n.id);
  while (remaining.length > 0) {
    const wave = remaining.filter((id) => [...deps.get(id)!].every((d) => placed.has(d)));
    // Cycle (impossible avec le catalogue actuel) : le reste passe en dernier, dans l'ordre du catalogue.
    const next = wave.length > 0 ? wave : remaining;
    waves.push(next);
    for (const id of next) placed.add(id);
    remaining = remaining.filter((id) => !placed.has(id));
  }
  return waves;
}
