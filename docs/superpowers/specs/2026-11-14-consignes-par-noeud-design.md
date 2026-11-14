# Consignes de texte assemblées par nœud — conception

Date : 14/11/2026. Branche : `feat/consignes-par-noeud`.

## Pourquoi

Les textes commerciaux (script d'appel, message écrit, dossier du closer) sont rédigés par l'IA à partir d'une
consigne. Aujourd'hui, cette consigne est écrite à la main à **trois endroits**, qui ne savent pas ce que le scan a
réellement mesuré :

- `lead-engine-cli/src/prepScan.ts` : modèle de battlecard du mode préparation (`battlecardSalesAngle`, schéma JSON
  avec `executiveSummary`, `currentSiteCritique`, `openingPitch`) et consigne du message écrit
  (`buildWrittenPitchPrompt`) ;
- `lead-engine-cli/src/copywriter/battlecard.ts` et `copywriter/coldEmail.ts` : consignes envoyées à l'IA en mode
  complet (schéma `callScript`, `whatsappText`) ;
- `copywriter/bilanPitch.ts` : faits des bilans, ajoutés par-dessus.

Chacun contient des phrases figées par type d'offre et des exemples chiffrés. Résultat, constaté en relecture des
bilans :

1. un bilan de visibilité affirme « le prospect manque de visibilité » et parle d'« appels générés », même pour un
   artisan classé premier ;
2. le script d'appel demande de « faire l'éloge de l'avis client réel cité » sans recevoir d'avis ;
3. des valeurs par défaut se font passer pour des mesures : `lead.rating || 5` (« 5★ »), `reviewsCount || 0`
   (« 0 avis ») ;
4. les deux modes produisent des schémas différents, rattrapés au cas par cas par `syncQueue.ts` et `closer.ts`.

## Intention

**La consigne est assemblée à partir des nœuds du workflow qui ont réellement produit une mesure.** Chaque nœud porte,
dans le code, le bout de consigne qu'il apporte. Un nœud sauté, ou qui a tourné sans rien trouver, n'apporte rien :
l'IA ne peut donc pas parler de ce qui n'a pas été mesuré.

Décision de l'utilisateur : ces bouts de consigne **ne sont pas modifiables** dans l'onglet Besoins. Un besoin qui
demande un autre argument passe par un **nouveau nœud**.

## Objectifs

- Un seul assembleur de consigne pour les textes rédigés par l'IA, utilisé à l'identique en mode préparation (fichier
  `prompt_battlecard.md` de la file) et en mode complet (envoyé au modèle).
- Chaque type de nœud déclare, dans le code, ce qu'il apporte au texte : ses constats mesurés et, au besoin, des
  valeurs calculées à partir d'eux.
- Aucune valeur par défaut présentée comme une mesure ; une mesure absente se traduit par une absence dans la
  consigne, jamais par « 0 », « 5★ » ou « n/a » à interpréter.
- Un seul schéma de réponse (celui de `battlecardSchema`), avec des exemples neutres, sans aucune valeur.
- Corriger au passage les deux défauts de détection relevés sur les bilans (voir « Corrections de détection »).

## Non-objectifs

- La consigne de la **démo de site** (`prompt_demo.md`, `generateDemoHtml`) : elle suit le guide de design et n'est
  pas concernée.
- Le message de l'**audit RGPD** (`tracker_cold_email`) : il est actif en production, gabarit fixe sans IA en mode
  complet. Il garde sa consigne actuelle en mode préparation. *(Mon choix : ne pas toucher une offre active dans ce
  chantier ; elle pourra passer sur l'assembleur ensuite.)*
- Affichage des constats au closer dans le CRM. Les constats sont produits sous une forme structurée qui le
  permettra plus tard, mais aucune vue n'est ajoutée ici. *(Mon choix.)*
- Rendre les bouts de consigne ou l'angle modifiables dans l'interface.

## Anti-objectifs (ce serait un échec même si ça marche)

- Une phrase de la consigne qui affirme quelque chose qu'aucun nœud n'a mesuré pour ce lead.
- Une consigne différente entre le mode préparation et le mode complet pour le même dossier.
- Un exemple du schéma JSON qui contient un chiffre, un nom ou un avis (l'IA les recopie).

## Fonctionnement

### Ce qu'un nœud apporte

Chaque type de nœud qui produit une donnée utile au texte déclare une **contribution** :

```ts
/** Ce qu'un nœud exécuté apporte à la consigne : des constats mesurés, rien quand il n'a rien trouvé. */
type PitchContribution = (d: Dossier) => PitchFact[] | null;

interface PitchFact {
  /** Libellé court (« Titre de la page »), réutilisable plus tard pour un affichage. */
  label: string;
  /** Valeur mesurée ou calculée, déjà rédigée en français. */
  value: string;
}
```

- La contribution n'est appelée que si le nœud a le statut `done` dans `d.trace`. Un nœud `skipped`, ou absent du
  workflow du besoin, n'apporte rien.
- Elle renvoie `null` quand le nœud a tourné sans résultat exploitable (inspection en échec, recherche vide).
- Elle ne lit que les champs que son nœud écrit, plus ceux de la fiche Maps quand c'est son rôle.
- Les contributions vivent dans le moteur (`lead-engine-cli/src/workflow/`), à côté du runner, car elles lisent le
  `Dossier`. Le catalogue partagé (`shared/opportunities/workflow.ts`) reste sans dépendance.

### Contributions par nœud (premier jeu)

| Nœud | Constats apportés (seulement s'ils sont mesurés) |
|---|---|
| Fiche Maps (toujours présente) | nom, métier, ville ; note et nombre d'avis **si lus** ; texte d'un ou deux avis **si lus**, avec leur auteur. Rien de tout ça pour un prospect sans fiche (`noMapsListing`). |
| `seo_onpage` | titre, H1, description ; calculé : métier et ville présents ou absents du titre et du H1 (même règle que la démo complémentaire). |
| `contacts_legal` | dirigeant trouvé sur le site. |
| `dirigeant_sirene` | dirigeant et date de création. |
| `perf_mobile` | affichage mobile correct ou débordements constatés. |
| `freshness_ssl` | HTTPS ou non, année du copyright, signaux d'obsolescence relevés. |
| `tech_stack` | CMS ou constructeur. |
| `ads_pixel_spy` | pixels trouvés et identifiants lus dans la page, en distinguant « déclenché à la visite » et « présent dans la page ». |
| `social_links` | réseaux trouvés. |
| `contact_form` | formulaire trouvé (pas ses champs). |
| Preuve | **l'angle** de l'offre et le lien principal (voir ci-dessous). |
| `site_demo` | lien de la démo complémentaire, uniquement si elle a été produite ; sinon la consigne interdit de proposer un nouveau site. |

### L'angle vient du nœud de preuve

L'angle (ce qu'on vend et ce que le texte doit amener) est apporté par la **preuve** du besoin, dans le code :

- démo de site : présenter la maquette préparée face au site actuel ;
- bilan de visibilité : présenter le bilan et **un** constat ; la consigne de l'angle varie selon le rang mesuré
  (premier : consolider l'avance face au suivant ; hors des premiers : les concurrents qui passent devant ; rang non
  mesuré : ne pas parler de position) ;
- bilan d'acquisition : présenter le bilan et un constat sur le suivi, les pixels ou la page d'arrivée.

L'argument commercial libre de la définition (`commercial.pitchFocus`) et le ton (`commercial.tone`) restent
transmis tels quels, comme aujourd'hui.

### Assemblage

`buildPitchPrompt(d: Dossier, generator: PitchGeneratorId): string`, une seule fonction, produit :

1. le rôle (closer au téléphone ou message écrit, selon le générateur et le canal principal) ;
2. l'offre : libellé, angle de la preuve, argument et ton de la définition ;
3. les **constats mesurés**, une ligne par `PitchFact`, dans l'ordre du workflow, sous le titre « Constats mesurés
   (les seuls que tu peux citer) » ;
4. les règles communes : n'utiliser que ces constats ; aucun chiffre absent (appels, chiffre d'affaires, trafic) ;
   vouvoiement ; ligne STOP pour un message écrit ; limites de longueur actuelles ;
5. le schéma JSON de `battlecardSchema`, avec des descriptions de champ neutres.

En mode complet, le générateur envoie cette chaîne au modèle. En mode préparation, `prepScan.ts` l'écrit dans
`prompt_battlecard.md`, précédée du chemin où enregistrer le fichier. `syncQueue.ts` garde la lecture des anciens
champs (`openingPitch`, `executiveSummary`) pour les dossiers déjà en file.

### Ce qui disparaît

`battlecardSalesAngle`, `buildWrittenPitchPrompt` et les consignes en dur de `generateBattlecard` et
`generateColdEmailPitch`, ainsi que `bilanPromptFacts` et `bilanBattlecardRules`, dont le contenu passe dans les
contributions des nœuds de preuve et de démo complémentaire. Les secours sans IA (en cas d'échec du modèle) restent
et ne citent aucune mesure.

### Précisions (relecture de la conception)

- **Un appel par générateur, comme aujourd'hui.** Le nœud de message du canal principal (`pitchGeneratorFor`) choisit
  le générateur ; `buildPitchPrompt` adapte le rôle et les champs demandés : `llm_phone_battlecard` demande
  `closerBrief`, `ourAdvantages`, `callScript`, `objections`, `whatsappText`, `coldEmail` ; `llm_cold_email` demande
  `closerBrief`, `ourAdvantages`, `coldEmail`. Même schéma `battlecardSchema` pour les deux.
- **Les contributions lisent ce que le `Dossier` contient déjà** (`inspection`, `lead`, `sirene`, `competitorPixels`,
  `siteDemoHtml`) ; on n'étend aucun nœud, sauf la détection Google Ads ci-dessous. Champs utilisés notamment :
  `obsolescenceSignals`, `paidAdsDetected`, `htmlTagIds`, `trackersFound`, `seo`, `recentReviews`, `mapsRank`,
  `competitors`.
- **Le mode préparation a déjà un `Dossier` complet avec sa trace** : `prepScan.ts` appelle `runLeadWorkflow` en mode
  `prep`. Les dossiers déjà en file gardent leur `prompt_battlecard.md` écrit ; rien n'est réécrit.
- **Preuve et démo complémentaire** : en mode préparation, leurs nœuds sont « sautés » (écrits par la file), mais la
  preuve est toujours celle du besoin. Leur contribution ne dépend donc pas de la trace : la preuve contribue toujours
  (angle et lien) ; `site_demo` contribue selon la décision `needsSiteDemo`, comme aujourd'hui dans `prepScan.ts`.
  La règle « seulement si `done` » vaut pour les autres nœuds.
- **Ordre des constats** : celui du catalogue `WORKFLOW_NODES`, stable quelles que soient les vagues.
- **Rang** : `lead.mapsRank`. Rang 1 : consolider l'avance (écart d'avis avec le suivant si les deux sont lus) ;
  rang 2 ou plus : les concurrents qui passent devant ; absent : ne pas parler de position.
- **Valeurs par défaut** : `rating || 5` et `reviewsCount || 0` disparaissent avec les consignes qui les contiennent.
  Les autres usages (démo, CRM, secours sans IA) ne sont pas touchés. Le test vérifie l'absence de « 5★ », « 0 avis »
  et « n/a » pour un lead sans note, et la présence de la vraie note pour un lead noté 5.
- **`commercial.pitchFocus` en base** dit ce qu'on vend (« Positionnement en tête de Google Maps ») ; l'angle de la
  preuve dit comment le présenter. Pas de contradiction, aucune migration de définition.

## Corrections de détection

- **Conversions Google Ads** : `AW-` n'est pas le seul format. Reconnaître aussi les balises de conversion chargées
  par `googleadservices.com` / `googleads.g.doubleclick.net` et l'appel `gtag('config', 'AW-…')` dans un script.
  Une conversion non reconnue ne doit plus être notée « absente » mais « non détectée ».
- **Libellé du consentement** : un identifiant lu dans la page sans requête observée s'écrit « présent dans la page
  (déclenché par le bandeau cookies, non vérifié) », pas « déclenché après consentement ».

## Contraintes

- Français partout, y compris les constats.
- Tests : pour chaque contribution, un dossier où le nœud a tourné et un où il a été sauté ; pour l'assembleur, la
  même chaîne en mode préparation et en mode complet ; un test qui échoue si la consigne contient « 5★ », « 0 avis »
  ou « n/a » pour un lead sans note.
- Les deux offres concernées restent en brouillon jusqu'à relecture d'une consigne réelle par l'utilisateur.
- Avant de livrer : un scan de préparation réel par besoin concerné (démo de site, visibilité, acquisition), avec la
  consigne produite relue.

## Laissé au réalisateur

- Le découpage exact des fichiers de contributions et la rédaction des phrases de chaque constat.
- Le nombre d'avis cités (un ou deux) et la longueur maximale d'un extrait.
- La façon de reconnaître les balises de conversion Google Ads, dans la limite décrite.
