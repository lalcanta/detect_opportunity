import { getCompetitorBenchmark } from "../benchmarks/competitorBenchmarks";
import { detectArtisanArchetype, pickDesignDirection, renderDesignBrief } from "./designDirections";
import type { ModelRouter } from "../llm/modelRouter";
import type { DemoFocus } from "../../../shared/opportunities";
import type { MapsLead, SiteAudit, SiteInspection, TokenUsageRecord } from "../types";
import { stripCodeFences } from "../utils/helpers";

export const LOGO_PLACEHOLDER = "%%CLIENT_REAL_LOGO_URL%%";

export interface DemoInput {
  leadId: string;
  lead: MapsLead;
  inspection: SiteInspection | null;
  audit: SiteAudit;
  remoteAppUrl: string;
  /** Angle de la démo, déclaré par l'opportunité (shared/opportunities). */
  focus?: DemoFocus;
}

/** Consigne ajoutée au prompt selon l'angle de l'opportunité (même intention que les consignes du mode prep). */
export function demoFocusInstruction(focus: DemoFocus | undefined, city: string): string {
  switch (focus) {
    case "reviews":
      return `ANGLE DE L'OFFRE : E-RÉPUTATION & AVIS GOOGLE. La page doit mettre au premier plan la collecte d'avis 5 étoiles (QR code de comptoir / véhicule, parcours d'avis simplifié) et un démonstrateur de croissance du nombre d'avis face aux concurrents de ${city || "la zone"}.`;
    case "seo_local":
      return `ANGLE DE L'OFFRE : RÉFÉRENCEMENT LOCAL & GOOGLE MAPS. Intègre un démonstrateur de positionnement sur les recherches clés à ${city || "proximité"} (simulation du Pack Local 3 places).`;
    case "ads_acquisition":
      return "ANGLE DE L'OFFRE : ACQUISITION PUBLICITAIRE. Conçois une landing page de conversion directe, pensée pour transformer le trafic payant en demandes de devis.";
    default:
      return "";
  }
}

/**
 * Génération de la landing page autonome :
 * 1. Reprise stricte du logo réel du client (aucun faux logo inventé).
 * 2. Modernisation du design et de la palette autour de son propre logo.
 * 3. Inspiration des sites concurrents leaders à fort trafic et conversion prouvée dans son métier.
 */
export const DEMO_SYSTEM_PROMPT =
  "Tu es un directeur artistique et développeur front-end primé (sites de l'année sur Awwwards), spécialisé dans les sites de professionnels locaux. Chaque site que tu livres a une identité forte, des animations soignées et une conversion redoutable. Tu respectes le vrai logo du client, tu n'inventes jamais de fait, et tu suis à la lettre la direction artistique demandée.";

export async function generateDemoHtml(
  router: ModelRouter,
  input: DemoInput,
  usageSink: TokenUsageRecord[],
): Promise<string> {
  const { lead, inspection, audit } = input;
  const primaryColor = inspection?.dominantColors?.[0] || "#1e3a8a";
  const secondaryColor = inspection?.dominantColors?.[1] || "#0284c7";
  const palette = inspection?.dominantColors?.length ? inspection.dominantColors.join(", ") : "palette professionnelle";

  // Récupération du benchmark concurrentiel basé sur l'activité réelle du prospect
  const benchmark = getCompetitorBenchmark(lead.activity);

  const cleanPhone = (lead.phone ?? "").replace(/[^\d+]/g, "");
  const formattedPhone = lead.phone ?? "06 00 00 00 00";

  const headline = benchmark.conversionBlueprint.hero.headlinePattern
    .replace("{METIER}", lead.activity)
    .replace("{VILLE}", lead.city)
    .replace("{NOM_ENTREPRISE}", lead.name);

  const subheadline = benchmark.conversionBlueprint.hero.subheadlinePattern
    .replace("{METIER}", lead.activity)
    .replace("{VILLE}", lead.city)
    .replace("{NOM_ENTREPRISE}", lead.name);

  const direction = pickDesignDirection(input.leadId, lead.activity);
  const craft = detectArtisanArchetype(lead.activity);

  const prompt = `Conçois la refonte du site de ce professionnel local : une landing page MODERNE, MÉMORABLE et à forte conversion, en UN SEUL fichier HTML autonome. Le prospect doit avoir un effet « wahou » en l'ouvrant : c'est ce qui décroche le rendez-vous.

================================================================================
1. LE PROSPECT
================================================================================
- Nom : ${lead.name}
- Métier : ${lead.activity} — famille « ${craft.archetype} » (${craft.advice})
- Ville : ${lead.city}
- Téléphone : ${formattedPhone}
- Note Google : ${lead.rating != null ? `${lead.rating}/5 sur ${lead.reviewsCount ?? "?"} avis` : "non disponible (n'affiche aucune note)"}
- Couleurs de marque relevées sur son site : ${palette} (principale ${primaryColor}, secondaire ${secondaryColor})
- Faiblesses de son site actuel, à dépasser largement : ${audit.weaknesses.join(" ; ")}

================================================================================
2. ${renderDesignBrief(direction)}
================================================================================

================================================================================
3. LOGO : LE VRAI, JAMAIS UN FAUX
================================================================================
${
  inspection?.logoUrl
    ? `Le client a un logo. Affiche-le dans l'en-tête avec EXACTEMENT cette source : <img src="${LOGO_PLACEHOLDER}" alt="${lead.name}" …> (classes libres, hauteur 40 à 56 px, object-contain). N'invente, ne dessine et ne remplace jamais ce logo. Le design s'harmonise avec lui.`
    : `Aucun logo détecté : affiche le nom commercial exact « ${lead.name} » en logotype texte soigné, dans la police des titres. INTERDIT d'inventer un logo, une icône-emblème ou un monogramme.`
}

