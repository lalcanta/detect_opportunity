# Bilans « visibilité locale » et « acquisition » — conception

Date : 13/11/2026. Décisions de Loïc Alcantara dans la conversation du jour, sauf mention « choix de conception ».

## 1. Intention

Les besoins `seo_local` (Référencement local) et `ads_acquisition` (Publicité) sont en brouillon : leur preuve est une
démo de site générée par IA, qui laisse croire au prospect qu'on lui vend un site alors qu'on lui vend sa place sur
Google Maps (abonnement) ou ses campagnes. Ils ont besoin d'une preuve à eux.

La preuve devient un **bilan chiffré, comparé aux concurrents réels du prospect** : « sur "plombier Lyon", Dupont et
Martin passent devant vous ». Un artisan réagit à ses voisins nommés, pas à « votre référencement est faible ».

Succès : le closer ouvre le bilan pendant l'appel (ou l'envoie), le prospect voit en dix secondes où il est, qui passe
devant lui et ce qu'il faudrait faire ; les deux besoins passent de brouillon à actif après un scan de test relu par
Loïc.

## 2. Objectifs, non-objectifs, anti-objectifs

**Objectifs**
- Un bilan par besoin, calculé **sans IA** à partir de mesures (coût nul, rien d'inventé), servi sur `/demos/:id`
  comme le rapport RGPD actuel : suivi d'ouverture, alerte « lead chaud » et bouton d'intérêt fonctionnent tels quels.
- Les données concurrentes viennent du scan lui-même (même recherche Maps), sans recherche supplémentaire.
- **Démo de site en complément, seulement si le bilan pointe le site** (décision Loïc) : section « Votre site » du
  bilan avec un lien vers la démo. Réglable par besoin dans l'onglet Besoins (automatique / toujours / jamais).
- Le pitch du closer et l'email s'appuient sur les chiffres du bilan (générateurs de pitch existants, IA).

**Non-objectifs**
- Score Google Lighthouse / Core Web Vitals : on n'affiche que le temps de chargement mesuré par le scan.
- Publicités Google des concurrents (invisibles sans outil payant).
- Détail de la fiche Google vue par son propriétaire (photos, réponses aux avis, fiche revendiquée).
- Nouvelle recherche Maps par lead, ou suivi de position dans le temps.

**Anti-objectifs** (échec même si ça marche)
- Un chiffre qui n'a pas été mesuré : nombre d'appels perdus, chiffre d'affaires manqué, trafic estimé.
- Un concurrent présenté autrement que par ses données publiques (nom, note, avis, rang, ce qui est installé sur son
  site) : pas de jugement sur lui.
- Une position présentée comme définitive : Maps varie selon l'endroit et la personne. Toujours afficher la recherche
  et la date du constat.

## 3. Contraintes (vérifiées dans le code le 13/11/2026)

- `mapsScraper.ts` fusionne les résultats des sous-requêtes dans un `Set` et ne renvoie que les leads qualifiés : ni
  rang ni concurrents ne sont conservés. Les fiches ouvertes avant le lead (donc mieux classées) ont pourtant été lues
  (nom, note, nombre d'avis, site, catégorie).
- L'inspection relève `title` (non conservé), `loadTimeMs` (jusqu'à `domcontentloaded`), `isResponsive`, `isHttps`,
  `paidAdsDetected`, `trackersFound`, `contactForm` ; rien sur description, H1, données structurées, téléphone du site.
- Une définition de besoin a **une seule** preuve (`proof`), le workflow refuse deux nœuds qui écrivent la même clé
  (`preuve`), et un lead n'a qu'une colonne HTML (`leads.demo_html`).
- `validate.ts` impose `audit_report` → `tracker_report` ; `syncQueue.ts` et le serveur MCP traitent `tracker_report`
  et `demo_web` à part.
- Toute modification du schéma suit `docs/agents/donnees-d1.md` (trois endroits, `schemaSync.test.ts`).
- Mode préparation (`prep`) : la preuve n'est pas générée par le workflow, `prepScan.ts` écrit le rapport RGPD
  lui-même et laisse à l'agent `demo.html` / `battlecard.json` (`docs/agents/file-de-generation.md`).

## 4. Ce qui est décidé

### 4.1 Données à collecter

**Rang et concurrents (scan Maps).** Un scan peut lancer plusieurs recherches (sous-requêtes séparées par des
virgules, éventuellement centrées sur des coordonnées sans nom de ville). Choix de conception : conserver l'ordre
d'affichage **par sous-requête** ; chaque lead prend son rang dans la sous-requête qui l'a trouvé en premier. Chaque
lead qualifié reçoit :
- `maps_rank` : sa position dans cette sous-requête (1 = premier) ;
- `maps_query` et `maps_checked_at` : la sous-requête **telle qu'elle a été lancée** (avec la ville, ou la zone
  « autour de <ville du scan> » quand la recherche part de coordonnées) et la date du constat. Le bilan n'affiche
  jamais une recherche qui n'a pas été faite ;
