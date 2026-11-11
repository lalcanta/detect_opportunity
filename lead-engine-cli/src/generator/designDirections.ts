/**
 * Directions artistiques des démos.
 *
 * Les démos se ressemblaient : même structure imposée, mêmes classes Tailwind, fond blanc partout.
 * Chaque lead reçoit maintenant une direction artistique tirée de façon stable (même lead = même direction),
 * parmi celles compatibles avec son métier, et un socle commun d'exigences « effet wahou ».
 */

export type ArchetypeId = "matiere" | "gourmand" | "urgence" | "studio" | "autre";

export interface ArtisanArchetype {
  id: ArchetypeId;
  archetype: string;
  palette: string;
  fonts: string;
  signatureComponent: string;
  advice: string;
}

/** Famille de métier : psychologie du client et composant signature (voir DESIGN_ARCHETYPES.md). */
export function detectArtisanArchetype(activity: string): ArtisanArchetype {
  const act = activity.toLowerCase();
  if (/couvr|toit|charp|ma[çc]on|fa[çc]ad|terras|carrel/.test(act)) {
    return {
      id: "matiere",
      archetype: "MATIÈRE & GROS ŒUVRE (Bâtiment Noble)",
      palette: "Pierre de calcaire (#F9F8F5), Terre cuite / Cuivre oxydé (#9A3412 ou #C05621), Noir forge (#111827)",
      fonts: "Titres puissants avec empattements ou bold brut (font-serif ou Plus Jakarta Sans font-extrabold)",
      signatureComponent: "Comparateur Avant / Après interactif (slider de rénovation toiture/maçonnerie) + Sceau Garantie Décennale",
      advice: "Mettre en valeur la solidité, la protection contre les intempéries, la garantie décennale et des chantiers récents locaux.",
    };
  }
  if (/boulang|p[aâ]tiss|bouch|charcut|traiteur|restau|chocolat|cavist|fromag/.test(act)) {
    return {
      id: "gourmand",
      archetype: "GOURMAND & COMMERCE DE PROXIMITÉ (Bouche & Terroir)",
      palette: "Crème douce / Beurre frais (#FDFBF7), Doré croustillant (#D97706), Chocolat noir (#3E2723) ou Bordeaux velours",
      fonts: "Typographie chaleureuse, ronde ou serif rétro moderne (Fraunces ou Cinzel)",
      signatureComponent: "Badge dynamique 'Actuellement Ouvert' + Vitrine des spécialités '100% Fait Maison' avec réservation",
      advice: "Mettre en valeur l'authenticité, les matières premières locales, le fait maison et la convivialité de quartier.",
    };
  }
  if (/plomb|chauff|clim|electr|électr|serrur|d[eé]pann|vitr/.test(act)) {
    return {
      id: "urgence",
      archetype: "HAUTE VÉLOCITÉ & URGENCE (Dépannage & Sécurité)",
      palette: "Blanc pur technique (#FFFFFF), Orange sécurité (#EA580C) ou Bleu électrique (#0284C7), Alerte sombre (#09090B)",
      fonts: "Monospace technique pour les chiffres (JetBrains Mono) et gros boutons d'action XXL faciles à presser",
      signatureComponent: "Bandeau d'Astreinte Immédiate ('Sur place en 30-45 min') + Grille des 3 forfaits clairs sans mauvaise surprise",
      advice: "Désamorcer immédiatement l'angoisse de l'arnaque avec des prix indicatifs transparents et une réactivité maximale.",
    };
  }
  if (/peint|d[eé]co|cuisin|éb[eé]n|eben|menuis|paysag|architect|art|tapiss/.test(act)) {
    return {
      id: "studio",
      archetype: "STUDIO & MÉTIERS D'ART (Décoration & Agencement)",
      palette: "Greige chic (#F4F1EA), Vert sauge / Olive (#4A5548), Laiton brossé ou Noir atelier (#18181B)",
      fonts: "Design minimaliste haute visibilité avec grands espacements (tracking-wide, interligne généreux)",
      signatureComponent: "Nuancier de finitions/matières cliquable + Simulateur de projet en 3 étapes interactif",
      advice: "Approche magazine d'architecture intérieure, photos grand format, élégance et valorisation du sur-mesure.",
    };
  }
  return {
    id: "autre",
    archetype: "SAVOIR-FAIRE ARTISANAL UNIQUE",
    palette: "Contraste soigné adapté aux couleurs de marque détectées, fond clair moderne, zéro template générique",
    fonts: "Typographie moderne soignée adaptée à l'artisan",
    signatureComponent: "Composant interactif engageant (calculateur ou sélecteur de besoins)",
    advice: "Concevoir un univers sur-mesure distinctif reflétant l'expertise locale du professionnel.",
  };
}

