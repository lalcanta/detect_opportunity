import { getCompetitorBenchmark } from "../benchmarks/competitorBenchmarks";
import type { ModelRouter } from "../llm/modelRouter";
import type { MapsLead, SiteAudit, SiteInspection, TokenUsageRecord } from "../types";
import { stripCodeFences } from "../utils/helpers";

export const LOGO_PLACEHOLDER = "%%CLIENT_REAL_LOGO_URL%%";

export interface DemoInput {
  leadId: string;
  lead: MapsLead;
  inspection: SiteInspection | null;
  audit: SiteAudit;
  remoteAppUrl: string;
}

/**
 * Génération de la landing page autonome :
 * 1. Reprise stricte du logo réel du client (aucun faux logo inventé).
 * 2. Modernisation du design et de la palette autour de son propre logo.
 * 3. Inspiration des sites concurrents leaders à fort trafic et conversion prouvée dans son métier.
 */
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

  const prompt = `Tu dois concevoir une refonte de landing page HAUTE CONVERSION pour un artisan local, en UN SEUL fichier HTML autonome.

================================================================================
1. RÈGLE MAJEURE : REPRISE DU VRAI LOGO CLIENT (ON N'EN REFAIT PAS UN !)
================================================================================
${
  inspection?.logoUrl
    ? `LE CLIENT POSSÈDE SON PROPRE LOGO RÉEL :
- CONSIGNE STRICTE : Tu DOIS impérativement intégrer ce logo tel quel dans le header / navbar en utilisant EXACTEMENT cette balise HTML :
  <img src="${LOGO_PLACEHOLDER}" alt="${lead.name}" class="h-10 sm:h-12 w-auto object-contain max-w-[200px]" loading="eager">
- INTERDICTION FORMELLE d'inventer, de dessiner ou de remplacer ce logo par une icône ou un faux logo !
- LE DESIGN DOIT SE MODERNISER AUTOUR DE SON LOGO : toute la mise en page (boutons, bordures, cartes, accents) s'harmonise avec l'identité de son logo existant.`
    : `LE CLIENT N'A PAS DE FICHIER LOGO IMAGE DÉTECTÉ SUR SON ANCIEN SITE :
