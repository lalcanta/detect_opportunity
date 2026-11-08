import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { chromium, type Browser, type BrowserContext } from "playwright";
import { loadConfig } from "./config";
import { scrapeMaps } from "./collector/mapsScraper";
import { inspectSite, lookupCompanySirene } from "./inspector/siteInspector";
import { generateFlyerPdf } from "./generator/flyerGenerator";
import { generateTrackerReportHtml } from "./generator/trackerReportGenerator";
import { getCompetitorBenchmark } from "./benchmarks/competitorBenchmarks";
import { pushLead } from "./sync/pushLead";
import { leadId, log, parseDirectDomainLeads } from "./utils/helpers";
import type { MapsLead } from "./types";

export interface PrepScanOptions {
  query: string;
  city: string;
  limit: number;
  lat?: number | null;
  lng?: number | null;
  radius_km?: number | null;
  cdp: boolean;
  opportunity_type?: string;
  website_filter?: "all" | "no_website" | "has_website";
  pitch_focus?: string;
}

export interface PrepScanHooks {
  onProgress?: (processed: number, total: number, message: string) => Promise<boolean | void>;
}

export interface PrepScanResult {
  processed: number;
  total: number;
  cancelled: boolean;
  preparedLeads: Array<{ id: string; name: string; city: string; phone: string | null; dir: string }>;
}

function parseArgs(): PrepScanOptions {
  const args = process.argv.slice(2);
  const opts: PrepScanOptions = {
    query: "plombier",
    city: "Bordeaux",
    limit: 5,
    cdp: false,
    opportunity_type: "website",
    website_filter: "all",
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--query" || arg === "-q") opts.query = args[++i] || opts.query;
    else if (arg === "--domains" || arg === "--urls" || arg === "-d") {
      opts.query = `domains:${args[++i] || ""}`;
      if (opts.opportunity_type === "website") opts.opportunity_type = "audit_qa_trackers";
    } else if (arg === "--city" || arg === "-c") opts.city = args[++i] || opts.city;
    else if (arg === "--limit" || arg === "-l") opts.limit = parseInt(args[++i] || "5", 10);
    else if (arg === "--lat") opts.lat = parseFloat(args[++i] || "0");
    else if (arg === "--lng") opts.lng = parseFloat(args[++i] || "0");
    else if (arg === "--radius") opts.radius_km = parseFloat(args[++i] || "10");
    else if (arg === "--cdp") opts.cdp = true;
    else if (arg === "--target" || arg === "--need" || arg === "--opportunity" || arg === "-t") {
      opts.opportunity_type = args[++i] || opts.opportunity_type;
    } else if (arg === "--filter" || arg === "--website-filter") {
      const f = args[++i];
      if (f === "no_website" || f === "has_website" || f === "all") opts.website_filter = f;
    } else if (arg === "--pitch-focus") {
      opts.pitch_focus = args[++i];
    }
  }

  return opts;
}