- `competitors` : jusqu'à 5 fiches de la même recherche mieux classées que lui (à défaut, les plus proches), avec
  `name`, `rank`, `rating`, `reviewsCount`, `website` (ou null), `category`.

Seules les fiches déjà ouvertes par le scan sont utilisées (pas de navigation en plus vers Maps).

**Signaux de référencement du site (nouveau module d'inspection `seo_onpage`).** Sur la page déjà ouverte :
`title`, meta description, premier H1, présence de données structurées `LocalBusiness` (ou sous-type) en JSON-LD,
téléphones trouvés (texte et liens `tel:`), présence d'un lien `tel:` cliquable. Calculés : le métier et la ville
figurent-ils dans le titre / le H1 ; le téléphone du site correspond-il à celui de la fiche Maps.

**Pixels des concurrents (bilan acquisition uniquement).** Pour les concurrents qui ont un site : une requête HTTP
simple de la page d'accueil (sans navigateur, délai court), recherche des mêmes signatures que `ads_pixel_spy`
(Meta, Google Ads, TikTok, LinkedIn, Microsoft). Résultat par concurrent : liste des pixels, ou « non vérifié » si la
page n'a pas répondu.

### 4.2 Bilan « visibilité locale » (`seo_local`)

Sections, dans cet ordre :
1. **En-tête** : entreprise, recherche « métier ville », date du constat, score /100.
2. **Votre position sur Google Maps** : rang, puis les concurrents mieux classés (nom, note, avis). Si le lead est
   premier : le message le dit, et le bilan met l'accent sur l'écart d'avis avec les suivants.
3. **Vos avis** : note et nombre d'avis face à la moyenne et au maximum des concurrents listés.
4. **Votre fiche** : site relié ou non (lien vers une page annuaire = « pas de site »), catégorie affichée.
5. **Votre site** (si site) : métier et ville dans le titre et le H1, description présente, téléphone identique à la
   fiche, données structurées, adaptation mobile, HTTPS, temps de chargement mesuré. Si la démo complémentaire existe :
   « Voir à quoi pourrait ressembler votre site » (lien).
6. **Trois actions prioritaires**, tirées des points perdus les plus lourds, formulées sans promesse chiffrée.

Score (choix de conception, à ajuster sur les premiers scans) : position 35, avis 30, fiche 10, site 25. Chaque
critère non mesurable est retiré du total (le score est ramené sur 100), jamais compté comme échoué.
**Pas de site** est un constat, pas une absence de mesure (choix de conception) : la partie « site » vaut 0/25, et le
critère « site relié » de la fiche est alors retiré pour ne pas pénaliser deux fois. Un artisan sans site ne peut donc
pas dépasser 75/100.

### 4.3 Bilan « acquisition » (`ads_acquisition`, site requis)

1. **En-tête** : entreprise, date, score /100.
2. **Ce qui est installé sur votre site** : pixels publicitaires, suivi Google / Meta, bandeau de consentement.
3. **Vos concurrents** : pour chacun, les pixels trouvés sur son site (« mesure ses appels » si Google Ads conversion).
4. **Votre page d'arrivée** : lien `tel:` cliquable, formulaire de contact, adaptation mobile, temps de chargement.
   Si la démo complémentaire existe : lien.
5. **Trois actions prioritaires.**
6. Pour le closer seulement (fiche du lead, pas dans le bilan) : lien vers la bibliothèque publicitaire Meta filtrée
   sur le nom de l'entreprise.

Score (choix de conception) : suivi et pixels 40, page d'arrivée 40, comparaison concurrents 20.

### 4.4 Démo complémentaire

- Réglage par besoin `complementDemo` : `auto` (défaut), `always`, `never`, choisi par clics dans l'onglet Besoins.
- `auto` produit la démo si au moins une condition est vraie (choix de conception) :
  - visibilité locale : pas de site, site non adapté au mobile, métier ou ville absents du titre et du H1, ou
    chargement mesuré au-delà de 3 s ;
  - acquisition : pas de lien `tel:` cliquable et pas de formulaire, site non adapté au mobile, ou chargement au-delà
    de 3 s.
- La démo est produite par le générateur existant (`llm_demo`, `focus` de l'offre) et stockée à part : nouvelle colonne
  `leads.site_demo_html`, servie par `GET /demos/:id/site` avec le même suivi d'ouverture, la même réécriture des
  photos et la même barre que `/demos/:id`.
- Le bilan est toujours la preuve principale (`/demos/:id`).

### 4.5 Intégration

- Nouveaux types de preuve : `visibility_report` (générateur `visibility_report`) et `acquisition_report` (générateur
  `acquisition_report`), avec leurs nœuds de workflow (écrivent `preuve` et `rapport`), leurs libellés de catalogue et
  la validation correspondante. Les définitions `seoLocal.ts` et `adsAcquisition.ts` passent sur ces preuves et le
  module `seo_onpage` ; elles restent en `draft` (Loïc les passe en actif après relecture d'un scan de test).
- **Bascule en production** (décision Loïc, 13/11/2026 : « écrase au besoin », l'outil n'est ni commercialisé ni
  étendu) : la base fait foi, donc une mise à jour au démarrage (`ensureAuthSchema` ou le chargement des définitions)
  remplace une seule fois les lignes `seo_local` et `ads_acquisition` de `opportunity_definitions` par les définitions
  du code, même si elles ont été modifiées dans l'onglet Besoins, en passant par l'historique
  (`opportunity_definition_history`) pour pouvoir revenir en arrière. Sauvegarde de la base avant la fusion.
- Un nœud `site_demo` conditionnel (écrit une nouvelle clé `demo_site`) suit le bilan ; il se déclare passé
  (`skipped`) quand la condition est fausse ou que `complementDemo` vaut `never`.
- Les données concurrentes et `seo_onpage` sont conservées dans `audit_data` (le closer les voit dans la fiche).
- Mode préparation : `prepScan.ts` écrit le bilan (`demo.html`) comme il le fait pour le rapport RGPD ; si la démo
  complémentaire est requise, il dépose aussi `prompt_site_demo.md` et l'agent écrit `site_demo.html`.
  `sync-queue` envoie les deux ; `docs/agents/file-de-generation.md` est mis à jour.
- Rendu : la mise en page commune du rapport RGPD (en-tête, cartes, tableaux) est extraite dans un module partagé
  réutilisé par les trois rapports.

## 5. Laissé au constructeur

- Noms exacts des champs et des fichiers, découpage des modules, styles des bilans (dans l'esprit du rapport RGPD).
- Expressions régulières de détection (titre, H1, JSON-LD, téléphones) et normalisation des numéros.
- Comportement exact quand la recherche principale n'a pas été faite (scan par liste de domaines) : pas de section
  position, le reste du bilan s'affiche.
- Tests : générateurs (HTML attendu à partir de données fixes, critères non mesurables retirés), module `seo_onpage`,
  condition de la démo complémentaire, rang et concurrents dans le scraper (sur une liste simulée), validation des
  nouvelles définitions ; un scan de test réel par besoin (`--dry-run`) avant de proposer l'activation.
