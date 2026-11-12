/**
 * Base de Connaissances des Benchmarks Concurrents à Fort Trafic & Haute Conversion.
 * Inspiré des sites de leaders artisanaux et de dépannage qui dominent Google et convertissent le plus en France.
 */

export interface CompetitorBenchmark {
  id: string;
  categoryName: string;
  targetKeywords: string[];
  trafficLeaders: {
    name: string;
    trafficSignal: string;
    keySuccessFactors: string[];
  }[];
  conversionBlueprint: {
    hero: {
      headlinePattern: string;
      subheadlinePattern: string;
      primaryCta: string;
      secondaryCta: string;
      trustBadges: string[];
    };
    servicesGrid: {
      sectionTitle: string;
      servicesList: string[];
      layoutStyle: string;
    };
    competitiveAdvantages: {
      sectionTitle: string;
      points: { title: string; desc: string }[];
    };
    proofAndReviews: {
      heading: string;
      format: string;
      badges: string[];
    };
    mobileWinningPattern: {
      stickyBarHtmlPrompt: string;
      emergencyTagline: string;
    };
    coverageAreaPrompt: string;
  };
  copywritingHooks: string[];
}

export const COMPETITOR_BENCHMARKS: CompetitorBenchmark[] = [
  {
    id: "plomberie_chauffage_clim",
    categoryName: "Plomberie, Chauffage & Climatisation",
    targetKeywords: ["chauffagiste", "plombier", "climatisation", "clim", "chaudiere", "pompe a chaleur", "pac", "sanitaire", "fuite", "debouchage", "chauffe-eau", "plomberie", "chauffage"],
    trafficLeaders: [
      {
        name: "MesDépanneurs / IZI by EDF / Chauffagiste-Express",
        trafficSignal: "Top 3 Google France & Régions, >150k visites/mois, conversion > 8%",
        keySuccessFactors: [
          "Bouton d'appel direct omniprésent avec numéro géant cliquable",
          "Annonce immédiate de la zone d'intervention et du délai ('Intervention sous 30 à 45 min')",
          "Garantie 'Prix annoncé avant intervention, zéro mauvaise surprise'",
          "Badges RGE, Qualibat, Professionnel du Gaz (PG) et Garantie Décennale sous le Hero",
        ],
      },
    ],
    conversionBlueprint: {
      hero: {
        headlinePattern: "{METIER} à {VILLE} et alentours : dépannage, installation, entretien",
        subheadlinePattern: "Un artisan de {VILLE} joignable en direct pour vos travaux d'installation, d'entretien et vos dépannages. Devis gratuit avant toute intervention.",
        primaryCta: "Appeler pour une Urgence (N° affiché en grand)",
        secondaryCta: "Demander un Devis Gratuit",
        trustBadges: ["Garantie Décennale 10 ans", "Artisan Certifié RGE", "Agréé Assurances", "Devis Gratuit & Sans engagement"],
      },
      servicesGrid: {
        sectionTitle: "Nos Prestations Chauffage & Plomberie d'Excellence",
        servicesList: [
          "Dépannage & Recherche de fuite non destructive",
          "Entretien, dépannage et remplacement de chaudière (Gaz / Fioul)",
          "Installation de Pompe à Chaleur (PAC) & Climatisation Réversible",
          "Remplacement et détartrage de chauffe-eau / ballon d'eau chaude",
          "Rénovation complète de salle de bain clé en main (PMR, douche italienne)",
          "Débouchage express de canalisations et assainissement",
        ],
        layoutStyle: "Grille de 6 cartes avec icônes Lucide nettes, puces bénéfices et bouton devis ciblé",
      },
      competitiveAdvantages: {
        sectionTitle: "Pourquoi les habitants de {VILLE} nous font confiance",
        points: [
          { title: "Un appel, un interlocuteur", desc: "Une fuite ou une panne de chaudière ? Vous parlez directement à l'artisan, qui vous dit quand il peut passer." },
          { title: "Transparence Tarifaire Totale", desc: "Devis clair et validé avant tout début de travaux. Aucune surprise sur votre facture." },
          { title: "Du matériel expliqué", desc: "Le choix des équipements est détaillé sur le devis, avec leurs avantages et leur entretien." },
          { title: "Artisan de Proximité", desc: "Un interlocuteur unique, joignable directement sans plateforme intermédiaire." },
        ],
      },
      proofAndReviews: {
        heading: "La satisfaction de nos clients à {VILLE}",
        format: "Mise en avant de la note Google en gros chiffres avec étoiles or, suivie des avis authentiques",
        badges: ["Avis Google Vérifiés", "Note moyenne d'excellence", "100% clients locaux"],
      },
      mobileWinningPattern: {
        stickyBarHtmlPrompt: "Bandeau sticky fixe en bas sur mobile (z-50 bg-white/95 backdrop-blur border-t) avec bouton vert d'appel immédiat (tel:) affichant le numéro et le texte 'Urgence / Dépannage immédiat'.",
        emergencyTagline: "Dépannage rapide 7j/7 à {VILLE}",
      },
      coverageAreaPrompt: "Section géographique rassurante listant {VILLE} et les communes limitrophes dans un rayon de 25 km pour prouver l'ancrage local.",
    },
    copywritingHooks: [
      "Une panne de chauffage ou une fuite d'eau ? Ne restez pas sans solution.",
      "Une installation pensée pour consommer moins, expliquée avant les travaux.",
      "L'exigence du travail bien fait, le respect des délais et des normes en vigueur.",
    ],
  },
  {
    id: "electricite_domotique",
    categoryName: "Électricité Générale & Domotique",
    targetKeywords: ["electricien", "electricite", "domotique", "borne de recharge", "irve", "eclairage", "renovation electrique"],
    trafficLeaders: [
      {
        name: "MonÉlectricien.fr / Qualifelec Leaders",
        trafficSignal: "Top référencement local, trafic qualifié à forte valeur par chantier",
        keySuccessFactors: [
          "Mise en avant immédiate de la sécurité et conformité NFC 15-100",
          "Certification Qualifelec et IRVE (bornes de recharge électrique)",
          "Devis clair sous 24h et diagnostic de l'installation existante",
          "Intervention en urgence pour coupure générale de courant",
        ],
      },
    ],
    conversionBlueprint: {
      hero: {
        headlinePattern: "Électricien à {VILLE} : dépannage, installation, mise en conformité",
        subheadlinePattern: "Travaux d'électricité générale, mise en conformité et domotique à {VILLE}. Devis gratuit et détaillé avant les travaux.",
        primaryCta: "Appel Dépannage Électrique",
        secondaryCta: "Demander une Étude / Devis",
        trustBadges: ["Norme NFC 15-100", "Garantie Décennale", "Certifié Qualifelec", "Assurances Responsabilité Civile"],
      },
      servicesGrid: {
        sectionTitle: "Prestations d'Électricité Générale & Rénovation",
        servicesList: [
          "Dépannage urgent coupure et recherche de court-circuit",
          "Mise aux normes et remplacement de tableau électrique",
          "Installation de bornes de recharge pour véhicules électriques (IRVE)",
          "Rénovation électrique complète pour maison et appartement",
          "Domotique, éclairage LED connecté et motorisation de portail",
          "Chauffage électrique connecté et radiateurs à inertie",
        ],
        layoutStyle: "Cartes modernes épurées avec contrastes de couleurs précises et pastilles de garantie",
      },
      competitiveAdvantages: {
        sectionTitle: "Une installation électrique expliquée de A à Z",
        points: [
          { title: "Le travail aux normes", desc: "Les installations suivent les normes en vigueur, expliquées pièce par pièce." },
          { title: "Le matériel détaillé", desc: "Chaque composant posé figure sur le devis : vous savez ce qui est installé chez vous." },
          { title: "Un devis clair", desc: "Main d'œuvre et fournitures séparées, sans ligne floue." },
        ],
      },
      proofAndReviews: {
        heading: "Ils recommandent notre travail d'électricien",
        format: "Cartes d'avis réels avec étoiles et mentions des chantiers réalisés à {VILLE}",
        badges: ["Artisan de confiance", "Note Google vérifiée"],
      },
      mobileWinningPattern: {
        stickyBarHtmlPrompt: "Bouton d'appel mobile sticky avec mention 'Besoin d'un électricien ? Appel direct'.",
        emergencyTagline: "Dépannage électrique rapide à {VILLE}",
      },
      coverageAreaPrompt: "Mention des zones résidentielles et communes desservies autour de {VILLE}.",
    },
    copywritingHooks: [
      "Votre sécurité électrique ne supporte aucun compromis.",
      "Modernisez votre installation et réduisez votre facture énergétique.",
      "Un électricien à votre écoute pour concrétiser vos projets.",
    ],
  },
  {
    id: "menuiserie_renovation_peinture",
    categoryName: "Menuiserie, Rénovation & Finitions Intérieures",
    targetKeywords: ["menuisier", "menuiserie", "peintre", "peinture", "renovation", "plaquiste", "carreleur", "parquet", "fenetre", "volet", "cuisine", "placard", "agencement"],
    trafficLeaders: [
      {
        name: "Camif Habitat / Illico Travaux / Menuisiers d'Artisans Leaders",
        trafficSignal: "Forte autorité locale, taux de concrétisation élevé sur les projets sur-mesure",
        keySuccessFactors: [
          "Accent MAJEUR sur le visuel : photos Avant / Après et finitions de haute qualité",
          "Valorisation du sur-mesure (Bois, Alu, PVC) et du savoir-faire artisanal",
          "Parcours client en 4 étapes rassurantes (Visite conseil ➔ Devis précis ➔ Réalisation ➔ Réception)",
          "Isolation phonique & thermique aux normes BBC / RE2020",
        ],
      },
    ],
    conversionBlueprint: {
      hero: {
        headlinePattern: "{METIER} à {VILLE} : fabrication et agencement sur mesure",
        subheadlinePattern: "Vos projets d'aménagement conçus avec vous, fabriqués à vos mesures et posés chez vous, à {VILLE} et alentours.",
        primaryCta: "Prendre Rendez-vous / Devis Gratuit",
        secondaryCta: "Découvrir nos Réalisations",
        trustBadges: ["Garantie Décennale", "Fabrication Française / Sur-mesure", "Devis Détaillé Gratuit", "Chantiers Propres & Soignés"],
      },
      servicesGrid: {
        sectionTitle: "Notre Savoir-Faire en Menuiserie & Agencement",
        servicesList: [
          "Menuiseries extérieures : Fenêtres, baies vitrées, volets roulants & portes d'entrée",
          "Agencement intérieur sur-mesure : Dressings, placards, bibliothèques et rangements",
          "Conception et pose de cuisines modernes équipées clé en main",
          "Terrasses en bois, pergolas et bardages extérieurs",
          "Pose de parquets massifs, contrecollés et sols stratifiés",
          "Travaux de peinture soignée, plâtrerie et isolation intérieure",
        ],
        layoutStyle: "Mise en page spacieuse, aérée, mettant en avant la précision des matières et du bois",
      },
      competitiveAdvantages: {
        sectionTitle: "L'art du sur-mesure et des finitions impeccables",
        points: [
          { title: "Conçu pour votre intérieur", desc: "Chaque projet part de vos mesures, de vos usages et de vos envies." },
          { title: "Des matériaux choisis ensemble", desc: "Essences de bois, finitions et quincaillerie présentées avant la fabrication." },
          { title: "Un planning convenu ensemble", desc: "Les étapes, de la prise de mesures à la pose, sont fixées avec vous." },
        ],
      },
      proofAndReviews: {
        heading: "Ce que disent nos clients de nos réalisations",
        format: "Témoignages clients détaillant la qualité de la pose et la propreté du chantier",
        badges: ["Avis clients réels", "Artisan local recommandé"],
      },
      mobileWinningPattern: {
        stickyBarHtmlPrompt: "Barre flottante mobile discrète et élégante : bouton 'Demander un devis gratuit' + bouton téléphone direct.",
        emergencyTagline: "Projet sur-mesure à {VILLE}",
      },
      coverageAreaPrompt: "Déplacement pour métrés et devis à {VILLE} et dans tout le département.",
    },
    copywritingHooks: [
      "Sublimez votre intérieur avec des créations sur-mesure pensées pour durer.",
      "Du conseil initial à la pose finale, l'exigence du détail à chaque étape.",
      "Améliorez l'isolation de votre habitat et gagnez en confort thermique au quotidien.",
    ],
  },
  {
    id: "toiture_couverture_maconnerie",
    categoryName: "Toiture, Couverture, Façade & Maçonnerie",
    targetKeywords: ["couvreur", "couverture", "toiture", "charpente", "macon", "maconnerie", "zingueur", "etancheite", "facade", "ravalement", "gouttiere", "demoussage"],
    trafficLeaders: [
      {
        name: "Attila / Les Couvreurs Occitans / Réseau Artisans Couvreurs",
        trafficSignal: "Plus de 80k requêtes locales par an, gros paniers moyens",
        keySuccessFactors: [
          "Diagnostic toiture offert et intervention d'urgence en cas de fuite / tempête",
          "Garantie Décennale 10 ans certifiée mise en évidence immédiatement",
          "Photos de chantiers réels avant/après pour prouver la qualité des tuiles et finitions",
          "Respect strict de la sécurité et des règles de l'art",
        ],
      },
    ],
    conversionBlueprint: {
      hero: {
        headlinePattern: "Couvreur à {VILLE} : toiture, zinguerie et réparation de fuites",
        subheadlinePattern: "Rénovation de toiture, étanchéité, zinguerie et réparation de fuites à {VILLE} et alentours. Devis gratuit après visite.",
        primaryCta: "Demander un Diagnostic Toiture Offert",
        secondaryCta: "Urgence Fuite Toiture (Appel direct)",
        trustBadges: ["Garantie Décennale 10 Ans", "Intervention Urgence Fuite", "Devis & Déplacement Gratuits", "Matériaux Certifiés NF"],
      },
      servicesGrid: {
        sectionTitle: "Nos Travaux de Couverture, Zinguerie & Façade",
        servicesList: [
          "Rénovation complète de toiture (Tuiles terre cuite, ardoises, bac acier)",
          "Dépannage d'urgence fuite de toiture et bâchage après intempéries",
          "Zinguerie sur-mesure, pose de gouttières alu/zinc et chéneaux",
          "Nettoyage, démoussage toiture et traitement hydrofuge longue durée",
          "Travaux de charpente traditionnelle et traitement du bois",
          "Ravalement de façade et isolation thermique par l'extérieur (ITE)",
        ],
        layoutStyle: "Blocs solides, typographie robuste, sentiment de protection et de solidité",
      },
      competitiveAdvantages: {
        sectionTitle: "Votre toit entre les mains d'un véritable artisan couvreur",
        points: [
          { title: "Un état des lieux avant le devis", desc: "Le toit est inspecté et vous recevez les constats, photos à l'appui, avant tout chiffrage." },
          { title: "Un devis gratuit et détaillé", desc: "Matériaux, surfaces et main d'œuvre détaillés, sans engagement." },
          { title: "Un chantier propre et sécurisé", desc: "Protection des abords et nettoyage en fin de chantier." },
        ],
      },
      proofAndReviews: {
        heading: "Avis vérifiés de nos chantiers de couverture",
        format: "Notes et commentaires de propriétaires satisfaits de la rénovation de leur toiture",
        badges: ["Garantie 10 ans", "Artisan couvreur local"],
      },
      mobileWinningPattern: {
        stickyBarHtmlPrompt: "Barre d'action sticky mobile : bouton 'Urgence Toiture / Appel direct' + bouton 'Devis toiture gratuit'.",
        emergencyTagline: "Intervention toiture rapide à {VILLE}",
      },
      coverageAreaPrompt: "Intervention sur {VILLE} et toutes les communes voisines dans un rayon de 30 km.",
    },
    copywritingHooks: [
      "Protégez durablement votre patrimoine avec une toiture saine et étanche.",
      "Une tuile cassée ou une infiltration ? Appelez pour faire le point sur votre toiture.",
      "Redonnez à votre maison tout son éclat avec un traitement de toiture professionnel.",
    ],
  },
  {
    id: "metiers_de_bouche_commerce",
    categoryName: "Métiers de Bouche & Commerces Artisanaux",
    targetKeywords: ["boulangerie", "boulanger", "patisserie", "boucherie", "boucher", "traiteur", "restaurant", "chocolatier", "fleuriste", "epicerie"],
    trafficLeaders: [
      {
        name: "Meilleurs Artisans de France / Maisons Réputées Locales",
        trafficSignal: "Forte récurrence client, fort taux d'engagement sur Google Maps",
        keySuccessFactors: [
          "Accent immédiat sur le 100% FAIT MAISON et les matières premières locales de qualité",
          "Horaires d'ouverture très lisibles et plan d'accès en 1 clic",
          "Mise en avant des spécialités de la maison et des commandes spéciales (traiteur, gâteaux)",
          "Chaleur de l'accueil, convivialité et passion du métier",
        ],
      },
    ],
    conversionBlueprint: {
      hero: {
        headlinePattern: "{NOM_ENTREPRISE}, {METIER} à {VILLE}",
        subheadlinePattern: "Pains, viennoiseries et spécialités de la boutique, à découvrir à {VILLE}.",
        primaryCta: "Découvrir nos Spécialités",
        secondaryCta: "Commander / Nous Joindre",
        trustBadges: ["100% Fabrication Artisanale", "Farine & Produits Locaux", "Pains au Levain Naturel", "Ouvert du Mardi au Dimanche"],
      },
      servicesGrid: {
        sectionTitle: "Les Spécialités Fraîches de Notre Maison",
        servicesList: [
          "Pains de tradition française et spéciaux au levain naturel",
          "Viennoiseries croustillantes pur beurre préparées chaque matin",
          "Pâtisseries artisanales fines et créations de saison",
          "Snacking frais pour le déjeuner : Sandwiches, quiches et formules gourmandes",
          "Gâteaux sur-mesure pour mariages, anniversaires et événements",
          "Commandes personnalisées et formules traiteur",
        ],
        layoutStyle: "Visuel chaleureux et gourmand, mettant en appétit avec typographie soignée",
      },
      competitiveAdvantages: {
        sectionTitle: "Notre engagement pour la qualité et le goût",
        points: [
          { title: "La vitrine du jour", desc: "Les produits de la boutique présentés avec leurs photos, à mettre à jour simplement." },
          { title: "Commander à l'avance", desc: "Un appel suffit pour réserver une commande et la retirer en boutique." },
          { title: "Un Accueil Chaleureux & Souriant", desc: "Le plaisir de vous servir et de vous conseiller au quotidien dans notre boutique." },
        ],
      },
      proofAndReviews: {
        heading: "Ce que nos clients aiment chez nous",
        format: "Commentaires chaleureux d'habitants du quartier célébrant les produits de la boutique",
        badges: ["Artisan boulanger passionné", "Produits du terroir"],
      },
      mobileWinningPattern: {
        stickyBarHtmlPrompt: "Barre flottante mobile avec bouton direct 'Nous rendre visite / Horaires' et 'Téléphoner / Réserver'.",
        emergencyTagline: "Ouvert aujourd'hui à {VILLE}",
      },
      coverageAreaPrompt: "Situé au cœur de {VILLE}, parking et accès facile à proximité.",
    },
    copywritingHooks: [
      "Le pain et les spécialités de votre boutique de quartier.",
      "Des douceurs préparées avec amour pour illuminer vos moments de partage.",
      "La passion de l'artisanat au service de vos papilles.",
    ],
  },
  {
    id: "automobile_garage_depannage",
    categoryName: "Automobile, Garage & Dépannage Mécanique",
    targetKeywords: ["garage", "mecanique", "carrosserie", "auto", "voiture", "pneu", "vidange", "freinage", "controle technique", "depannage auto", "automobile", "garagiste", "mecanicien"],
    trafficLeaders: [
      {
        name: "Réseaux Référence Auto / Garages Indépendants Qualifiés",
        trafficSignal: "Trafic de recherche urgent et local, fort volume d'appels",
        keySuccessFactors: [
          "Garantie constructeur préservée dès la première révision",
          "Véhicule de prêt gratuit pendant l'intervention",
          "Devis clair avant toute réparation, pièces garanties",
          "Prise en charge toutes marques avec bancs électroniques modernes",
        ],
      },
    ],
    conversionBlueprint: {
      hero: {
        headlinePattern: "Garage à {VILLE} : entretien, réparation et carrosserie",
        subheadlinePattern: "Mécanique générale, diagnostic et carrosserie à {VILLE}. Devis présenté avant toute intervention.",
        primaryCta: "Prendre Rendez-vous en Ligne",
        secondaryCta: "Appeler le Garage Directement",
        trustBadges: ["Garantie Constructeur Préservée", "Véhicule de Courtoisie Prêté", "Devis Avant Travaux", "Toutes Marques"],
      },
      servicesGrid: {
        sectionTitle: "Prestations d'Entretien & Réparation Automobile",
        servicesList: [
          "Révision complète, vidange et filtres avec préservation de la garantie",
          "Diagnostic électronique complet et recherche de panne moteur",
          "Freinage, amortisseurs, suspensions et tenue de route",
          "Remplacement et équilibrage de pneumatiques toutes saisons",
          "Travaux de carrosserie, débosselage et peinture automobile",
          "Pré-contrôle technique et présentation au centre de contrôle",
        ],
        layoutStyle: "Design dynamique, rigoureux et moderne, évoquant la précision mécanique",
      },
      competitiveAdvantages: {
        sectionTitle: "Pourquoi confier votre voiture à notre atelier ?",
        points: [
          { title: "Un rendez-vous simple", desc: "Un appel pour fixer le passage au garage, sans plateforme intermédiaire." },
          { title: "Transparence Totale des Tarifs", desc: "Aucun travail n'est engagé sans votre accord préalable sur le devis." },
          { title: "Le diagnostic expliqué", desc: "Ce qui a été constaté et ce qui est conseillé, expliqué avant les travaux." },
        ],
      },
      proofAndReviews: {
        heading: "Avis des automobilistes de {VILLE}",
        format: "Témoignages soulignant l'honnêteté, la rapidité et le juste prix",
        badges: ["Garage recommandé", "Note de satisfaction élevée"],
      },
      mobileWinningPattern: {
        stickyBarHtmlPrompt: "Bouton d'appel mobile direct pour prise de rendez-vous ou remorquage d'urgence.",
        emergencyTagline: "Atelier ouvert à {VILLE}",
      },
      coverageAreaPrompt: "À {VILLE} et communes du bassin de vie.",
    },
    copywritingHooks: [
      "Roulez en toute sérénité avec un entretien professionnel au juste prix.",
      "Un garage honnête et compétent qui prend le temps de vous expliquer les réparations.",
      "Votre sécurité sur la route est notre priorité absolue.",
    ],
  },
  {
    id: "general_local_winner",
    categoryName: "Artisans & Professionnels Locaux (Benchmark Universel)",
    targetKeywords: ["*"],
    trafficLeaders: [
      {
        name: "Leaders Locaux Top 1 Google France",
        trafficSignal: "Modèle standard haute performance utilisé par les meilleures agences web locales",
        keySuccessFactors: [
          "Headline locale ultra-claire associant Métier + Ville + Avantage principal",
          "Double CTA dans le Hero : Appel direct immédiat + Devis gratuit",
          "Grille de 4 à 6 prestations clés bien détaillées avec puces bénéfices",
          "Processus de travail rassurant en 3 étapes (Écoute ➔ Devis ➔ Réalisation)",
          "Témoignages clients authentiques et sticky call bar sur smartphone",
        ],
      },
    ],
    conversionBlueprint: {
      hero: {
        headlinePattern: "{NOM_ENTREPRISE}, {METIER} à {VILLE}",
        subheadlinePattern: "Vos projets étudiés avec vous, un devis gratuit et un interlocuteur unique, à {VILLE} et alentours.",
        primaryCta: "Appeler Directement (N° affiché)",
        secondaryCta: "Demander un Devis Gratuit",
        trustBadges: ["Artisan Local Qualifié", "Devis Gratuit & Sans Engagement", "Assurances & Garanties", "Intervention Rapide"],
      },
      servicesGrid: {
        sectionTitle: "Nos Domaines d'Intervention & Savoir-Faire",
        servicesList: [
          "Prestation sur-mesure adaptée à vos besoins spécifiques",
          "Diagnostic initial et conseils d'expert personnalisés",
          "Intervention soignée dans le respect des délais et des normes",
          "Maintenance, entretien et suivi rigoureux dans la durée",
        ],
        layoutStyle: "Grille moderne, responsive, cartes avec bordures subtiles et ombres légères",
      },
      competitiveAdvantages: {
        sectionTitle: "Les engagements de notre entreprise",
        points: [
          { title: "Un interlocuteur unique", desc: "La même personne vous répond, établit le devis et réalise le travail." },
          { title: "Écoute & Proximité", desc: "Un artisan local à votre écoute qui privilégie la relation humaine et la confiance." },
          { title: "Un devis clair", desc: "Chaque ligne du devis est expliquée avant de commencer." },
        ],
      },
      proofAndReviews: {
        heading: "La confiance de nos clients locaux",
        format: "Avis vérifiés avec étoiles or et retours d'expérience positifs",
        badges: ["Artisan recommandé", "Satisfaction garantie"],
      },
      mobileWinningPattern: {
        stickyBarHtmlPrompt: "Bouton mobile sticky 'Appel direct' en bas d'écran avec numéro de téléphone visible.",
        emergencyTagline: "Artisan disponible à {VILLE}",
      },
      coverageAreaPrompt: "Intervention à {VILLE} et dans toute la région environnante.",
    },
    copywritingHooks: [
      "Un travail soigné, expliqué étape par étape.",
      "Des solutions concrètes et adaptées à votre budget.",
      "Votre satisfaction est notre meilleure carte de visite.",
    ],
  },
];