export interface DesignDirection {
  id: string;
  name: string;
  /** Intention en une phrase. */
  mood: string;
  /** Google Fonts (titres, texte). */
  fonts: { display: string; body: string };
  hero: string;
  color: string;
  /** Effets qui font la signature de la direction. */
  signature: string[];
  rhythm: string;
  /** Familles de métier pour lesquelles la direction reste crédible. */
  suits: ArchetypeId[];
}

export const DESIGN_DIRECTIONS: readonly DesignDirection[] = [
  {
    id: "editorial",
    name: "Éditorial XXL",
    mood: "Un magazine d'architecture : typographie géante, beaucoup d'air, chaque section comme une double page.",
    fonts: { display: "Fraunces", body: "Inter" },
    hero: "Titre serif énorme (clamp(3rem, 9vw, 8rem)) sur 2-3 lignes, un mot clé en italique couleur marque ; grille asymétrique 7/5 avec une grande photo (ou un aplat texturé) qui déborde de la grille ; numéro de section « 01 » en petit.",
    color: "Fond papier chaud très clair, encre presque noire, couleur de marque réservée aux accents (mot en italique, filets, chiffres).",
    signature: [
      "bandeau défilant (marquee CSS infini) des prestations entre deux sections",
      "révélation des images au scroll par clip-path (inset(100% 0 0 0) → inset(0))",
      "sections numérotées 01 / 02 / 03 avec filets fins",
    ],
    rhythm: "Alternance pleine largeur / colonnes décalées ; une section en fond encre (texte clair) au milieu de la page.",
    suits: ["matiere", "gourmand", "studio", "autre"],
  },
  {
    id: "dark_glow",
    name: "Nuit premium lumineuse",
    mood: "Une marque tech haut de gamme : fond sombre profond, halos de lumière à la couleur de la marque, verre dépoli.",
    fonts: { display: "Space Grotesk", body: "Manrope" },
    hero: "Fond quasi noir teinté de la couleur de marque, 2-3 halos flous (radial-gradient + blur) qui dérivent lentement ; titre blanc très gras avec un mot en dégradé de texte animé ; carte en verre (backdrop-blur, bordure 1px blanche à 10 %) qui met en avant la note Google réelle.",
    color: "Sombre dominant, couleur de marque en lumière (halos, bordures lumineuses, boutons), texte blanc / gris clair avec contraste AA.",
    signature: [
      "effet projecteur : un halo suit la souris sur les cartes de prestations (CSS variables mises à jour en JS)",
      "bordures en dégradé animé sur le bouton principal",
      "texture de grain légère par-dessus (SVG feTurbulence en data URI, opacité 0.06)",
    ],
    rhythm: "Toute la page en sombre avec une seule section claire (le formulaire de devis) pour créer la rupture.",
    suits: ["matiere", "urgence", "studio", "autre"],
  },
  {
    id: "bento",
    name: "Bento moderne",
    mood: "L'interface d'une app soignée : tuiles de tailles variées, coins très arrondis, couleurs pastel tirées de la marque.",
    fonts: { display: "Plus Jakarta Sans", body: "Plus Jakarta Sans" },
    hero: "Grille bento dès le premier écran : grande tuile titre + boutons, tuile note Google réelle avec étoiles, tuile photo, tuile « Devis gratuit » colorée, tuile ville avec une mini carte stylisée en CSS ; les tuiles apparaissent en cascade.",
    color: "Fond gris très clair, tuiles blanches et 2 tuiles teintées (couleur de marque pleine et sa version pastel).",
    signature: [
      "apparition en cascade des tuiles (animation-delay croissant)",
      "légère inclinaison 3D des tuiles au survol (perspective + rotateX/Y en JS, désactivée sur tactile)",
      "prestations en bento (une tuile large, deux hautes, le reste carré), pas une grille de 6 cartes identiques",
    ],
    rhythm: "Blocs bento successifs séparés par de grands titres ; rayons généreux (rounded-[2rem]).",
    suits: ["gourmand", "urgence", "studio", "autre"],
  },
  {
    id: "neo_brutal",
    name: "Néo-brutal coloré",
    mood: "Une affiche : couleurs franches, bordures noires épaisses, ombres décalées dures, ton direct et joyeux.",
    fonts: { display: "Archivo Black", body: "Space Grotesk" },
    hero: "Titre très gras en capitales sur fond couleur de marque saturée ; boutons à bordure noire 3px et ombre dure décalée (6px 6px 0 #000) qui s'enfoncent au clic ; stickers tournés (-6°) pour « Devis gratuit » et la note Google réelle.",
    color: "Couleur de marque saturée + une couleur complémentaire franche + noir et crème ; aucun dégradé.",
    signature: [
      "boutons et cartes qui « s'enfoncent » (translate + ombre réduite) au survol et au clic",
      "bandeau défilant en diagonale (rotate -2°) avec les prestations",
      "stickers et étiquettes posés légèrement de travers",
    ],
    rhythm: "Sections à fonds de couleurs alternées et franches, séparées par des bordures noires épaisses.",
    suits: ["gourmand", "urgence", "autre"],
  },
  {
    id: "immersive",
    name: "Plein cadre immersif",
    mood: "Un film : une image plein écran qui raconte le métier, du texte posé dessus, un défilement cinématographique.",
    fonts: { display: "Syne", body: "Inter" },
    hero: "Hero plein écran (100svh) : la plus belle vraie photo du prospect en fond (ou, sans photo, un dégradé maillé animé aux couleurs de la marque), voile sombre dégradé, titre énorme aligné en bas à gauche, indicateur de défilement animé.",
    color: "Photos et fonds sombres dominants, texte blanc, couleur de marque pour les boutons et les détails.",
    signature: [
      "parallaxe douce du fond du hero au scroll (transform translateY en JS, requestAnimationFrame)",
      "en-tête transparent qui devient opaque et se compacte au scroll",
      "galerie des prestations en défilement horizontal avec scroll-snap",
    ],
    rhythm: "Grandes sections plein cadre alternant image et texte ; respirations blanches entre elles.",
    suits: ["matiere", "gourmand", "studio", "autre"],
  },
  {
    id: "swiss",
    name: "Grille suisse technique",
    mood: "Un plan d'ingénieur : grille stricte visible, étiquettes monospace, chiffres géants, une seule couleur d'accent.",
    fonts: { display: "Inter Tight", body: "JetBrains Mono" },
    hero: "Grille 12 colonnes avec filets visibles ; titre très serré (tracking -0.04em) ; étiquettes monospace en capitales (« [01] COUVERTURE », coordonnées « 42.98° N ») ; note Google réelle affichée en chiffre géant.",
    color: "Blanc et noir purs, une seule couleur d'accent (la couleur de marque) utilisée avec parcimonie.",
    signature: [
      "compteurs animés à l'apparition, uniquement sur des chiffres réels (note Google, nombre d'avis)",
      "lignes de grille qui se dessinent à l'apparition (scaleX de 0 à 1)",
      "survol des lignes de prestations : la ligne se remplit de la couleur d'accent",
    ],
    rhythm: "Prestations en liste-tableau numérotée plutôt qu'en cartes ; beaucoup de filets, peu de fonds.",
    suits: ["matiere", "urgence", "studio", "autre"],
  },
  {
    id: "organic",
    name: "Organique chaleureux",
    mood: "Fait main et généreux : formes douces, tons chauds, soulignés dessinés à la main, sensation de terroir moderne.",
    fonts: { display: "DM Serif Display", body: "DM Sans" },
    hero: "Photo (ou illustration CSS) dans une forme organique (border-radius en blob animé qui se transforme lentement) ; titre serif avec un mot souligné par un trait SVG dessiné à la main animé (stroke-dashoffset) ; formes de fond douces.",
    color: "Crème, terracotta, vert olive ou tons de la marque adoucis ; jamais de gris froid.",
    signature: [
      "blob animé (border-radius qui se transforme) autour de la photo principale",
      "soulignement SVG dessiné à la main qui se trace à l'apparition",
      "séparateurs de sections en vagues SVG",
    ],
    rhythm: "Sections aux fonds crème alternés, éléments qui se chevauchent légèrement, beaucoup de rondeur.",
    suits: ["gourmand", "studio", "autre"],
  },
  {
    id: "kinetic_split",
    name: "Split cinétique",
    mood: "Une présentation produit : écran coupé en deux, texte qui reste, visuels qui défilent, tout est en mouvement maîtrisé.",
    fonts: { display: "Sora", body: "Inter" },
    hero: "Écran partagé : à gauche le titre et les boutons sur fond couleur de marque, à droite une pile de visuels (vraies photos ou cartes) qui se décalent en éventail ; titre révélé mot par mot.",
    color: "Couleur de marque en grands aplats face à du blanc ; contraste fort, accents complémentaires.",
    signature: [
      "révélation du titre mot par mot (spans avec animation-delay)",
      "section « Pourquoi nous » avec colonne gauche sticky et contenu qui défile à droite",
      "cartes empilées qui se déploient en éventail au survol",
    ],
    rhythm: "Alternance de sections en deux colonnes inversées ; une bande pleine couleur au milieu.",
    suits: ["matiere", "urgence", "gourmand", "autre"],
  },
];

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Direction stable pour un lead, choisie parmi celles qui conviennent à son métier. */
export function pickDesignDirection(leadId: string, activity: string): DesignDirection {
  const family = detectArtisanArchetype(activity).id;
  const pool = DESIGN_DIRECTIONS.filter((d) => d.suits.includes(family));
  const list = pool.length ? pool : DESIGN_DIRECTIONS;
  return list[hashString(leadId) % list.length]!;
}

