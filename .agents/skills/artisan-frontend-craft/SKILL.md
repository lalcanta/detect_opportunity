---
name: artisan-frontend-craft
description: Système de direction artistique et de design frontend Tailwind CSS sur-mesure pour démos d'artisans locaux (bâtiment, bouche, urgence, décoration, automobile). Génère des démos uniques, immersives et à très forte conversion sans aucun effet de template répétitif.
---

> **Lu par le code** : `lead-engine-cli/src/generateQueue.ts` injecte ce fichier, par son chemin, dans les prompts de
> génération des démos. Le déplacer ou le renommer impose de modifier `CRAFT_GUIDE_PATH`.

# Skill : Artisan Frontend Craft (Tailwind CSS Sur-Mesure)

Ce skill est activé dès la création ou la refonte de la démo interactive (`demo.html`) d'un artisan ou commerce local. Il garantit que chaque site possède **une âme, une palette chromatique unique et des composants interactifs originaux**, rompant définitivement avec les modèles génériques répétitifs.

---

## 0. Règle d'honnêteté (prioritaire sur tout le reste)

La démo est montrée au prospect comme **son** futur site : tout ce qui y est affirmé doit être vrai pour lui.
- **N'invente aucun avis, aucun nom de client, aucune citation.** Sans texte d'avis dans `meta.json`, affiche la note et
  le nombre d'avis réels, avec un emplacement « Vos avis Google s'afficheront ici ».
- **N'affirme aucun fait absent des données** : certification (RGE, Qualibat, Qualifelec), garantie décennale,
  assurance, délai d'intervention, disponibilité 7j/7, prix, années d'expérience, nombre de chantiers, horaires,
  producteurs partenaires, « fait maison ».
- **Images : les vraies photos du prospect d'abord.** `meta.json` → `site_images` liste les photos de son site
  (réalisations, boutique, produits) : utilise-les en lien direct. Sans photo, préfère aplats, dégradés et motifs CSS ;
  une photo de banque d'images porte la mention « Photo d'exemple ».
