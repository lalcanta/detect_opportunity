/**
 * Générateurs de preuve et de message du mode full_auto, référencés par identifiant dans shared/opportunities.
 * `Record<…Id, …>` garantit à la compilation que chaque générateur déclaré dans le registre existe ici.
 */
import type { BrowserContext } from "playwright";
import type { ChannelId, OpportunityDefinition, PitchGeneratorId, ProofGeneratorId } from "../../../shared/opportunities";
import { generateBattlecard } from "../copywriter/battlecard";
import { generateColdEmailPitch } from "../copywriter/coldEmail";
import { generateDemoHtml } from "../generator/demoGenerator";
import { generateTrackerReportHtml } from "../generator/trackerReportGenerator";
import { auditSite } from "../inspector/siteAuditor";
import type { ModelRouter } from "../llm/modelRouter";
import type { Battlecard, MapsLead, SiteAudit, SiteInspection, TokenUsageRecord } from "../types";

export interface GenerationContext {
  router: ModelRouter;
  context: BrowserContext;
  lead: MapsLead;
  leadId: string;
  inspection: SiteInspection | null;
  remoteAppUrl: string;
  demoUrl: string;
  usage: TokenUsageRecord[];
  onSubStep?: (subStep: string) => Promise<boolean | void>;
  def: OpportunityDefinition;
  /** Canal principal du lead, calculé à la qualification. */
  primaryChannel: ChannelId;
}

export interface ProofResult {
  audit: SiteAudit;
  demoHtml: string;
}

export type ProofGenerator = (ctx: GenerationContext) => Promise<ProofResult>;
export type PitchGenerator = (ctx: GenerationContext, audit: SiteAudit) => Promise<Battlecard>;

/** Constats mesurés par l'inspection réseau, sans LLM. */
export function buildTrackerAudit(inspection: SiteInspection | null): SiteAudit {
  const trackers = inspection?.trackersFound ?? [];
  const cmp = inspection?.cmpDetected;
  return {
    score: trackers.length > 0 ? Math.max(20, 75 - trackers.length * 15) : 70,
    summary:
      trackers.length > 0
        ? `${trackers.length} traceur(s) tiers exécuté(s) à froid avant consentement (${trackers.join(", ")})${cmp ? ` malgré la présence de ${cmp}` : ""}.`
        : `Inspection réseau effectuée en session vierge (${inspection?.loadTimeMs ?? "n/a"} ms).`,
    weaknesses:
      trackers.length > 0
        ? trackers.map((t) => `${t} déclenché avant consentement CMP`)
        : ["Vérifier l'initialisation par défaut du Google Consent Mode v2"],
  };
}

export const PROOF_GENERATORS: Record<ProofGeneratorId, ProofGenerator> = {
  llm_demo: async (ctx) => {
    await ctx.onSubStep?.(`🤖 Audit critique IA & détection des faiblesses...`);
    const audit = await auditSite(ctx.router, ctx.lead, ctx.inspection, ctx.usage);
    await ctx.onSubStep?.(`🎨 Génération de la démo Tailwind moderne & branding...`);
    const demoHtml = await generateDemoHtml(
      ctx.router,
      {
        leadId: ctx.leadId,
        lead: ctx.lead,
        inspection: ctx.inspection,
        audit,
        remoteAppUrl: ctx.remoteAppUrl,
        focus: ctx.def.proof.kind === "demo_web" ? ctx.def.proof.focus : undefined,
      },
      ctx.usage,
    );
    return { audit, demoHtml };
  },
  tracker_report: async (ctx) => {
    const audit = buildTrackerAudit(ctx.inspection);
    await ctx.onSubStep?.(`🛡️ Génération du Rapport Interactif QA & Traceurs RGPD...`);
    const demoHtml = generateTrackerReportHtml({ leadId: ctx.leadId, lead: ctx.lead, inspection: ctx.inspection, remoteAppUrl: ctx.remoteAppUrl });
    ctx.usage.push({ task: "demo", model: "deterministe:tracker_report", inputTokens: 0, outputTokens: 0, thinkingTokens: 0 });
    return { audit, demoHtml };
  },
};