/** Lien Google Fonts des deux polices de la direction. */
export function googleFontsHref(d: DesignDirection): string {
  const fam = (name: string) => `family=${name.replace(/ /g, "+")}:wght@400;500;600;700;800`;
  const families = d.fonts.display === d.fonts.body ? [fam(d.fonts.display)] : [fam(d.fonts.display), fam(d.fonts.body)];
  // Archivo Black et DM Serif Display n'ont qu'une graisse : on ne demande pas de plage.
  const fixed = families.map((f) => (/Archivo\+Black|DM\+Serif\+Display/.test(f) ? f.replace(/:wght@.*$/, "") : f));
  return `https://fonts.googleapis.com/css2?${fixed.join("&")}&display=swap`;
}

/** Consignes de direction artistique et d'effet « wahou », communes au mode automatique et au mode prep. */
export function renderDesignBrief(d: DesignDirection): string {
  return `DIRECTION ARTISTIQUE IMPOSÉE POUR CE PROSPECT : « ${d.name} »
${d.mood}
- Polices (Google Fonts, à charger dans le <head>) : titres ${d.fonts.display}, texte ${d.fonts.body}.
  <link rel="stylesheet" href="${googleFontsHref(d)}">
- Hero : ${d.hero}
- Couleurs : ${d.color} Pars des couleurs de marque du prospect et ajuste-les pour garder un contraste lisible (WCAG AA).
- Effets signature (tous attendus) :
${d.signature.map((s) => `  * ${s}`).join("\n")}
- Rythme de page : ${d.rhythm}

EFFET « WAHOU » (exigences communes) :
- Le premier écran doit impressionner en une seconde : animation d'entrée en cascade (titre, sous-titre, boutons, visuel), composition travaillée, jamais un simple texte centré sur fond blanc.
- Mouvement maîtrisé : apparition des sections au scroll (IntersectionObserver qui ajoute une classe), micro-interactions au survol et au clic sur tous les boutons et cartes, transitions de 200 à 700 ms avec des courbes douces (cubic-bezier(.2,.8,.2,1)).
- Typographie expressive : titres en clamp() très grands, interlettrage serré, hiérarchie forte ; un mot clé mis en valeur (couleur, italique, dégradé ou soulignement).
- Profondeur : superpositions, ombres colorées, textures ou dégradés ; pas d'aplats blancs partout.
- CSS et JavaScript maison dans des balises <style> et <script> (aucune autre bibliothèque que Tailwind CDN et Lucide).
- Accessibilité : @media (prefers-reduced-motion: reduce) coupe les animations ; contrastes lisibles ; focus visibles.
- Mobile (390 px) aussi soigné que l'ordinateur : aucun débordement horizontal, effets lourds (parallaxe, inclinaison 3D) désactivés sur tactile.

À ÉVITER (c'est ce qui rend les démos interchangeables) :
- hero centré « titre + 2 boutons » sur fond blanc ou gris uni ;
- grille de 6 cartes blanches identiques avec une icône en haut ;
- palette zinc / blanc partout, coins rounded-xl et ombres shadow-lg partout ;
- emojis comme icônes, texte de remplissage générique (« Bienvenue sur notre site »).`;
}