export async function runPrepScan(
  opts: PrepScanOptions,
  hooks: PrepScanHooks = {},
): Promise<PrepScanResult> {
  const cfg = loadConfig();
  const oppType = opts.opportunity_type || "website";
  const webFilter = opts.website_filter || "all";

  const oppLabels: Record<string, string> = {
    website: "🌐 Création & Refonte de Site Web",
    audit_qa_trackers: "🛡️ Audit QA Régression & Traceurs RGPD (Dev-to-Dev 100% Asynchrone)",
    google_reviews: "⭐ E-Réputation & Avis Google",
    seo_local: "📍 Visibilité & Référencement Local Maps",
    ads_acquisition: "⚡ Publicité Locale & Acquisition Chantiers",
    custom: "🎯 Besoin Sur-Mesure",
  };
  const oppLabel = oppLabels[oppType] || oppType;

  log(
    "prep",
    `Préparation de scan local (0€ coût API) : "${opts.query}" à ${opts.city} (max: ${opts.limit}) | Besoin : ${oppLabel} | Filtre web : ${webFilter}`,
  );

  let browser: Browser;
  let context: BrowserContext;
  if (opts.cdp) {
    log("browser", `Connexion CDP à ${cfg.CDP_URL}`);
    browser = await chromium.connectOverCDP(cfg.CDP_URL).catch((err: Error) => {
      throw new Error(`Chrome CDP injoignable sur ${cfg.CDP_URL} (lancez Chrome avec --remote-debugging-port=9222) : ${err.message}`);
    });
    context = browser.contexts()[0] ?? (await browser.newContext({ ignoreHTTPSErrors: true }));
  } else {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      locale: "fr-FR",
      viewport: { width: 1366, height: 768 },
      ignoreHTTPSErrors: true,
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    });
  }
  await context.addInitScript(() => {
    (globalThis as any).__name = (fn: any) => fn;
    (window as any).__name = (fn: any) => fn;
  });

  const queueDir = "queue/pending";
  await mkdir(queueDir, { recursive: true });

  const preparedLeads: Array<{ id: string; name: string; city: string; phone: string | null; dir: string }> = [];
  let cancelled = false;

  try {
    const directLeads = parseDirectDomainLeads(opts.query, opts.city);
    let qualifiedLeads: MapsLead[];
    if (directLeads) {
      qualifiedLeads = directLeads.slice(0, opts.limit);
      log("prep", `Mode Direct Domaines B2B : ${qualifiedLeads.length} domaine(s) chargé(s) sans Google Maps.`);
    } else {
      const res = await scrapeMaps({
        query: opts.query,
        city: opts.city,
        limit: opts.limit,
        lat: opts.lat ?? null,
        lng: opts.lng ?? null,
        radius_km: opts.radius_km ?? null,
        context,
        interactive: opts.cdp,
        opportunityType: oppType,
        websiteFilter: webFilter,
        onProgress: async (msg) => {
          log("maps", msg);
          if (hooks.onProgress) {
            const cont = await hooks.onProgress(0, opts.limit, `Scraping Maps : ${msg}`);
            if (cont === false) cancelled = true;
          }
        },
      });
      qualifiedLeads = res.qualifiedLeads;
      log("maps", `${qualifiedLeads.length} prospects qualifiés trouvés.`);
    }

    if (cancelled) {
      return { processed: 0, total: qualifiedLeads?.length || 0, cancelled: true, preparedLeads: [] };
    }

    if (qualifiedLeads.length === 0) {
      log("prep", "Aucun prospect qualifié trouvé.");
      return { processed: 0, total: 0, cancelled: false, preparedLeads: [] };
    }

    if (hooks.onProgress) {
      const cont = await hooks.onProgress(
        0,
        qualifiedLeads.length,
        `${qualifiedLeads.length} prospect(s) qualifié(s) trouvé(s). Préparation des dossiers locaux...`,
      );
      if (cont === false) {
        return { processed: 0, total: qualifiedLeads.length, cancelled: true, preparedLeads: [] };
      }
    }

    for (let i = 0; i < qualifiedLeads.length; i++) {
      const lead = qualifiedLeads[i];
      if (!lead) continue;
      const id = leadId(lead.name, lead.phone ?? lead.mapsUrl);
      const leadDir = `${queueDir}/${id}`;

      // Si le dossier existe déjà et a été synchronisé, on peut continuer
      if (existsSync(`queue/completed/${id}`)) {
        log("prep", `[${i + 1}/${qualifiedLeads.length}] ${lead.name} déjà synchronisé, ignoré.`);
        continue;
      }

      await mkdir(leadDir, { recursive: true });
      log("prep", `[${i + 1}/${qualifiedLeads.length}] Extraction données & flyers pour ${lead.name}...`);

      // 1. Inspection du site existant si disponible
      let inspection = null;
      if (lead.website) {
        try {
          inspection = await inspectSite(context, lead.website, {
            opportunityType: oppType,
            companyName: lead.name,
            city: lead.city,
          });
          if (inspection.screenshot) {
            await writeFile(`${leadDir}/screenshot.png`, inspection.screenshot);
          }
        } catch (err) {
          log("inspect", `Impossible d'inspecter ${lead.website} : ${(err as Error).message}`);
        }
      }
      const sireneFallback = !inspection ? await lookupCompanySirene(lead.name, lead.city) : null;

      // 2. Génération flyer PDF
      const brandColor = inspection?.dominantColors?.[0] || "#1e40af";
      const flyerBuffer = await generateFlyerPdf(context, lead, inspection?.logoUrl ?? null, brandColor);
      await writeFile(`${leadDir}/flyer.pdf`, flyerBuffer);

      // 3. Récupération des benchmarks sectoriels
      const benchmark = getCompetitorBenchmark(lead.activity);

      // 4. Écriture du meta.json
      const meta = {
        id,
        company_name: lead.name,
        activity: lead.activity,
        city: lead.city,
        phone: lead.phone,
        website_url: lead.website,
        google_rating: lead.rating,
        google_reviews_count: lead.reviewsCount,
        opportunity_type: oppType,
        pitch_focus: opts.pitch_focus || null,
        recentReviews: lead.recentReviews,
        mapsUrl: lead.mapsUrl,
        loadTimeMs: inspection?.loadTimeMs ?? null,
        isResponsive: inspection?.isResponsive ?? null,
        dominantColors: inspection?.dominantColors ?? [brandColor],
        logoUrl: inspection?.logoUrl ?? null,
        email: inspection?.emails?.[0] ?? null,
        emails: inspection?.emails ?? [],
        key_people: inspection?.keyPeople?.length ? inspection.keyPeople : (sireneFallback?.keyPeople ?? []),
        stack: inspection?.stack ?? [],
        trackers_found: inspection?.trackersFound ?? [],
        tracker_requests: inspection?.trackerRequests ?? [],
        cmp_detected: inspection?.cmpDetected ?? null,
        social_links: inspection?.socialLinks ?? { linkedin: [], facebook: [], instagram: [] },
        siren: inspection?.siren ?? sireneFallback?.siren ?? null,
        company_created_at: inspection?.companyCreatedAt ?? sireneFallback?.createdAt ?? null,
        benchmark: {
          categoryName: benchmark.categoryName,
          copywritingHooks: benchmark.copywritingHooks,
          heroHeadlinePattern: benchmark.conversionBlueprint.hero.headlinePattern,
          mobileWinningPattern: benchmark.conversionBlueprint.mobileWinningPattern,
        },
        preparedAt: new Date().toISOString(),
      };
      await writeFile(`${leadDir}/meta.json`, JSON.stringify(meta, null, 2));

      // Synchronisation immédiate vers le CRM avec statut pending_generation pour visibilité admin
      try {
        let flyerPdfBase64: string | null = null;
        if (existsSync(`${leadDir}/flyer.pdf`)) {
          const flyerBuf = await readFile(`${leadDir}/flyer.pdf`);
          flyerPdfBase64 = flyerBuf.toString("base64");
        }
        await pushLead(cfg.REMOTE_APP_URL, cfg.SYNC_SECRET_TOKEN, {
          id,
          company_name: lead.name,
          activity: lead.activity || "Artisan",
          city: lead.city,
          phone: lead.phone,
          email: inspection?.emails?.[0] ?? null,
          website_url: lead.website,
          google_rating: lead.rating,
          google_reviews_count: lead.reviewsCount,
          opportunity_type: oppType,
          audit_data: {
            loadTimeMs: inspection?.loadTimeMs ?? null,
            isResponsive: inspection?.isResponsive ?? null,
            dominantColors: inspection?.dominantColors ?? [],
            logoUrl: inspection?.logoUrl ?? null,
            trackersFound: inspection?.trackersFound ?? [],
            stack: inspection?.stack ?? [],
          },
          status: "pending_generation",
          flyer_pdf_base64: flyerPdfBase64,
        });
      } catch {
        // En mode déconnecté, la sync échouera en silence et sera reprise par sync-queue
      }

      // Si opportunité Audit QA Traceurs : génération immédiate et déterministe du rapport HTML + brouillon Cold Email (0 attente)
      if (oppType === "audit_qa_trackers") {
        const qaReportHtml = generateTrackerReportHtml({
          leadId: id,
          lead,
          inspection,
          remoteAppUrl: cfg.REMOTE_APP_URL,
        });
        await writeFile(`${leadDir}/demo.html`, qaReportHtml);
        const domain = (lead.website || lead.name).replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/[/?#].*$/, "");
        const trackers = inspection?.trackersFound ?? [];
        await writeFile(
          `${leadDir}/battlecard.json`,
          JSON.stringify(
            {
              auditSummary: trackers.length
                ? `${trackers.length} traceur(s) tiers exécuté(s) avant consentement (${trackers.join(", ")}).`
                : `Audit réseau effectué sur ${domain} en session vierge.`,
              weaknesses: trackers.length ? trackers.map((t) => `${t} déclenché avant consentement CMP`) : [],
              callScript: "Approche 100% asynchrone par email (aucun appel téléphonique).",
              objections: [],
            },
            null,
            2,
          ),
        );
      }

      // 5. Génération du prompt pour Antigravity CLI (demo.html) adapté au type de besoin
      const isReviewOffer = oppType === "google_reviews";
      const isSeoOffer = oppType === "seo_local";
      const isAdsOffer = oppType === "ads_acquisition";

      const promptDemo = `# Consigne de Génération Démo Tailwind pour Antigravity

Tu dois générer le fichier \`demo.html\` pour ce prospect.
Enregistre le code HTML complet et autonome directement dans :
\`${leadDir}/demo.html\`

## Cible & Type de Besoin Détecté :
- Type d'offre : ${oppLabel} (id: ${oppType})
${opts.pitch_focus ? `- Angle spécifique demandé : ${opts.pitch_focus}` : ""}

## Informations Prospect :
- Nom : ${lead.name}
- Métier : ${lead.activity || "Artisan"}
- Ville : ${lead.city || ""}
- Téléphone : ${lead.phone || ""}
- Note Google : ${lead.rating || "5.0"}/5 (${lead.reviewsCount || "0"} avis)
- Couleurs de marque détectées : ${meta.dominantColors.join(", ")}
${meta.logoUrl ? `- Logo client existant : ${meta.logoUrl}` : "- Pas de logo existant : créer un monogramme épuré"}

## Spécifications Techniques Obligatoires :
1. HTML5 valide avec Tailwind CSS CDN (\`<script src="https://cdn.tailwindcss.com"></script>\`).
2. **Barre d'appel d'urgence mobile collante en bas d'écran (Sticky Bottom Call Bar)** avec lien direct \`tel:${lead.phone || ""}\` et bouton WhatsApp.
${
  isReviewOffer
    ? `3. **Focus E-Réputation & Avis Google** : Présentation du système de collecte d'avis 5 étoiles (QR code de comptoir/véhicule, filtre d'avis, démonstrateur de croissance du nombre d'avis face aux concurrents de ${lead.city || "la zone"}).`
    : isSeoOffer
      ? `3. **Focus Référencement Local & Google Maps** : Démonstrateur de positionnement sur les recherches clés à ${lead.city || "proximité"}, simulateur de visibilité Pack Local 3 places.`
      : isAdsOffer
        ? `3. **Focus Acquisition & Leads Publicitaires** : Landing page de conversion directe à fort impact conçue pour convertir le trafic payant en demandes de devis fermes.`
        : `3. **Hero section percutante** avec accroche locale ("Urgence & Dépannage à ${lead.city || "votre domicile"} 7j/7"), badge avis Google 5 étoiles, bouton devis gratuit.`
}
4. **Grille de prestations & tarifs indicatifs clairs** adaptée au métier de ${lead.activity || "cet artisan"}.
5. **Preuve sociale & Avis Google réels** intégrés :
${(lead.recentReviews || []).map((r) => `   - "${r.text}" (${r.author}, ${r.rating}★)`).join("\n") || "   - Extraits de clients satisfaits locaux."}
6. **Formulaire de devis express** (Nom, Téléphone, Type de panne / projet, Envoi immédiat).
7. Ne pas utiliser de markdown dans le fichier \`demo.html\`, uniquement du code HTML brut commençant par \`<!DOCTYPE html>\`.
`;
      await writeFile(`${leadDir}/prompt_demo.md`, promptDemo);

      // 6. Génération du prompt pour Antigravity CLI (battlecard.json) adapté au besoin
      const isAsyncQaOffer = oppType === "audit_qa_trackers";

      let promptBattlecard = "";
      if (isAsyncQaOffer) {
        promptBattlecard = `# RÔLE & PERSONA
Tu es un agent d'automatisation chargé de rédiger des emails d'approche personnalisés de confrère à confrère pour Loïc Alcantara.
- Identité : Loïc Alcantara, développeur web senior avec 14 ans d’expérience (conception de backends critiques, robustesse réseau, performance et CI/CD).
- Ton : Confraternel, humble, ultra-précis, factuel, décontracté mais professionnel. Aucun ton commercial, marketing ou "growth hacker".
- Règle d'or de communication : 100% ASYNCHRONE ET ÉCRIT. Loïc n'est PAS disponible par téléphone. 
  -> INTERDICTION FORMELLE de proposer un appel téléphonique, une visio, un lien Calendly ou un "échange de 15 minutes". Tout se fait par simple retour d'email.

# MISSION
À partir des données de l'audit et des informations de l'agence / entreprise (${lead.name}), rédiger un email d'approche ultra-ciblé.
Enregistre le JSON valide directement dans :
\`${leadDir}/battlecard.json\`

# DONNÉES DISPONIBLES :
- Entreprise : ${lead.name}
- Domaine : ${lead.website || lead.name}
- Ville : ${lead.city || ""}
- Note / Présence : ${lead.rating || "5.0"}/5

# STRUCTURE DU MESSAGE :
1. Objet : [Dev QA] Petite régression réseau repérée sur ${lead.website ? new URL(lead.website).hostname : lead.name} (tags avant CMP)
2. Salutation : Hello l'équipe ${lead.name},
3. Accroche technique : Mentionner un compliment sincère et technique sur leur site ou portfolio.
4. Présentation éclair de Loïc (2 lignes) : 14 ans d'expérience en architecture backend et robustesse système, conçoit des briques de QA réseau et d'automatisation CI/CD.
5. Constat technique : Expliquer qu'au premier chargement (session Chromium vierge sans clic CMP), certains scripts s'exécutent immédiatement en amont (GA4, Hotjar, Meta Pixel...). Expliquer que dans 9 cas sur 10, c'est simplement un tag marketing mal conditionné dans GTM ou une régression lors du déploiement.
6. Preuve : Préciser qu'un rapport technique interactif a été dressé en accès 100% libre pour leurs développeurs (zéro démarche commerciale).
7. Offre récurrente sous-jacente : Filet de sécurité continu en CI/CD headless pour surveiller l'ensemble des sites de leur portfolio d'agence.
8. Call to action 100% ASYNCHRONE : "Si ça vous intéresse d'avoir ce filet de sécurité continu sur vos sites clients, dites-moi simplement par retour de mail et je vous branche ça rapidement (je fonctionne 100% à l'écrit / asynchrone)."
9. Signature de Loïc :
--
Loïc Alcantara
Développeur Web Senior (14 ans d'exp) | Performance & Architecture
loic.alcantara@gmail.com | https://www.linkedin.com/in/loicalcantara/

# RÈGLES NÉGATIVES STRICTES :
- JAMAIS de proposition d'appel téléphonique ni visio.
- Texte brut pur sans markdown gras lourd.

# SCHÉMA JSON REQUIS :
\`\`\`json
{
  "coldEmail": {
    "subject": "[Dev QA] Petite régression réseau repérée sur ${lead.name} (tags avant CMP)",
    "body": "Bonjour l'équipe ${lead.name}, ...",
    "trackersFound": ["Google Analytics (GA4)", "Hotjar", "Meta Pixel"],
    "reportUrl": "https://pub-r2.dev/${id}.html"
  }
}
\`\`\`
`;
      } else {
        promptBattlecard = `# Consigne de Génération Battlecard Commerciale pour Antigravity

Tu dois générer le fichier \`battlecard.json\` pour aider le closer à contacter cet artisan.
Enregistre le JSON valide directement dans :
\`${leadDir}/battlecard.json\`

## Angle de Vente : ${oppLabel}
${
  isReviewOffer
    ? `Le prospect a actuellement ${lead.reviewsCount || 0} avis Google (${lead.rating || 5}★). L'argumentaire doit se concentrer sur les avis manqués face aux concurrents locaux, la réputation et le pack de collecte d'avis QR / NFC.`
    : isSeoOffer
      ? `Le prospect manque de visibilité sur les recherches Google Maps locales. L'argumentaire porte sur le gain de positionnement et les appels générés.`
      : `Le prospect a besoin d'un site web moderne et rapide convertissant le trafic smartphone en appels téléphoniques.`
}

## Schéma JSON Requis :
\`\`\`json
{
  "closerBrief": "Petit laïus de 2-3 phrases pour la closer : explique-lui clairement pourquoi notre solution est supérieure à ce que ${lead.name} a aujourd'hui${meta.key_people.length ? ` (dirigeant identifié : ${meta.key_people.join(", ")})` : ""} et quel est l'angle d'attaque idéal.",
  "ourAdvantages": [
    "Avantage concret 1 de notre solution face à la leur (ex: barre d'appel d'urgence mobile collante)",
    "Avantage concret 2 (ex: mise en valeur immédiate des ${lead.reviewsCount || 0} avis Google à ${lead.rating || 5}★)",
    "Avantage concret 3 (ex: chargement instantané et reprise de leur vrai logo)"
  ],
  "executiveSummary": "2 phrases résumant la situation du prospect et l'angle commercial (${oppType}).",
  "currentSiteCritique": [
    "Faiblesse ou opportunité 1",
    "Faiblesse ou opportunité 2",
    "Faiblesse ou opportunité 3"
  ],
  "openingPitch": "Script mot-à-mot percutant pour le closer lors des 30 premières secondes d'appel${meta.key_people.length ? ` en demandant ${meta.key_people[0]}` : ""}, centré sur le besoin (${oppType}).",
  "objections": [
    {
      "objection": "Je n'ai pas le temps, rappelez plus tard",
      "response": "Réponse désarmante et empathique"
    },
    {
      "objection": "J'ai déjà tout ce qu'il me faut",
      "response": "Argument axé sur le manque à gagner face aux concurrents de la zone"
    },
    {
      "objection": "C'est trop cher / combien ça coûte ?",
      "response": "Argument de retour sur investissement"
    }
  ],
  "coldEmail": {
    "subject": "Objet d'email personnalisé pour ${lead.name}",
    "body": "Email court et chaleureux adapté au contexte exact de ${lead.name} (${lead.activity} à ${lead.city}), expliquant les avantages de la démo préparée pour lui par rapport à sa situation actuelle."
  }
}
\`\`\`
`;
      }
      await writeFile(`${leadDir}/prompt_battlecard.md`, promptBattlecard);

      preparedLeads.push({
        id,
        name: lead.name,
        city: lead.city,
        phone: lead.phone,
        dir: leadDir,
      });

      log("prep", `✔ Dossier préparé : ${leadDir}`);

      if (hooks.onProgress) {
        const cont = await hooks.onProgress(
          preparedLeads.length,
          qualifiedLeads.length,
          `Prospect ${preparedLeads.length}/${qualifiedLeads.length} préparé (${lead.name})`,
        );
        if (cont === false) {
          cancelled = true;
          break;
        }
      }
    }

    // Fusion propre avec le manifeste existant si des leads non traités s'y trouvaient déjà
    let manifestList = [...preparedLeads];
    try {
      if (existsSync("queue/pending_manifest.json")) {
        const prev = JSON.parse(await readFile("queue/pending_manifest.json", "utf-8"));
        if (Array.isArray(prev)) {
          const newIds = new Set(preparedLeads.map((p) => p.id));
          const kept = prev.filter((p) => !newIds.has(p.id) && existsSync(p.dir));
          manifestList = [...kept, ...preparedLeads];
        }
      }
    } catch {
      // Ignorer si lecture impossible
    }
    await writeFile("queue/pending_manifest.json", JSON.stringify(manifestList, null, 2));

    return {
      processed: preparedLeads.length,
      total: qualifiedLeads.length,
      cancelled,
      preparedLeads,
    };
  } finally {
    await browser.close().catch(() => undefined);
  }
}

export async function prepScan(): Promise<void> {
  const opts = parseArgs();
  const res = await runPrepScan(opts);

  if (res.preparedLeads.length === 0) {
    console.log("\n⚠️ Aucun artisan qualifié trouvé. Essayez d'élargir la requête ou de vérifier les filtres.");
    return;
  }

  console.log(`\n========================================================`);
  console.log(`🎉 ${res.preparedLeads.length} leads préparés dans queue/pending/`);
  console.log(`========================================================`);
  console.log(`\n👉 Étape suivante : Génération des démos & battlecards.`);
  console.log(`Demandez simplement à Antigravity dans ce chat :`);
  console.log(`"Génère les démos et battlecards des leads en attente dans queue/pending"`);
  console.log(`\nEnsuite, pour les synchroniser dans le CRM sans payer d'API :`);
  console.log(`npm run sync-queue\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  prepScan().catch((err) => {
    console.error("Erreur prepScan :", err);
    process.exit(1);
  });
}