export const PITCH_GENERATORS: Record<PitchGeneratorId, PitchGenerator> = {
  llm_phone_battlecard: async (ctx, audit) => {
    await ctx.onSubStep?.(`🎯 Synthèse Battlecard IA (script d'appel & objections)...`);
    return generateBattlecard(ctx.router, ctx.lead, audit, ctx.demoUrl, ctx.usage);
  },
  llm_cold_email: async (ctx, audit) => {
    await ctx.onSubStep?.(`✉️ Rédaction IA du message écrit (${ctx.primaryChannel === "contact_form" ? "formulaire de contact" : "email"})...`);
    return generateColdEmailPitch(ctx.router, ctx.lead, audit, ctx.demoUrl, ctx.usage, ctx.def, ctx.primaryChannel);
  },
  tracker_cold_email: async (ctx) => {
    await ctx.onSubStep?.(`✉️ Préparation du brouillon d'email Dev-to-Dev (relecture manuelle)...`);
    ctx.usage.push({ task: "battlecard", model: "deterministe:tracker_cold_email", inputTokens: 0, outputTokens: 0, thinkingTokens: 0 });
    return buildDeterministicQaBattlecard(ctx.lead, ctx.inspection, ctx.demoUrl);
  },
};

export function buildDeterministicQaBattlecard(lead: MapsLead, inspection: SiteInspection | null, demoUrl: string): Battlecard {
  const domain = (lead.website || lead.name).replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/[/?#].*$/, "");
  const firstPerson = inspection?.keyPeople?.[0]?.split(" ")[0] || "";
  const greeting = firstPerson ? `Hello ${firstPerson} & l'équipe ${lead.name},` : `Hello l'équipe ${lead.name},`;
  const stack = inspection?.stack ?? [];
  const trackers = inspection?.trackersFound ?? [];
  const stackLine = stack.length
    ? `Je suis tombé sur votre site et le travail sur votre stack (${stack.join(", ")}) est vraiment propre.`
    : `Je suis tombé sur votre site en faisant un tour des réalisations d'agences.`;
  const trackersBullet = (trackers.length ? trackers : ["Scripts tiers déclenchés avant interaction CMP"])
    .map((t) => `- ${t}`)
    .join("\n");

  return {
    callScript: "Opportunité 100% asynchrone par email (aucun appel téléphonique).",
    objections: [],
    whatsappText: "",
    coldEmail: {
      subject: `[Dev QA] Petite régression réseau repérée sur ${domain} (tags avant CMP)`,
      body: `${greeting}

${stackLine}

Pour situer : je suis développeur backend depuis 14 ans (architecture, robustesse système) et je conçois des briques de QA réseau et d'automatisation CI/CD pour les équipes techniques.

En inspectant la cascade réseau au premier chargement de ${domain} (session Chromium vierge, sans clic sur le bandeau de consentement), certains scripts s'exécutent immédiatement :
${trackersBullet}

Dans 9 cas sur 10, c'est simplement un tag marketing mal conditionné dans Google Tag Manager, ou une petite régression passée inaperçue lors d'un déploiement.

Le rapport détaillé est ici, en accès libre pour vos devs :
👉 ${demoUrl}

J'ai automatisé ce check en CI/CD headless : il surveille l'ensemble des sites d'un portfolio et alerte dès qu'une CMP saute ou qu'un nouveau tag fuit sans consentement.

Si ça vous intéresse d'avoir ce filet de sécurité continu sur vos sites clients, dites-moi simplement par retour de mail et je vous branche ça rapidement (je fonctionne 100% à l'écrit / asynchrone).

Bonne continuation,

--
Loïc Alcantara
Développeur Web Senior (14 ans d'exp) | Performance & Architecture
Applications critiques et SaaS (PHP / Symfony, microservices, robustesse système & monitoring).
loic.alcantara@gmail.com | https://www.linkedin.com/in/loicalcantara/`,
      reportUrl: demoUrl,
      trackersFound: trackers,
      techStack: stack,
    },
  };
}
