# Plan de refonte — gestion des leads par opportunité

> 10 novembre 2026, commit `3762cd2`. Fusion de `audit_agy.md` (Antigravity) et `docs/audit_claude.md` (Claude), après
> relecture croisée et vérification dans le code. Complète le point 4.1 de [`AUDIT_2026-11.md`](./AUDIT_2026-11.md).
>
> **Objectif** : selon l'opportunité, un lead n'a pas les mêmes prérequis (téléphone, email, formulaire de contact,
> présence d'un site), et ajouter une opportunité doit tenir en une déclaration validée par un test.

## 1. État des lieux

### 1.1 La collecte élimine des prospects valables

- `lead-engine-cli/src/collector/mapsScraper.ts:87` : toute fiche Maps **sans téléphone** est écartée, quelle que
  soit l'opportunité. Pour une offre traitée par écrit (audit QA, agences, e-commerce), des prospects avec un site actif
  sont perdus avant même l'inspection.
- `website_filter` (`all` / `no_website` / `has_website`) est un paramètre manuel du scan, sans lien avec
  l'opportunité. Rien n'empêche par exemple de lancer un audit QA sur des prospects sans site.

### 1.2 Les formulaires de contact ne sont pas détectés

- `inspector/modules/contactsLegalModule.ts` **visite** déjà les pages dont le lien contient `contact` (ligne 60),
  mais n'en extrait que des emails et des noms de dirigeants.
- Ni l'URL de la page contact, ni la présence d'un `<form>`, ni la présence d'un captcha ne sont enregistrées. Un
  prospect qui masque son email mais a un formulaire passe pour « sans contact écrit ».

### 1.3 Le modèle du lead est pensé pour le téléphone

- `leads` n'a que `phone` et `email`. Il n'y a ni URL de formulaire, ni canal principal, ni source ou fiabilité des
  contacts.
- Un lead est synchronisé en `demo_ready` même s'il n'a aucun moyen de contact compatible avec l'opportunité.
- Les statuts (`called`, `callback_scheduled`) et le verrou d'appel de 15 min sont prévus pour le téléphone. Pour
  l'email ou le formulaire, il n'existe ni « envoyé », ni « soumis », ni « répondu », ni relance.
- L'historique tient dans un seul champ texte, `call_notes`.

### 1.4 Une opportunité est définie à plusieurs endroits qui se contredisent

| Endroit | Ce qu'il définit |
|---|---|
| `lead-dashboard-web/src/types.ts` (`OPPORTUNITY_TYPES`) | Libellés, badges, `channel`, `proofType`, `pitchType`. Seul `channel` est lu (écran du closer). |
| `lead-engine-cli/src/inspector/modules/types.ts` (`OPPORTUNITY_SCAN_RECIPES`) | Vérifications faites sur le site |
| `scanRunner.ts`, `prepScan.ts` (×3), `copywriter/battlecard.ts`, `syncQueue.ts`, `mcp/server.ts`, `routes/public.ts` | Branches `if (opportunityType === "audit_qa_trackers")` en dur |
| `prepScan.ts:137` | Libellés et consignes des prompts |
| `views/components.ts`, `views/admin.ts` (×2) | Badges recopiés |
| `schema.sql`, `routes/admin.ts:50` | Opportunités autorisées par défaut pour un closer |
| `views/closer.ts:1201` | Canal deviné : `isAsyncMode = channel === 'async_email' \|\| hasColdEmail` |

Conséquences observées :

- Toute opportunité autre que le QA est traitée comme `website` (démo de site + script d'appel). `custom` est déclaré
  en email côté dashboard mais traité en téléphone côté CLI. `google_reviews` est déclaré sans preuve, mais produit une
  démo de site.
- `schema.sql` exclut `audit_qa_trackers` des opportunités par défaut d'un closer ; `routes/admin.ts` l'inclut.
- Le flyer QR d'avis Google est généré pour toutes les opportunités sauf le QA. Ce n'est pas une preuve propre à
  `google_reviews`.

## 2. Prérequis par opportunité

Prérequis des opportunités **existantes**, validés le 10 novembre 2026. La colonne « écart » indique ce qui change
par rapport au code actuel.

| Opportunité | Site | Contact exigé | Canaux, par ordre de préférence | Preuve | Écart avec le code actuel |
|---|---|---|---|---|---|
| `website` (création / refonte) | `optional` | téléphone | téléphone, email | démo de site (LLM ou agent) | aucun |
| `audit_qa_trackers` | `required` | email **ou** formulaire | email, formulaire | rapport traceurs (déterministe) | le téléphone n'est plus exigé ; formulaire ajouté |
| `google_reviews` | `optional` | téléphone | téléphone | démo axée sur les avis (prep et full_auto) | `full_auto` génère aujourd'hui une démo de site générique |
| `seo_local` | `optional` | téléphone **ou** email | téléphone, email | démo de site (score SEO : voir §7) | l'email devient accepté ; `audit_score` retiré du dashboard |
| `ads_acquisition` | `required` | téléphone **ou** email | téléphone, email | démo de site (score Ads : voir §7) | idem |
| `custom` | `optional` | au moins un canal | email, formulaire, téléphone | démo de site + message | le CLI le traite aujourd'hui en téléphone |

**Flyer** : il n'est plus envoyé. `flyer: false` pour toutes les opportunités à partir de la phase 1 (la phase 0 ne
change aucun comportement). Le générateur `flyerGenerator.ts` est conservé et réactivable par opportunité.

Opportunités **proposées** (n'existent pas encore) : `website_redesign` (refonte, site `required`, téléphone exigé,
démo comparative), `speed_performance` (Core Web Vitals, site `required`, email ou formulaire, rapport d'audit) et
`online_booking` (prise de RDV en ligne, site `required`, téléphone ou email, nouvelle vérification
`booking_widget`). Elles serviront de premiers cas pour valider le protocole du §4.

## 3. Architecture cible

### 3.1 Une définition par opportunité, partagée par le CLI et le web

Un dossier `shared/opportunities/` à la racine, avec un fichier par opportunité et un `index.ts` qui les enregistre :

```ts
// shared/opportunities/auditQaTrackers.ts
export const auditQaTrackers = defineOpportunity({
  id: "audit_qa_trackers",
  status: "active",                       // "draft" : visible en admin seulement, non proposé au scan
  label: "Audit QA Régression & Traceurs RGPD",
  badge: { text: "🛡️ Audit QA", tone: "cyan" },
  icon: "shield",

  sourcing: { sources: ["maps", "domains"] },
  requirements: {
    website: "required",                  // required | forbidden | optional → donne le website_filter par défaut
    contacts: EMAIL_OR_FORM,              // = { anyOf: ["email", "contact_form"] }
  },
  channels: ["email", "contact_form"],    // le premier canal disponible devient le canal principal du lead

  scanModules: ["trackers_cmp", "ads_pixel_spy", "tech_stack", "contacts_legal", "contact_form"],
  proof: { type: "tracker_report", generator: "deterministic" }, // generator : llm | deterministic | agent
  flyer: false,
  pitch: { email: "cold_email", contact_form: "form_message" },  // un message par canal

  commercial: {
    businessModel: "recurring",
    pitchFocus: "Détection fuites CMP / tags marketing avant consentement & filet CI/CD",
  },
});
```

Choix retenus :

- **Contacts exigés en `allOf` / `anyOf`**, avec des constantes nommées pour les cas courants (`PHONE_ONLY`,
  `EMAIL_OR_FORM`, `ANY_CONTACT`). On garde la lisibilité de l'énumération proposée par Antigravity
  (`phone_required`, `email_or_form`…), sans avoir à modifier le moteur de qualification à chaque nouvelle combinaison
  (par exemple « téléphone ou email, et un site »).
- **Site exigé** : `website: required | forbidden | optional`, proposé par Antigravity. Le `website_filter` du scan
  devient une valeur par défaut déduite de l'opportunité. L'admin peut seulement la restreindre : choisir
  `no_website` pour une opportunité `required` est refusé.
- **Canaux ordonnés au niveau de l'opportunité, canal principal calculé au niveau du lead.** Deux leads d'une même
  opportunité peuvent être joignables différemment (l'un par email, l'autre seulement par formulaire).
- **`status: draft`** pour préparer une opportunité sans l'exposer au scan.

Plus aucun `if (opp === "...")` : le CLI choisit le générateur de preuve et de message via `proof` / `pitch`, le
dashboard construit badges, filtres, sélecteur de scan, droits et actions du closer à partir de la même définition.

**Import depuis les deux packages** : il n'y a pas de workspaces npm à la racine. Deux options :

1. import relatif (`../../shared/opportunities`) depuis chaque package — le plus simple, à valider avec
   `wrangler pages dev` et `wrangler pages deploy`, qui embarquent le code avec esbuild ;
2. sinon, workspaces npm à la racine et un package `@leadengine/shared`.

On commence par l'option 1 ; on passe à la 2 seulement si le déploiement Pages la refuse. La définition ne doit
importer ni Playwright ni API Cloudflare, pour rester utilisable des deux côtés.

**Test du registre** (`shared/opportunities/registry.test.ts`), lancé par `npm test` :

- chaque vérification de `scanModules` existe ;
- chaque générateur de `proof` et de `pitch` est enregistré ;
- chaque canal de `channels` a un message dans `pitch` et peut être satisfait par `requirements.contacts` ;
- une opportunité `website: forbidden` n'utilise pas de vérification qui exige un site ;
- les identifiants sont uniques.

### 3.2 Nouvelle vérification `contact_form`

Nouveau module `inspector/modules/contactFormModule.ts`. Il réutilise la navigation de `contacts_legal` au lieu
d'ouvrir les pages une seconde fois.

1. **Pages candidates** : liens dont le texte ou l'URL contient `contact`, `nous-contacter`, `contactez-nous`,
   `devis`, `rendez-vous`, ainsi que la page d'accueil.
2. **Analyse du DOM** : un `<form>` est retenu s'il contient un `<textarea>` ou un champ `message`, et un champ email
   (`input[type=email]` ou `name*=mail`). Les formulaires de recherche et de newsletter sont écartés.
3. **Anti-bot** : reCAPTCHA v2/v3, hCaptcha, Cloudflare Turnstile, champ « pot de miel ».
4. **Résultat** dans `SiteInspection` : `contactForm?: { url: string; fields: string[]; captcha: string | null;
   hasConsentCheckbox: boolean }`.

La soumission reste **manuelle** : le closer ouvre le formulaire, colle le message préparé et marque l'action comme
faite. Pas d'envoi automatique (captchas, CGU des sites, risque de réputation).

### 3.3 Qualification en deux temps

Une fonction partagée `evaluateRequirements(lead, def)` renvoie `{ qualified: boolean; reasons: string[];
primaryChannel: ChannelId | null }`.

1. **Sur la fiche Maps** (gratuit) : seuls sont vérifiés les critères déjà connus, c'est-à-dire le téléphone et la
   présence d'un site. Une fiche est gardée si elle **peut encore** satisfaire les prérequis : sans téléphone mais avec
   un site, elle passe pour `EMAIL_OR_FORM` et est écartée pour `PHONE_ONLY`.
2. **Après l'inspection** : vérification complète, avec email et formulaire. Seuls les leads qualifiés à ce stade
   comptent dans `limit`.

Les rejets sont journalisés avec leur raison dans les logs du scan (`no_phone`, `no_website`, `no_written_contact`…).
Comme il faut inspecter plus de sites pour atteindre `limit`, la sélection initiale de fiches (aujourd'hui
`max(limit×3, 60)`) est élargie pour les opportunités qui exigent un contact écrit, et le nombre de sites inspectés
est plafonné pour borner la durée d'un scan.

Un lead rejeté **après** inspection est synchronisé en `unqualified` avec ses raisons (statut ajouté en phase 2) :
ses données restent réutilisables pour une autre opportunité, et un même scan ne le réinspecte pas. Avant la phase 2,
il n'est pas synchronisé et reste dans les logs du scan.

### 3.4 Modèle de données

**Phase 1** — ajouts sans reconstruction de table :

- table **`lead_contacts`** :

  ```sql
  CREATE TABLE IF NOT EXISTS lead_contacts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id     TEXT NOT NULL REFERENCES leads(id),
    kind        TEXT NOT NULL,     -- phone | email | contact_form | linkedin | whatsapp
    value       TEXT NOT NULL,     -- numéro, adresse, URL du formulaire…
    source      TEXT NOT NULL,     -- maps | site | sirene | inbound | manual
    confidence  REAL,              -- 0..1 (ex. email générique contact@ > email deviné)
    meta        TEXT,              -- JSON (captcha, champs du formulaire…)
    is_primary  INTEGER NOT NULL DEFAULT 0,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (lead_id, kind, value)
  );
  ```

- colonne **`leads.primary_channel`** (`ALTER TABLE … ADD COLUMN`), copie du canal principal pour filtrer le Kanban et
  attribuer sans jointure ;
- `leads.phone` / `leads.email` restent remplis pendant la transition ;
- `/api/sync` accepte `contacts[]` et `primary_channel`. Un ancien payload sans ces champs continue de fonctionner.

Antigravity proposait deux colonnes plates (`contact_form_url`, `contact_channels` en JSON) pour aller plus vite.
Une table ajoutée par `CREATE TABLE IF NOT EXISTS` coûte aussi peu qu'une colonne : la migration lourde est celle des
statuts (phase 2), pas celle-ci. On crée donc directement la table, ce qui évite une seconde migration.

**Phase 2** — reconstruction de la table `leads` (SQLite ne permet pas de modifier un `CHECK` ; même méthode que
`migrations/0001_leads_status_pending_generation.sql`) :

- statuts communs à tous les canaux :

  | Nouveau statut | Remplace | Sens |
  |---|---|---|
  | `pending_generation` | — | inchangé |
  | `unqualified` | — | prérequis non remplis (avec raisons) |
  | `to_contact` | `demo_ready` | prêt à être contacté |
  | `contacted` | `called` | premier contact fait, quel que soit le canal |
  | `engaged` | `hot_lead` | démo ouverte, intérêt exprimé ou réponse reçue |
  | `follow_up` | `callback_scheduled` | relance programmée |
  | `won` / `lost` | — | inchangés |

- table **`lead_activities`** : `lead_id`, `user_id`, `kind` (`call`, `email_sent`, `form_submitted`,
  `reply_received`, `note`, `status_change`), `channel`, `payload` (JSON), `created_at`. `call_notes` est recopié en
  activités `note` puis retiré de l'interface.

La migration doit mettre à jour **dans le même déploiement** tout le code qui compare des statuts : Kanban, trackers,
`/api/sync` (règle « un lead généré ne change jamais de statut »), expiration des démos, MCP, tests fonctionnels.

### 3.5 Écran du closer et attribution

- Badge de canal principal sur la carte Kanban : 📞 téléphone, ✉️ email, 📝 formulaire.
- **Panneau d'action** construit à partir de `primary_channel`, avec les autres canaux disponibles en second :
  - 📞 script + objections + verrou d'appel ;
  - ✉️ email prérempli + « marquer envoyé » ;
  - 📝 « ouvrir le formulaire » (message copié dans le presse-papier) + « marquer soumis ».
- Chaque action crée une activité et fait avancer le statut (`to_contact → contacted`).
- La règle `isAsyncMode = … || hasColdEmail` disparaît.
- **Attribution** : `users.allowed_channels` vient s'ajouter à `allowed_opportunities`. Un lead est attribué à un
  closer qui a à la fois l'opportunité et le canal principal. On peut ainsi séparer téléprospecteurs et profils email.
- Les opportunités autorisées par défaut sont lues dans le registre (fin de l'écart `schema.sql` / `admin.ts`).

## 4. Ajouter une opportunité

1. Créer `shared/opportunities/<id>.ts` en `status: "draft"` et l'enregistrer dans `index.ts`.
2. Réutiliser un générateur de preuve ou de message existant, ou en écrire un. Les prompts du mode agent vont dans
   `prompts/<id>/demo.md` et `prompts/<id>/battlecard.md` ; `prepScan` les lit au lieu de ses libellés en dur.
3. Ajouter une vérification de site si un nouveau signal est nécessaire (exemple : `booking_widget` pour
   `online_booking`).
4. `npm test` : le test du registre doit passer.
5. Lancer un scan de test (`--dry-run`) sur l'opportunité en `draft`, puis passer en `status: "active"`.

Le sélecteur de scan, les badges, les droits des closers et les actions du dashboard suivent sans autre modification,
**à condition que la phase 0 ait supprimé toutes les branches et listes en dur**.

Plus tard, on pourra modifier en base les libellés et les prompts d'une opportunité, mais pas sa structure : les
générateurs et les vérifications sont du code et doivent rester testés.

## 5. Feuille de route

```
Phase 0 ───────► Phase 1 ─────────────► Phase 2 ─────────────► Phase 3 ─────────► Phase 4
Registre         Formulaires,           Statuts communs,       Écran du closer    Envoi et
sans changement  qualification,         activités,             par canal,         relances
de comportement  lead_contacts          unqualified            allowed_channels   email
```

**Phase 0 — Registre partagé, sans changement de comportement** ✅ *fait le 10/11/2026 (branche
`refacto/opportunity-registry`)*
- Créer `shared/opportunities/` et valider l'import depuis le CLI et depuis Pages (dev et déploiement).
- Y décrire les 6 opportunités existantes **telles qu'elles fonctionnent aujourd'hui**. Les prérequis
  (`requirements`) ne sont pas encore déclarés : ils arrivent en phase 1 avec `evaluateRequirements`, le téléphone
  restant exigé par `mapsScraper.ts` d'ici là.
- Remplacer les branches `isQa` et les listes recopiées (badges, recettes, opportunités par défaut).
- Écrire le test du registre.
- Critère de fin : un `grep` sur `"audit_qa_trackers"` hors de `shared/` ne renvoie plus que des tests et des
  migrations ; tous les tests existants passent.
- Bilan : critère atteint, à une exception près : les modèles d'email (`templates/emailTemplates.ts`) citent encore
  l'identifiant, désormais typé (`OpportunityId`) et donc vérifié à la compilation. 126 tests unitaires passent ;
  les 3 tests fonctionnels en échec l'étaient déjà sur `main` (en-tête `Cache-Control` de `/demos/:id`, agenda,
  filtre `scope`). Trois écarts de comportement assumés :
  - le mode prep ne génère plus de flyer pour `audit_qa_trackers` (le full_auto n'en générait déjà pas) ;
  - les consignes Antigravity du mode prep reprennent le libellé du registre (ex. « Création / Refonte de Site Web »)
    au lieu de leurs propres libellés ;
  - `npm run scan -- --domains …` sans `--opportunity` prend désormais `audit_qa_trackers`, comme `prepScan` : la
    valeur par défaut `website` de l'option empêchait ce choix, contrairement à l'intention du code.

**Phase 1 — Formulaires et qualification** ✅ *fait le 10/11/2026*
- Module `contact_form`.
- `evaluateRequirements` et qualification en deux temps dans `mapsScraper.ts`, `scanRunner.ts` et `prepScan.ts`.
- Table `lead_contacts`, colonne `primary_channel`, `contacts[]` dans `/api/sync` et dans `meta.json` de la file.
- Activer les nouveaux prérequis du §2, opportunité par opportunité, en commençant par `audit_qa_trackers`.
- Version minimale côté closer : badge de canal et bouton « ouvrir le formulaire », pour exploiter les nouveaux leads
  sans attendre la phase 3.
- Bilan :
  - Registre : `requirements` (site + contacts `allOf`/`anyOf`), canal `contact_form`, un générateur de message par
    canal (`pitch`), `flyer: false` partout. Prérequis du §2 activés pour les 6 opportunités.
  - Qualification : `shared/opportunities/qualification.ts` (`evaluateRequirements`, `resolveWebsiteFilter`,
    `pitchGeneratorFor`). Vivier élargi à `min(2 × objectif, objectif + 20)` fiches quand l'email ou le formulaire
    décident ; le scan s'arrête dès que l'objectif de leads qualifiés est atteint. Les rejets sont journalisés.
  - CLI : vérification `contact_form` (`inspector/modules/contactFormModule.ts`), générateur `llm_cold_email`
    (`copywriter/coldEmail.ts`) pour les leads joignables par écrit, angle de la démo full_auto selon l'opportunité
    (`demoFocusInstruction`), consigne Antigravity de message écrit en mode prep.
  - Dashboard : table `lead_contacts` et colonne `leads.primary_channel` (créées à chaud par `ensureAuthSchema`,
    `migrations/0003_…` pour une base créée à la main), `contacts[]` dans `/api/sync`, badge de canal sur les cartes,
    bloc « Formulaire de contact » (ouverture + copie du message, « marquer comme soumis » →
    `POST /api/leads/:id/form-submitted`), mode email/téléphone du closer selon le canal du lead. `POST /api/admin/scans`
    refuse une opportunité inconnue ou un filtre de site contraire.
  - Correction au passage : l'écran du closer passait en mode email pour tout lead dont la battlecard contenait un
    brouillon d'email, c'est-à-dire presque tous les leads téléphone en full_auto, et masquait leur script d'appel.
    Les leads de la phase 1 suivent leur canal principal ; les anciens gardent l'ancienne règle.
  - Pas encore fait : statut `unqualified` (phase 2), les activités « envoyé / soumis » restent dans `call_notes`.

**Phase 2 — Statuts et historique**
- ✅ *Fait le 10/11/2026, avant le reste de la phase* : table `lead_activities` (`services/activities.ts`, créée à chaud
  par `ensureAuthSchema`, `migrations/0005`). Sont historisés avec leur contenu complet : email marqué envoyé (objet,
  corps, destinataire), message soumis via formulaire, issue d'appel (note, étape avant/après), changement d'étape,
  réponse reçue collée par le closer (bouton « Réponse reçue » de l'onglet Écrit). Fil chronologique dans l'onglet
  Suivi (`GET/POST /api/leads/:id/activities`). `call_notes` reste en parallèle comme « Notes libres ».
- Migration de reconstruction de `leads` et nouveaux statuts, y compris `unqualified`.
- Table `lead_activities` et reprise de `call_notes`.
- Mise à jour de tout le code qui compare des statuts, et des tests fonctionnels.

**Phase 3 — Écran du closer et attribution par canal**
- Panneau d'action par canal, activités créées à chaque action.
- `allowed_channels` et attribution automatique selon l'opportunité et le canal.

**Phase 4 — Envoi des emails avec Resend et listes de diffusion** (plus tard)

Jusqu'à cette phase, l'email part en copier-coller / `mailto:` et le closer clique sur « marquer envoyé ». Les
réponses arrivent dans sa boîte ; il marque « réponse reçue » à la main.

Ensuite :

- Envoi par Resend depuis un domaine d'envoi dédié (SPF, DKIM, DMARC), distinct du domaine principal pour protéger
  sa réputation.
- Suivi des envois, ouvertures, rebonds et réponses par webhooks Resend → `lead_activities`.
- Listes de diffusion et séquences de relance (J+3, J+7), quota d'envoi, vérification MX avant envoi.
- Cadre légal de la prospection B2B : lien de désinscription, objet en rapport avec le métier du prospect, liste
  d'exclusion des adresses qui ont refusé.

**Option écartée : envoi depuis la boîte Gmail du closer par Google OAuth.** Les closers utilisent des comptes Google
personnels, donc l'application OAuth est « Externe ». Le scope `gmail.send` y impose une validation Google
(politique de confidentialité, domaine vérifié, vidéo, plusieurs jours à quelques semaines d'examen) ; sans elle,
l'application reste en mode test, limitée à 100 utilisateurs, avec une reconnexion tous les 7 jours. Lire les
réponses demanderait un scope restreint et un audit de sécurité annuel. Enfin, prospecter depuis des comptes Gmail
personnels expose les closers à une suspension de leur compte.

## 6. Décisions

Prises le 10 novembre 2026 :

1. **Prérequis** : tableau du §2 validé. `google_reviews` produit une démo axée sur les avis ; `seo_local` et
   `ads_acquisition` gardent la démo de site pour l'instant (score à faire, §7) et acceptent l'email ; le flyer n'est
   plus envoyé.
2. **Envoi des emails** : copier-coller / `mailto:` d'abord ; Resend et listes de diffusion plus tard (phase 4).
   L'envoi par Gmail OAuth est écarté (comptes Google personnels, voir phase 4).
3. **Leads non qualifiés** : synchronisés en `unqualified`, avec la raison du rejet.
4. **Statuts** : migration vers les statuts communs du §3.4, en phase 2.

## 7. À faire plus tard

- [ ] Générateur de **score SEO local** pour `seo_local` (fiche Google Business, cohérence NAP, avis, position Maps
      sur la requête métier + ville), en remplacement de la démo de site.
- [ ] Générateur de **score Ads / acquisition** pour `ads_acquisition` (pixels détectés, landing pages, suivi des
      conversions, présence dans la bibliothèque publicitaire Meta).
- [ ] Envoi par Resend, listes de diffusion et séquences de relance (phase 4).
- [ ] Réactivation éventuelle du flyer pour une opportunité qui en aurait l'usage.

## Annexe — Relecture croisée des deux brouillons

Les deux audits posent le même diagnostic (§1) et proposent la même architecture : registre déclaratif partagé,
module `contact_form`, qualification en deux temps, formulaire semi-manuel.

**Repris d'Antigravity** : tableau des prérequis par opportunité, prérequis `website: required|forbidden|optional`,
détail de la détection de formulaire et des captchas, statut pour les leads sans contact exploitable
(`contact_incomplete`, renommé ici `unqualified`), `proof.generator`, version minimale du bouton « ouvrir le
formulaire » dès la phase 1.

**Repris de Claude** : contacts exigés en `allOf` / `anyOf`, canaux ordonnés et canal principal par lead, table
`lead_contacts`, `lead_activities`, statuts communs, `allowed_channels`, test du registre, registre en phase 0 avant
toute nouvelle fonctionnalité, vigilance sur l'import partagé dans Pages.

**Corrections apportées au brouillon d'Antigravity** :

- `website` n'est pas réservé aux artisans sans site : c'est « Création / Refonte », filtre `all` par défaut.
- `website_redesign` et `speed_performance` n'existent pas ; ils sont ici présentés comme proposés (§2).
- Le flyer QR n'est pas la preuve de `google_reviews` : il est généré pour presque toutes les opportunités.
- `contacts_legal` visite déjà les pages contact ; il manque l'enregistrement de leur URL et l'analyse du formulaire.
- « Dashboard sans modification de code » suppose d'abord la phase 0 de nettoyage, absente de son plan.

**Corrections apportées aux deux comparatifs** :

- Le comparatif d'Antigravity justifiait les colonnes plates par une « migration lourde » de `lead_contacts`. Or une
  nouvelle table ne demande aucune reconstruction ; seule la migration des statuts en demande une. D'où le choix de
  la table dès la phase 1 (§3.4).
- Ce comparatif ne relevait ni ses propres erreurs factuelles ni la question de l'ordre des phases. Celui de Claude
  ne tenait pas compte du besoin de rendre les nouveaux leads exploitables tout de suite : d'où l'ajout d'une version
  minimale de l'écran du closer en phase 1.
