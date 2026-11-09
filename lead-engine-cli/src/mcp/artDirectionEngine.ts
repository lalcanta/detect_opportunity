export interface ArtDirectionBrief {
  archetypeId: "btp_matiere" | "bouche_gourmand" | "urgence_velocite" | "studio_art";
  archetypeName: string;
  ambiance: string;
  palette: {
    background: string;
    primaryAccent: string;
    contrast: string;
    tailwindHints: string;
  };
  typography: {
    titleFont: string;
    bodyFont: string;
    googleFontsUrl: string;
    classes: string;
  };
  signatureComponent: {
    name: string;
    purpose: string;
    htmlSkeleton: string;
  };
  keyFeatures: string[];
  mandatorySections: string[];
}

export function detectArtDirection(activity: string | null, companyName: string): ArtDirectionBrief {
  const text = `${activity || ""} ${companyName || ""}`.toLowerCase();

  // 1. GOURMAND & BOUCHE
  if (text.match(/boulang|pâtiss|bouch|traiteur|caviste|chocolat|fromag|épicer|restau|brasser/)) {
    return {
      archetypeId: "bouche_gourmand",
      archetypeName: "GOURMAND & COMMERCE DE PROXIMITÉ",
      ambiance: "Chaleureux, sensoriel, généreux, convivial, tradition vivante du terroir.",
      palette: {
        background: "#FDFBF7 (Crème douce / Beurre frais)",
        primaryAccent: "#B45309 / #D97706 (Doré chaud croûte de pain / Ambre gourmand)",
        contrast: "#3E2723 (Brun chocolat chaud)",
        tailwindHints: "bg-[#FDFBF7] text-stone-900 border-amber-900/10 accent-[#B45309]",
      },
      typography: {
        titleFont: "Fraunces (Serif chaleureuse et rétro-chic)",
        bodyFont: "Plus Jakarta Sans",
        googleFontsUrl: "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,600;0,9..144,700;1,9..144,500&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap",
        classes: "font-serif-title: font-family: 'Fraunces', serif;",
      },
      signatureComponent: {
        name: "Badge d'Ouverture Vivant & Spécialités du Fournil",
        purpose: "Indicateur dynamique d'ouverture avec pastille pulsante et vitrine des produits phares faits maison.",
        htmlSkeleton: `<div class="bg-[#B45309] text-amber-100 text-xs py-2 px-4 text-center font-medium">
  <div class="max-w-4xl mx-auto flex items-center justify-center gap-2">
    <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
    <span>Fournil ouvert aujourd'hui dès <strong>6h30</strong> • Pains chauds et viennoiseries du matin</span>
  </div>
</div>`,
      },
      keyFeatures: [
        "Mention 100% Fait Maison & Farines régionales",
        "Vitrine des spécialités phares (Tradition levain, Croissants pur beurre)",
        "Bouton de commande téléphonique immédiat",
      ],
      mandatorySections: ["Hero chaleureux avec pain doré", "Vitrine 3 spécialités", "Origine des matières premières", "Horaires & Plan d'accès", "Sticky Call Bar mobile"],
    };
  }

  // 2. HAUTE VÉLOCITÉ & URGENCE
  if (text.match(/dépann|plomb|serrur|électric|vitrier|fuite|débouch|chauffag/)) {
    return {
      archetypeId: "urgence_velocite",
      archetypeName: "HAUTE VÉLOCITÉ & URGENCE",
      ambiance: "Réactivité absolue, clarté chirurgicale, sécurité, transparence tarifaire sans stress.",
      palette: {
        background: "#FFFFFF (Blanc technique épuré avec bordures grises)",
        primaryAccent: "#EA580C / #D97706 (Orange d'urgence vif ou Bleu cyan électrique #0284C7)",
        contrast: "#09090B (Noir zinc technique)",
        tailwindHints: "bg-white text-zinc-900 border-zinc-200",
      },
      typography: {
        titleFont: "Plus Jakarta Sans (Ultra-bold, lisibilité immédiate)",
        bodyFont: "Plus Jakarta Sans (Chiffres monospace bien visibles)",
        googleFontsUrl: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap",
        classes: "font-sans font-extrabold",
      },
      signatureComponent: {
        name: "Bandeau d'Astreinte Immédiate 30-45 min",
        purpose: "Rassurer instantanément sur le délai d'arrivée et afficher le numéro d'urgence en taille XXL.",
        htmlSkeleton: `<div class="bg-amber-500 text-black py-2.5 px-4 text-xs font-bold flex items-center justify-between">
  <span class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full bg-black animate-ping"></span> DÉPANNAGE D'URGENCE EN 30 À 45 MIN SUR LE SECTEUR</span>
  <span class="font-mono">7J/7 • 24H/24</span>
</div>`,
      },
      keyFeatures: [
        "Numéro d'appel d'urgence cliquable surdimensionné",
        "Grille des forfaits clairs (Recherche de fuite, Débouchage, Remplacement serrure)",
        "Compteur d'interventions réussies et garantie pièces & main d'œuvre",
      ],
      mandatorySections: ["Alerte intervention urgente", "Hero avec appel direct", "Grille 3 forfaits transparents", "Avis clients dépannés", "Sticky Bottom Call Bar"],
    };
  }

  // 3. STUDIO & MÉTIERS D'ART / MULTIMÉDIA / DÉCO
  if (text.match(/vidéo|cinéma|photo|coutel|bijou|savon|ébénist|décorat|architect|paysag|studio/)) {
    return {
      archetypeId: "studio_art",
      archetypeName: "STUDIO & MÉTIERS D'ART",
      ambiance: "Éditorial, confidentiel, haute facture, grand espace négatif, contrastes sombres et nobles.",
      palette: {
        background: "#0A0D14 ou #0F1115 (Noir studio cinéma / Atelier d'art)",
        primaryAccent: "#D97706 ou #C5A059 (Or brossé / Ambre cinéma)",
        contrast: "#FFFFFF / #E4E4E7 (Typographie claire aérée)",
        tailwindHints: "bg-[#0A0D14] text-zinc-100 border-zinc-800",
      },
      typography: {
        titleFont: "Playfair Display ou Cinzel (Élégance éditoriale)",
        bodyFont: "Space Grotesk ou Plus Jakarta Sans (Moderne et épuré)",
        googleFontsUrl: "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;1,600&family=Space+Grotesk:wght@400;500;600;700&display=swap",
        classes: "font-serif-title: font-family: 'Playfair Display', serif; font-mono: font-family: 'Space Grotesk', sans-serif;",
      },
      signatureComponent: {
        name: "Showreel / Cadre Galerie Immersif",
        purpose: "Lecteur vidéo / mosaïque visuelle plein format avec badges techniques (4K, MOF, fait main).",
        htmlSkeleton: `<div class="rounded-3xl overflow-hidden border border-zinc-800 shadow-2xl bg-zinc-950 aspect-video relative flex items-center justify-center">
  <div class="relative z-10 text-center space-y-3">
    <div class="w-16 h-16 rounded-full bg-amber-500 text-black flex items-center justify-center mx-auto shadow-xl">
      <i data-lucide="play" class="w-6 h-6 fill-current ml-0.5"></i>
    </div>
    <span class="block text-xs font-mono uppercase tracking-widest text-amber-400">Showreel 4K • Réalisations Récentes</span>
  </div>
</div>`,
      },
      keyFeatures: [
        "Sceau de Maîtrise / Label d'excellence (MOF, Télépilote DGAC, Création Unique)",
        "Grille des expertises et formats d'exception",
        "Formulaire de prise de contact confidentielle",
      ],
      mandatorySections: ["Hero immersif cinéma/atelier", "Showreel / Galerie d'œuvres", "3 Formats ou Collections phares", "Bouton d'échange direct", "Sticky Call Bar mobile"],
    };
  }

  // 4. PAR DÉFAUT : MATIÈRE & GROS ŒUVRE (Couverture, Maçonnerie, Menuiserie, Façade)
  return {
    archetypeId: "btp_matiere",
    archetypeName: "MATIÈRE & GROS ŒUVRE",
    ambiance: "Robuste, noble, fierté du geste, ancré dans la pierre minérale, la toiture et le bois.",
    palette: {
      background: "#FAF9F5 (Pierre de calcaire / Pierre de taille)",
      primaryAccent: "#8A2B14 (Terre cuite provençale) ou #0284C7 (Bleu ardoise moderne)",
      contrast: "#1C1F26 (Noir forge minéral)",
      tailwindHints: "bg-[#FAF9F5] text-stone-900 border-stone-200 accent-[#8A2B14]",
    },
    typography: {
      titleFont: "Cinzel ou Plus Jakarta Sans Extra-Bold (Puissance et solidité)",
      bodyFont: "Plus Jakarta Sans",
      googleFontsUrl: "https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap",
      classes: "font-serif-title: font-family: 'Cinzel', serif;",
    },
    signatureComponent: {
      name: "Comparateur Avant / Après Rénovation Glissant",
      purpose: "Slider responsive pur CSS/JS permettant de glisser le curseur pour voir la toiture/façade avant et après travaux.",
      htmlSkeleton: `<div class="relative w-full h-80 rounded-2xl overflow-hidden select-none border border-stone-200 shadow-xl">
  <img src="https://images.unsplash.com/photo-1590381105924-c72589b9ef3f?auto=format&fit=crop&w=800&q=80" alt="Après" class="absolute inset-0 w-full h-full object-cover">
  <div class="absolute top-3 right-3 bg-emerald-600 text-white text-[11px] font-bold px-3 py-1 rounded-full shadow">APRÈS</div>
  <div id="before-layer" class="absolute inset-0 overflow-hidden w-1/2 border-r-4 border-white shadow-2xl">
    <img src="https://images.unsplash.com/photo-1541976590-713941681591?auto=format&fit=crop&w=800&q=80" alt="Avant" class="absolute inset-0 w-full h-full object-cover max-w-none" style="width: 200%;">
    <div class="absolute top-3 left-3 bg-[#8A2B14] text-white text-[11px] font-bold px-3 py-1 rounded-full shadow">AVANT</div>
  </div>
  <input type="range" min="0" max="100" value="50" class="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-20" oninput="document.getElementById('before-layer').style.width = this.value + '%'">
</div>`,
    },
    keyFeatures: [
      "Sceau officiel Garantie Décennale 10 ans et assurance RC Pro",
      "Normes DTU et matériaux durables certifiés",
      "Devis gratuit sous 24h avec déplacement d'évaluation offert",
    ],
    mandatorySections: ["Hero avec promesse 30 ans", "Comparateur interactif Avant/Après", "Grille de 3 prestations de référence", "Témoignages clients locaux", "Sticky Call Bar mobile"],
  };
}