function normalizeTrade(text: string): string {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Un mot-clé correspond s'il apparaît comme mot (ou suite de mots) entier dans le métier.
 * Un mot-clé d'au moins 5 lettres accepte aussi un mot qui commence par lui (boulanger → boulangerie).
 */
function keywordMatches(words: string[], phrase: string, keyword: string): boolean {
  const kw = normalizeTrade(keyword);
  if (!kw) return false;
  if (kw.includes(" ")) return ` ${phrase} `.includes(` ${kw} `);
  return words.some((w) => w === kw || (kw.length >= 5 && w.startsWith(kw)));
}

/**
 * Trouve le benchmark le plus pertinent pour un métier donné :
 * le profil qui reconnaît le plus de mots-clés ; à égalité, celui dont le mot-clé reconnu est le plus long.
 */
export function getCompetitorBenchmark(activity: string): CompetitorBenchmark {
  const phrase = normalizeTrade(activity);
  const words = phrase ? phrase.split(" ") : [];
  let best: { b: CompetitorBenchmark; score: number; longest: number } | null = null;

  for (const b of COMPETITOR_BENCHMARKS) {
    if (b.id === "general_local_winner") continue;
    const matched = b.targetKeywords.filter((kw) => keywordMatches(words, phrase, kw));
    if (matched.length === 0) continue;
    const longest = Math.max(...matched.map((kw) => normalizeTrade(kw).length));
    if (!best || matched.length > best.score || (matched.length === best.score && longest > best.longest)) {
      best = { b, score: matched.length, longest };
    }
  }

  // Fallback universel
  return best?.b ?? COMPETITOR_BENCHMARKS.find((b) => b.id === "general_local_winner")!;
}