================================================================================
4. CONTENU (l'ordre et la mise en page suivent la direction artistique, pas un gabarit)
================================================================================
A. Hero : accroche inspirée de « ${headline} » et « ${subheadline} » (reformule librement, garde le métier et la ville). Deux actions : appeler (lien tel:${cleanPhone}, numéro visible) et demander un devis (ancre #devis).
   Réassurance UNIQUEMENT avec des engagements sans affirmation factuelle (« Devis gratuit », « Artisan local à ${lead.city} »${lead.rating != null ? `, « ${lead.rating}/5 sur Google »` : ""}).
B. Prestations — section « ${benchmark.conversionBlueprint.servicesGrid.sectionTitle} » : 6 prestations adaptées à « ${lead.activity} », mises en scène selon la direction artistique (bento, liste numérotée, carrousel, défilement…), pas une grille de cartes identiques :
${benchmark.conversionBlueprint.servicesGrid.servicesList.map((sv, idx) => `   ${idx + 1}. ${sv}`).join("\n")}
C. Pourquoi nous — « ${benchmark.conversionBlueprint.competitiveAdvantages.sectionTitle.replace("{VILLE}", lead.city)} », engagements génériques (aucun délai, chiffre, marque ou label affirmé) :
${benchmark.conversionBlueprint.competitiveAdvantages.points.map((pt) => `   - ${pt.title} : ${pt.desc}`).join("\n")}
D. Avis : ${
    lead.recentReviews.length
      ? `mets en scène ces VRAIS avis Google sans modifier leur texte :\n${lead.recentReviews.map((r, i) => `   ${i + 1}. ${r.author} (${r.rating ?? "?"}★, ${r.relativeDate}) : "${r.text}"`).join("\n")}`
      : `aucun texte d'avis disponible. N'INVENTE AUCUN AVIS NI NOM DE CLIENT : ${lead.rating != null ? "mets en valeur la note réelle et le nombre d'avis, avec un emplacement « Vos avis Google s'afficheront ici »" : "prévois un emplacement « Vos avis Google s'afficheront ici »"}.`
  }
E. Devis (id="devis") : formulaire court et élégant (Nom, Téléphone, Prestation, Ville/CP) ; ${benchmark.conversionBlueprint.coverageAreaPrompt.replace("{VILLE}", lead.city)}
F. Composant interactif signature du métier, en JavaScript pur : ${craft.signatureComponent} (les éléments qui reposent sur des faits non vérifiés deviennent des exemples signalés « Exemple » ou des emplacements « à compléter »).
G. Barre d'appel mobile : barre fixe en bas d'écran sur mobile uniquement (fixed bottom-0, masquée à partir de sm), avec le lien tel:${cleanPhone} ; style assorti à la direction artistique. Laisse un espace en bas de page pour qu'elle ne masque rien.

================================================================================
5. HONNÊTETÉ (prioritaire sur tout le reste)
================================================================================
- N'affirme aucune certification, label ou garantie (RGE, Qualibat, décennale, assurance, agrément), aucun délai d'intervention, aucune disponibilité 7j/7, aucun prix, aucune année d'expérience, aucun nombre de chantiers, aucun « fait maison », « produits locaux », « du terroir » ou « savoir-faire reconnu », aucun HORAIRE ni jour d'ouverture : rien de cela n'est vérifié (« Horaires à confirmer » si la mise en page en a besoin ; un encadré discret « Vos certifications et garanties (à compléter) » est bienvenu).
- Exemples de badges du secteur, à NE PAS présenter comme des faits : ${benchmark.conversionBlueprint.hero.trustBadges.join(", ")}.
- Les seuls chiffres animables sont la note et le nombre d'avis Google réels ; ne qualifie pas les avis de « vérifiés ».

================================================================================
6. CONTRAINTES TECHNIQUES
================================================================================
- Dans le <head> : <script src="https://cdn.tailwindcss.com"></script>, <script src="https://unpkg.com/lucide@latest"></script> et le lien Google Fonts ci-dessus.
- Configure Tailwind avec les couleurs de la direction (tailwind.config = { theme: { extend: { colors: { brand: '…', … }, fontFamily: { display: ['${direction.fonts.display}', 'serif'], body: ['${direction.fonts.body}', 'sans-serif'] } } } }).
- À la fin du <body> : <script>lucide.createIcons();</script> puis ton script d'animations.
- IMAGES : ${
    inspection?.siteImages?.length
      ? `utilise EN PRIORITÉ ces vraies photos du prospect (son site), en lien direct, avec un alt descriptif :\n${inspection.siteImages.map((u) => `    * ${u}`).join("\n")}\n  Ne les remplace pas par des photos de banque d'images.`
      : "aucune photo du prospect : construis les visuels en CSS (dégradés maillés, formes, textures, typographie). Si tu utilises une photo générique, ajoute une petite mention « Photo d'exemple » dessus."
  }
- N'ajoute AUCUN script de tracking (il est injecté automatiquement après).
- Réponds UNIQUEMENT avec le code HTML complet (<!DOCTYPE html> ... </html>), sans bloc markdown (\`\`\`) ni commentaire avant ou après.`;

  const focusInstruction = demoFocusInstruction(input.focus, lead.city);
  const { text } = await router.generate({
    task: "demo",
    prompt: focusInstruction ? `${prompt}\n\n${focusInstruction}` : prompt,
    system: DEMO_SYSTEM_PROMPT,
    images: inspection?.screenshot ? [{ mimeType: "image/jpeg", data: inspection.screenshot }] : undefined,
    usageSink,
  });

  return finalizeDemoHtml(text, { leadId: input.leadId, logoUrl: inspection?.logoUrl ?? null, remoteAppUrl: input.remoteAppUrl });
}

/**
 * Post-traitement commun d'une démo écrite par un modèle (scan complet ou file d'attente générée par API) :
 * vrai logo, no-referrer, document fermé, pixel de suivi.
 */
export function finalizeDemoHtml(text: string, opts: { leadId: string; logoUrl: string | null; remoteAppUrl: string }): string {
  let rawHtml = stripCodeFences(text);
  const logoUrl = opts.logoUrl;

  // 1. Déterministiquement réinjecter le vrai logo client sans aucune altération/troncature LLM
  if (logoUrl) {
    if (rawHtml.includes(LOGO_PLACEHOLDER)) {
      rawHtml = rawHtml.replaceAll(LOGO_PLACEHOLDER, logoUrl);
    } else {
      // Si le LLM a substitué le placeholder par une URL ou un dessin de substitution dans le header
      rawHtml = rawHtml.replace(
        /(<header[\s\S]*?<img[^>]+src=["'])([^"']+)(["'][^>]*>)/i,
        `$1${logoUrl}$3`,
      );
    }
  }

  // 2. Toujours injecter no-referrer pour éviter tout blocage hotlinking d'images externes (WordPress/Cloudflare)
  if (!rawHtml.includes('name="referrer"')) {
    rawHtml = rawHtml.replace(/<head[^>]*>/i, '$&\n    <meta name="referrer" content="no-referrer">');
  }

  // 3. Garantir la clôture du document HTML même en cas de coupure réseau ou token limit
  if (!rawHtml.includes("</body>")) {
    rawHtml += "\n</main>\n</body>\n</html>";
  }

  return injectTracker(rawHtml, opts.leadId, opts.remoteAppUrl);
}

export function injectTracker(html: string, leadId: string, remoteAppUrl: string): string {
  const tracker = `<script>(function(){try{var k="seen_${leadId}";if(sessionStorage.getItem(k))return;sessionStorage.setItem(k,"1");fetch(${JSON.stringify(
    remoteAppUrl,
  )}+"/api/tracker/open?leadId=${leadId}",{method:"GET",mode:"no-cors",keepalive:true,cache:"no-store"}).catch(function(){});}catch(e){}})();</script>`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${tracker}\n</body>`) : `${html}\n${tracker}\n</body>\n</html>`;
}