- INTERDICTION FORMELLE D'INVENTER UN FAUX LOGO (aucun dessin de marteau, aucun symbole SVG ou emblème fictif inventé) !
- Tu dois afficher EXCLUSIVEMENT son nom commercial exact "${lead.name}" sous forme de LOGOTYPE TEXTUEL PUR (Wordmark élégant avec police moderne et épurée, text-xl sm:text-2xl font-bold tracking-tight text-zinc-900).`
}

- Identité de marque et couleurs extraites du logo / site client :
  * Couleur primaire : ${primaryColor}
  * Couleur secondaire : ${secondaryColor}
  * Nuances associées : ${palette}

Injecte cette configuration Tailwind dans le <head> pour appliquer les vraies couleurs de sa marque :
<script>
  tailwind.config = {
    theme: {
      extend: {
        colors: {
          brand: '${primaryColor}',
          brandDark: '${primaryColor}',
          brandSecondary: '${secondaryColor}',
        }
      }
    }
  };
</script>

================================================================================
2. INSPIRATION DES SITES CONCURRENTS LEADERS À FORT TRAFIC (SECTEUR : ${benchmark.categoryName})
================================================================================
Inspire-toi directement des recettes éprouvées des sites concurrents les plus performants dans ce domaine (${benchmark.trafficLeaders.map((l) => l.name).join(", ")}) :

A. EN-TÊTE & HERO HAUTE CONVERSION :
- Titre Hero percutant : "${headline}"
- Sous-titre rassurant : "${subheadline}"
- Double Call-To-Action immédiat :
  * CTA 1 (Appel immédiat avec numéro très visible) : <a href="tel:${cleanPhone}" class="inline-flex items-center justify-center gap-2 bg-brand text-white font-bold px-6 py-3.5 rounded-xl shadow-lg hover:opacity-95 transition-all text-base"><i data-lucide="phone" class="w-5 h-5"></i> <span>Appeler le ${formattedPhone}</span></a>
  * CTA 2 (Devis gratuit) : <a href="#devis" class="inline-flex items-center justify-center gap-2 bg-white text-zinc-900 border border-zinc-200 font-semibold px-6 py-3.5 rounded-xl hover:bg-zinc-50 transition-all text-base"><i data-lucide="file-text" class="w-5 h-5 text-zinc-500"></i> <span>Demander un devis gratuit</span></a>
- 4 Badges de réassurance clés indispensables sous le Hero :
${benchmark.conversionBlueprint.hero.trustBadges.map((b) => `  * ${b}`).join("\n")}

B. GRILLE DES PRESTATIONS STARS DU SECTEUR :
Titre de section : "${benchmark.conversionBlueprint.servicesGrid.sectionTitle}"
Génère une grille moderne de 6 prestations concrètes, adaptées à "${lead.activity}" :
${benchmark.conversionBlueprint.servicesGrid.servicesList.map((s, idx) => `  ${idx + 1}. ${s}`).join("\n")}
Chaque carte de prestation doit être claire, avec une icône Lucide adaptée, 2 ou 3 puces bénéfices et un petit lien "Demander un devis pour cette prestation ➔".

C. SECTION "POURQUOI NOUS CHOISIR ?" (ARGUMENTS DIFFÉRENCIATEURS DES LEADERS) :
Titre de section : "${benchmark.conversionBlueprint.competitiveAdvantages.sectionTitle.replace("{VILLE}", lead.city)}"
Points à développer :
${benchmark.conversionBlueprint.competitiveAdvantages.points.map((p) => `  - ${p.title} : ${p.desc}`).join("\n")}

D. PREUVE SOCIALE & AVIS GOOGLE RÉELS DE L'ARTISAN :
Note globale : ${lead.rating ?? 4.8}/5 sur ${lead.reviewsCount ?? 15} avis clients.
Mets en scène ces VRAIS avis clients Google de façon très valorisante :
${
  lead.recentReviews.map((r, i) => `  ${i + 1}. ${r.author} (${r.rating ?? 5}★, ${r.relativeDate}) : "${r.text}"`).join("\n") ||
  `  1. Client vérifié (5★) : "Travail très soigné, artisan ponctuel et réactif à ${lead.city}. Je recommande les yeux fermés."
  2. Client vérifié (5★) : "Devis clair, respect des délais et chantier impeccable. Enfin un vrai professionnel de confiance !"`
}

E. FORMULAIRE DE DEVIS EXPRESS & ANCRAGE LOCAL :
- Formulaire épuré et moderne (Nom, Téléphone, Prestation souhaitée, Ville/CP).
- ${benchmark.conversionBlueprint.coverageAreaPrompt.replace("{VILLE}", lead.city)}

F. MOBILE-FIRST & BARRE FLOTTANTE D'APPEL DIRECT :
- Les leaders du trafic enregistrent 75% de leurs appels sur mobile.
- Intègre impérativement un bandeau sticky fixe en bas sur mobile :
  <div class="fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-zinc-200 p-3 z-50 flex items-center justify-between gap-3 sm:hidden shadow-2xl">
    <div class="min-w-0">
      <p class="text-xs font-bold text-zinc-900 truncate">${lead.name}</p>
      <p class="text-[11px] text-emerald-600 font-semibold flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Disponible à ${lead.city}</p>
    </div>
    <a href="tel:${cleanPhone}" class="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs shadow-md shrink-0">
      <i data-lucide="phone-call" class="w-4 h-4"></i>
      <span>Appeler (${formattedPhone})</span>
    </a>
  </div>

================================================================================
3. CONTRAINTES TECHNIQUES
================================================================================
- CDN obligatoires dans le <head> :
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
- À la fin du <body> : <script>lucide.createIcons();</script>
- Faiblesses constatées sur son ancien site (à dépasser totalement) : ${audit.weaknesses.join(" ; ")}
- N'ajoute AUCUN script de tracking supplémentaire (il est injecté automatiquement après).
- Réponds UNIQUEMENT avec le code HTML complet (<!DOCTYPE html> ... </html>), sans aucun bloc markdown (\`\`\`) ni commentaire avant/après.`;

  const { text } = await router.generate({
    task: "demo",
    prompt,
    system:
      "Tu es un directeur artistique et lead developer web spécialisé dans la refonte de sites d'artisans d'élite. Tu respectes scrupuleusement le logo réel du client sans jamais en inventer un faux, tu modernises l'ergonomie autour de son identité, et tu appliques rigoureusement les benchmarks des sites concurrents qui ont le plus de trafic et de conversions en France.",
    images: inspection?.screenshot ? [{ mimeType: "image/jpeg", data: inspection.screenshot }] : undefined,
    usageSink,
  });

  let rawHtml = stripCodeFences(text);

  // 1. Déterministiquement réinjecter le vrai logo client sans aucune altération/troncature LLM
  if (inspection?.logoUrl) {
    if (rawHtml.includes(LOGO_PLACEHOLDER)) {
      rawHtml = rawHtml.replaceAll(LOGO_PLACEHOLDER, inspection.logoUrl);
    } else {
      // Si le LLM a substitué le placeholder par une URL ou un dessin de substitution dans le header
      rawHtml = rawHtml.replace(
        /(<header[\s\S]*?<img[^>]+src=["'])([^"']+)(["'][^>]*>)/i,
        `$1${inspection.logoUrl}$3`,
      );
    }
  }

  // 2. Toujours injecter no-referrer pour éviter tout blocage hotlinking d'images externes (WordPress/Cloudflare)
  if (!rawHtml.includes('name="referrer"')) {
    rawHtml = rawHtml.replace(/<head[^>]*>/i, '$&\n    <meta name="referrer" content="no-referrer">');
  }

  return injectTracker(rawHtml, input.leadId, input.remoteAppUrl);
}

export function injectTracker(html: string, leadId: string, remoteAppUrl: string): string {
  const tracker = `<script>(function(){try{var k="seen_${leadId}";if(sessionStorage.getItem(k))return;sessionStorage.setItem(k,"1");fetch(${JSON.stringify(
    remoteAppUrl,
  )}+"/api/tracker/open?leadId=${leadId}",{method:"GET",mode:"no-cors",keepalive:true,cache:"no-store"}).catch(function(){});}catch(e){}})();</script>`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${tracker}</body>`) : html + tracker;
}
