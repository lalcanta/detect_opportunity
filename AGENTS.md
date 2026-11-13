# LeadEngine (detect_opportunity) — prospection B2B automatisée et CRM de closing

Détecte des prospects locaux (Google Maps ou liste de domaines), audite leur présence web, produit une preuve
personnalisée (démo de site, rapport RGPD) et la met entre les mains de closers dans un CRM.
Le CRM tourne sur Cloudflare Pages (production : `lead-dashboard`), le moteur de collecte sur un Mac (worker Node).

Applique ces règles sans qu'on te les rappelle, et corrige ce qui s'en écarte quand tu en croises.
Si `AGENTS.local.md` existe à la racine, lis-le aussi : il contient les préférences personnelles du poste.

## Pile

- **`lead-dashboard-web/`** : Hono 4 sur Cloudflare Pages Functions, D1 (SQLite), R2 (`lead-media`), Workers AI,
  wrangler 3. Interface rendue côté serveur en chaînes de caractères, Tailwind v3 par CDN, JavaScript client inline.
- **`lead-engine-cli/`** : Node 22, TypeScript lancé par `tsx` (pas de build), Playwright/Chromium, zod, nodemailer.
- **`shared/`** : TypeScript sans dépendance, importé par les deux (registre des besoins, envoi d'emails).
- **npm**, un `package-lock.json` par sous-projet. Pas de framework front, pas de bundler, pas d'ORM, pas de linter.

## Commandes

```bash
npm --prefix lead-engine-cli install && npm --prefix lead-dashboard-web install
npm run dev:web                       # CRM local sur http://localhost:8788 (D1 dans /tmp/lead-d1-state)
npm run worker                        # worker branché sur le CRM local ; worker:prod pour la production
npm run prep -- --query "plombier" --city "Lyon" --limit 5   # préparation sans LLM, dépose dans queue/pending
npm run sync-queue                    # pousse les dossiers complétés (sync-queue:prod pour la production)
npm run typecheck && npm test         # ce que lance la CI
npm --prefix lead-dashboard-web test  # dashboard : tsc + tests
./lead-engine-cli/node_modules/.bin/tsx --test shared/outreach/*.test.ts   # absents de `npm test` (voir Pièges)
npm run test:functional               # tests HTTP, démarrent leur serveur sur le port 8789, hors CI
```

## Sources de vérité

- **Définitions des besoins** (offres, prérequis, workflow) : la table D1 `opportunity_definitions`, éditée dans
  l'onglet Besoins. `shared/opportunities/definitions/*.ts` ne sert qu'à créer un besoin absent de la base
  (`seedIfEmpty`, `INSERT OR IGNORE`). Détail : `docs/agents/besoins.md`.
- **Schéma D1** : `lead-dashboard-web/schema.sql`, recopié dans `ensureAuthSchema` (`src/auth.ts`) qui migre la
  production au démarrage. Détail : `docs/agents/donnees-d1.md`.
- **Guide de design des démos** : `.agents/skills/artisan-frontend-craft/SKILL.md`, lu par le code
  (`lead-engine-cli/src/generateQueue.ts`) et par les agents. Archétypes par métier : `lead-engine-cli/src/generator/designDirections.ts`
  (`DESIGN_ARCHETYPES.md` n'en est que la description).
- **Composants d'interface partagés** : `lead-dashboard-web/src/views/components.ts` et `sideNav.ts`.

## Règles permanentes (OBLIGATOIRE)

- **Langue** : documentation, interface, commentaires et messages de commit en français.
- **Commits** : `type(portée): description` (`feat`, `fix`, `docs`, `refactor`, `test`, `chore`).
- **Toute modification passe par une branche et une PR vers `main`** : `main` part en production à chaque fusion.
- **Avant toute opération destructive sur la base de production**, exporter une sauvegarde
  (`docs/agents/donnees-d1.md`) ; vérifier que le fichier n'est pas vide avant de continuer.
- **Démos : n'invente rien.** Aucun avis, client, certification, prix ou délai absent des données du prospect.
  La règle complète est en tête du guide de design des démos (section 0).
- **Un fragment d'interface rafraîchi côté client est rendu par le serveur** (même fonction au chargement et dans
  l'API), pas reconstruit en JavaScript ; exemple : `src/views/liveScanCard.ts` et `GET /api/admin/scans?card=1`.
- **Quand le fonctionnement change**, mettre à jour la doc concernée dans la même PR (`docs/`, README, ce fichier).

## Interdits

- **Jamais de secret dans le dépôt** : clés, jetons, mots de passe vont dans `.env` / `.dev.vars` (gitignorés) ou en
  secret Cloudflare. Ne lis ni n'affiche jamais un `.env` : demande la variable dont tu as besoin.
- **Jamais de secret posé à la place de l'utilisateur** : il les saisit lui-même (`wrangler pages secret put`).
- **Jamais `seed.sql` en production** : ses jetons sont publics.
- **Jamais de `regen:demos:prod`** sans accord explicite : il réécrit les démos de tous les leads de production.
- **Jamais de démo de production ouverte hors d'une session connectée au CRM** : le pixel de suivi passerait le
  prospect en « lead chaud ».

## Pièges

- **Fusion dans `main` = production, même si la CI est rouge** : Cloudflare Pages construit sans attendre GitHub
  Actions. Attends la CI verte avant de fusionner.
- **Le worker de production tourne en continu sur le Mac** et garde l'ancien code : après une fusion qui touche
  `lead-engine-cli/` ou `shared/`, le redémarrer (`npm run worker:prod`).
- **`npm test` racine ne lance pas `shared/outreach/*.test.ts`**, donc la CI non plus : lance-les à part.
- **Guide de design des démos introuvable = démos sans consignes, sans erreur** : `generateQueue.ts` lit le fichier
  par chemin relatif et continue s'il manque. Ne le déplace pas sans modifier le code.
- **Modifier une définition de besoin dans le code ne change pas la production** : la base fait foi.
- **Bucket R2 absent en local** : `npm run dev:web` ne lie pas `MEDIA` ; ajouter `--r2=MEDIA` pour tester les photos
  (sans bucket, la route redirige vers l'image d'origine).

## Avant de livrer

```bash
npm run typecheck && npm test && npm --prefix lead-dashboard-web test
```

- [ ] Les tests du code touché passent, y compris `shared/outreach` s'il est concerné.
- [ ] Interface modifiée : vérifiée dans le CRM local, à l'écran, en largeur bureau et mobile, console sans erreur.
- [ ] Schéma modifié : les trois endroits de `docs/agents/donnees-d1.md` sont à jour.
- [ ] Moteur modifié : un scan de test passe (`npm run scan -- … --dry-run`).
- [ ] Doc à jour si le fonctionnement change.

Une vérification qui manque = travail non terminé.

## Branches et déploiement

- Branche depuis `main`, PR vers `main`. La CI (`.github/workflows/ci-cd.yml`) lance typecheck et tests sur chaque
  PR et push ; elle ne déploie pas.
- La fusion dans `main` déclenche la construction Cloudflare Pages (pas de commande de build, sortie `public/`).
  En ligne en 1 à 2 minutes. Procédure complète, secrets et retour arrière : `docs/deploiement.md`.

## Conventions

- Chemins relatifs au dépôt dans toute doc ; rien de propre à un poste dans un fichier versionné (va dans
  `AGENTS.local.md`, gitignoré).
- Ne jamais commiter `queue/`, `output/`, `.wrangler/`, les sauvegardes `.sql` de production.
- `queue/completed/` et les fichiers `meta.json` / `audit_facts.json` d'un lead ne se modifient pas à la main.

## À lire selon la tâche

- Travail dans le CRM (routes, vues, API) : `lead-dashboard-web/AGENTS.md`.
- Travail dans le moteur (scan, inspection, worker, génération) : `lead-engine-cli/AGENTS.md`.
- Travail dans `shared/` : `shared/AGENTS.md`.
- Avant de toucher au schéma ou aux données D1 : `docs/agents/donnees-d1.md`.
- Avant tout travail d'interface du CRM : `docs/agents/interface-crm.md`.
- Avant d'ajouter ou modifier un besoin (offre) : `docs/agents/besoins.md`.
- Pour traiter la file de génération (démos et battlecards en attente) : `docs/agents/file-de-generation.md`.
- Pour écrire une démo : `.agents/skills/artisan-frontend-craft/SKILL.md`.
- Déploiement, secrets, worker de production : `docs/deploiement.md`.
- Fonctionnement d'ensemble : `docs/ARCHITECTURE.md` ; anomalies connues : `docs/AUDIT_2026-11.md` ;
  décisions du 10/11/2026 : `docs/PLAN_REFONTE_LEADS.md` §6 ; tâches restantes : `A_FAIRE.md`.