- Les composants signatures ci-dessous qui reposent sur ces faits (sceau décennale, bandeau d'astreinte, compteur
  d'interventions, grille de tarifs, origine des matières) se présentent comme **emplacements à compléter** ou
  **exemples clairement signalés** (« Exemple », « à confirmer »).

---

## 1. Matrice des 4 Archétypes de Design par Métier

Avant d'écrire une seule ligne de HTML, identifiez l'archétype du prospect :

### 🪵 Archétype 1 : MATIÈRE & GROS ŒUVRE (Couvreur, Charpentier, Maçon, Façadier, Terrassier)
- **Ambiance** : Robuste, noble, fierté du geste, ancré dans la matière minérale et le bois.
- **Palette** : 
  - Fond : Pierre de taille / Calcaire (`bg-[#F9F8F5]` ou `bg-stone-50`)
  - Accent primaire : Terre cuite, Cuivre ou Ardoise foncée (`text-[#9A3412]` / `bg-[#1E2530]`)
  - Contraste : Noir forge (`#111827`)
- **Typographie** : Titres puissants avec empattements discrets ou ultra-bold (`font-serif` ou `Plus Jakarta Sans font-extrabold tracking-tight`).
- **Composants signatures obligatoires** :
  1. **Comparateur Avant / Après interactif** (slider responsive pur CSS/JS ou toggle 2 boutons pour comparer l'état avant rénovation et le résultat final).
  2. **Sceau de Garantie Décennale & Responsabilité Civile** frappé comme un label officiel avec millésime d'expérience.
  3. **Grille de réalisations locales avec étiquettes techniques** (*« Rénovation toiture 160m² en tuiles romanes — [Ville] »*).

---

### 🥖 Archétype 2 : GOURMAND & COMMERCE DE PROXIMITÉ (Boulanger, Pâtissier, Boucher, Traiteur, Caviste)
- **Ambiance** : Chaleureux, sensoriel, généreux, convivial, tradition vivante.
- **Palette** :
  - Fond : Crème douce / Beurre frais (`bg-[#FDFBF7]` ou `bg-amber-50/30`)
  - Accent primaire : Doré croûte de pain (`text-[#D97706]` / `bg-[#B45309]`)
  - Tons secondaires : Chocolat chaud (`text-[#3E2723]`) ou Bordeaux velours (`#7F1D1D`)
- **Typographie** : Rétro-chic chaleureuse (`Fraunces`, `Cinzel`, ou `serif font-semibold`).
- **Composants signatures obligatoires** :
  1. **Badge d'Ouverture Vivant** : Pastille verte pulsante avec script d'heure dynamique (*« Ouvert actuellement jusqu'à 19h30 »*).
  2. **Présentoir des Spécialités Phares** : Cartes façon vitrine (nom et photo réels du produit, aucune mention « fait maison » non vérifiée) et bouton d'action *« Réserver pour ce midi »*.
  3. **Origine des matières premières** : Carte locale ou bandeau des producteurs partenaires (farine régionale, viandes d'éleveurs voisins).

---

### ⚡ Archétype 3 : HAUTE VÉLOCITÉ & URGENCE (Plombier dépannage, Électricien, Serrurier, Vitrier)
- **Ambiance** : Réactivité absolue, clarté chirurgicale, sécurité, transparence tarifaire sans stress.
- **Palette** :
  - Fond : Blanc pur technique (`bg-white` avec bordures `border-zinc-200`)
  - Accent d'urgence : Orange sécurité vif (`bg-amber-500` / `bg-orange-600`) ou Bleu cyan électrique (`bg-sky-600`)
  - Zone de focus : Carte d'alerte en contraste sombre (`bg-zinc-950 text-white`)
- **Typographie** : Chiffres géants monospace (`font-mono font-bold`), boutons XXL faciles à taper d'une main sur mobile.
- **Composants signatures obligatoires** :
  1. **Bandeau d'Astreinte Immédiate** : *« Dépannage en 30 à 45 minutes sur [Ville] et 25 km aux alentours »* avec bouton d'appel direct clignotant subtilement.
  2. **Grille des Tarifs Forfaits Clairs** : Cartes avec prix fixes indicatifs (ex: Recherche de fuite, Remplacement serrure 3 points) pour désamorcer la peur de l'arnaque.
  3. **Compteur d'Interventions Réussies** : Chiffre dynamique de chantiers clôturés avec succès.

---

### 🎨 Archétype 4 : STUDIO & MÉTIERS D'ART (Peintre décorateur, Ébéniste, Cuisiniste, Agencement, Paysagiste)
- **Ambiance** : Éditorial, magazine d'architecture d'intérieur, minimalisme haut de gamme, grand espace négatif.
- **Palette** :
  - Fond : Greige épuré (`bg-[#F4F1EA]` ou `bg-zinc-900` pour un dark mode atelier d'art)
  - Accents : Vert sauge / Olive (`#4A5548`), Terracotta douce, Laiton brossé
  - Typographie : Sans-serif géométrique aérée avec grand interligne et titres élégants.
- **Composants signatures obligatoires** :
  1. **Nuancier de Matières Cliquable** : Échantillons de bois/teintes interactifs qui prévisualisent les textures.
  2. **Galerie Asymétrique (Masonry Layout)** : Mosaïque de photos en alternance grand format et détails macro.
  3. **Simulateur de Devis en 3 Étapes** : Sélecteur visuel interactif sans rechargement de page (Projet → Surface → Contact).

---

## 2. Bibliothèque de Micro-Composants Interactifs (JS Pur - 0 Dépendance)

Chaque démo doit obligatoirement inclure **au moins un** des micro-composants interactifs suivants intégrés dans le code :

### A. Le Comparateur Avant / Après Glissant (Responsive & Touch-Friendly)
```html
<div class="relative w-full max-w-2xl mx-auto h-80 rounded-2xl overflow-hidden shadow-xl select-none" id="before-after-box">
  <img src="https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=800&q=80" alt="Après" class="absolute inset-0 w-full h-full object-cover">
  <div class="absolute inset-0 bg-stone-900/60 flex items-center justify-center after-label pointer-events-none">
    <span class="absolute top-4 right-4 bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow">APRÈS RÉNOVATION</span>
  </div>
  <div id="before-layer" class="absolute inset-0 overflow-hidden w-1/2 border-r-2 border-white shadow-2xl">
    <img src="https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=800&q=80" alt="Avant" class="absolute inset-0 w-full h-full object-cover max-w-none" style="width: 200%;">
    <span class="absolute top-4 left-4 bg-amber-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow">AVANT</span>
  </div>
  <input type="range" min="0" max="100" value="50" class="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-20" oninput="document.getElementById('before-layer').style.width = this.value + '%'">
</div>
```

---

### B. Le Simulateur de Devis Express en 3 Étapes
```html
<div class="bg-white rounded-2xl p-6 sm:p-8 shadow-xl border border-zinc-200/80 max-w-xl mx-auto" id="wizard-form">
  <div class="flex items-center justify-between mb-6 border-b border-zinc-100 pb-4">
    <span class="text-xs font-extrabold uppercase tracking-wider text-indigo-600" id="step-indicator">Étape 1 sur 3 • Votre Projet</span>
    <div class="flex gap-1.5" id="step-dots">
      <span class="w-6 h-1.5 rounded-full bg-indigo-600"></span>
      <span class="w-6 h-1.5 rounded-full bg-zinc-200"></span>
      <span class="w-6 h-1.5 rounded-full bg-zinc-200"></span>
    </div>
  </div>
  <!-- Contenu des étapes avec transition fluide en JS pur -->
</div>
```

---

### C. La Sticky Bottom Call Bar Haute Conversion (Mobile First)
Toujours intégrée en bas pour les smartphones :
```html
<aside aria-label="Contact rapide" class="fixed bottom-0 inset-x-0 z-50 sm:hidden bg-white/95 backdrop-blur-md border-t border-zinc-200/80 p-3 shadow-2xl">
  <div class="flex items-center gap-2">
    <a href="tel:0600000000" class="flex-1 flex items-center justify-center gap-2 bg-emerald-600 active:bg-emerald-700 text-white py-3 rounded-xl font-bold text-sm shadow-md transition-transform active:scale-95">
      <svg class="w-4 h-4 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>
      <span>Appeler l'Artisan</span>
    </a>
    <a href="https://wa.me/33600000000" class="w-12 h-12 flex items-center justify-center bg-[#25D366] text-white rounded-xl shadow-md active:scale-95 transition-transform" title="Envoyer un message WhatsApp">
      <svg class="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.664-.698c.97.531 1.884.819 2.801.819l.004-.001c3.18 0 5.767-2.586 5.768-5.766 0-3.18-2.587-5.765-5.777-5.765zm0 10.375c-.83 0-1.642-.224-2.352-.647l-.169-.101-1.748.458.467-1.704-.111-.177c-.463-.739-.708-1.597-.707-2.476.002-2.535 2.063-4.596 4.601-4.596 2.534 0 4.596 2.062 4.597 4.596-.002 2.535-2.063 4.599-4.578 4.599z"/></svg>
    </a>
  </div>
</aside>
```

---

## 3. Checklist Qualité Obligatoire avant Validation

Avant de livrer `demo.html`, vérifiez :
1. ✅ **La démo a-t-elle son propre style visuel ?** Si elle ressemble à la démo précédente, changez immédiatement la palette, la typographie et la disposition de la Hero section.
   `prompt_demo.md` impose une **direction artistique** (Éditorial XXL, Nuit premium, Bento, Néo-brutal, Plein cadre,
   Grille suisse, Organique, Split cinétique : voir `lead-engine-cli/src/generator/designDirections.ts`) : elle prime
   sur la palette et la typographie de l'archétype, qui gardent la psychologie client et le composant signature.
   Le premier écran doit produire un effet « wahou » (entrée orchestrée, typographie expressive, profondeur).
   `prompt_demo.md` contient aussi les **principes de design** (synthèse de la skill officielle `frontend-design`) et la
   liste des signes de page générée à proscrire : appliquez-les, ils priment sur les exemples de code de ce guide
   (étiquettes en capitales, fond crème + terracotta, apparitions au scroll sur chaque section…).
2. ✅ **Rien n'est inventé ?** Vrais avis Google seulement (sinon note réelle + emplacement), aucune certification,
   garantie, délai ou prix affirmé sans source (voir §0).
3. ✅ **Le numéro de téléphone réel et le WhatsApp fonctionnent-ils ?**
4. ✅ **Le responsive mobile est-il parfait (390 px de large) ?** Aucun défilement horizontal, aucun élément positionné
   (`absolute`, pastille, sticker) qui chevauche un titre ou un bouton : sur mobile, le repasser en flux normal
   (`relative` puis `sm:absolute`). La barre d'appel reste toujours accessible. Le CRM ajoute en haut de l'écran mobile
   un bandeau « Ce design me plaît » : ne rien placer d'indispensable dans les 100 premiers pixels fixes.
5. ✅ **Y a-t-il au moins un composant interactif dynamique ?** (Avant/Après, calculateur, ou indicateur live).
