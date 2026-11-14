# Corrections de l'audit et dette technique — plan de réalisation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Corriger les anomalies ouvertes de `docs/AUDIT_2026-11.md` retenues par l'utilisateur (sécurité OAuth, jobs bloqués, annulation, options du CLI, score inventé, planification, petites corrections) et l'outillage (wrangler 4, base locale en une commande, tests fonctionnels en CI, README).

**Architecture:** Corrections indépendantes, une tâche chacune, dans le monorepo existant (Hono/D1 côté `lead-dashboard-web`, Node/tsx côté `lead-engine-cli`).

**Tech Stack:** Node 22, TypeScript, tsx, `node:test`, Hono 4, Cloudflare Pages/D1, wrangler.

**Spec:** pas de document de conception séparé : chaque anomalie est décrite dans `docs/AUDIT_2026-11.md` (section citée par tâche) ; les décisions ci-dessous sont celles de l'utilisateur ou du contrôleur et font foi.

## Global Constraints

- Lire `AGENTS.md` (racine) et celui du sous-projet touché avant de coder ; schéma D1 : `docs/agents/donnees-d1.md` (trois endroits : `schema.sql`, `migrations/`, `ensureAuthSchema` + `AUTH_SCHEMA_VERSION` dans `src/auth.ts` ; `schemaSync.test.ts` vérifie).
- Français partout (code commenté, textes, commits `type(portée): description`). Commits terminés par :
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` puis `Claude-Session: https://claude.ai/code/session_01GTrYzuJ8DrjL5DZzRppp3N`.
- Ne jamais lire ni afficher `.env` / `.dev.vars` (liens symboliques dans le worktree). `trash`, jamais `rm -rf`. Aucune commande contre la production (`--remote`, `:prod`).
- Chaque comportement corrigé : un test qui échoue avant et passe après.
- Quand une anomalie de l'audit est corrigée, passer son titre à ✅ dans `docs/AUDIT_2026-11.md` avec une ligne « corrigé : … ».
- Vérification de chaque tâche : `npm run typecheck && npm test && npm --prefix lead-dashboard-web test` à la racine du worktree.

## Review Focus

- Callback OAuth appelé sans session, ou avec un `state` d'un autre utilisateur : refus, aucun jeton écrit.
- Job `running` dont le worker est mort depuis plus du délai : passe en échec avec un message clair, sans toucher un job vivant.
- Option inconnue ou mal orthographiée (`--opportunity_type`) : le CLI s'arrête avec un message qui liste les options valides, avant toute action.
- Planification : Mac réveillé tard le soir → pas de lancement rattrapé hors de la fenêtre ; « Lancer maintenant » n'annule pas le passage prévu.
- Lead sans mesure de score : aucun score inventé affiché au closer.

---

### Task 1: `state` OAuth de Google Agenda lié à la session (audit 5.3)

**Files:** `lead-dashboard-web/src/routes/authGoogle.ts`, tests dans `lead-dashboard-web/src/tests/`.

Décision : en mode calendrier, le callback n'utilise **jamais** l'identifiant lu dans le `state`. Il exige une session connectée (même mécanisme que `requireUser`) et rattache l'agenda à l'utilisateur de la session. Le `state` porte en plus un nonce aléatoire, posé dans un cookie HttpOnly, `SameSite=Lax`, de courte durée à l'aller, et comparé au retour (refus si absent ou différent, cookie effacé ensuite). Le mode connexion (login Google) garde son comportement, mais vérifie aussi le nonce.

- [ ] Tests (échouent avant) : callback calendrier sans session → refus, aucune écriture ; `state` dont le `userId` diffère de la session → l'agenda va à l'utilisateur de la session (ou refus), jamais à l'autre ; nonce absent ou différent → refus.
- [ ] Implémenter, lancer la vérification, passer 5.3 à ✅, commit `fix(oauth): state Google lié à la session et à un nonce`.

### Task 2: jobs bloqués en `running` et logs sans limite (audit 2.3)

**Files:** `lead-dashboard-web/schema.sql`, `lead-dashboard-web/migrations/0012_scan_jobs_heartbeat.sql`, `lead-dashboard-web/src/auth.ts` (`ensureAuthSchema`, `AUTH_SCHEMA_VERSION` +1), routes des scans (`src/routes/scans.ts` ou route de progression du worker), `lead-engine-cli/src/worker.ts`, tests.

Décisions :
- Colonne `scan_jobs.heartbeat_at DATETIME` (nullable), ajoutée aux trois endroits.
- Le worker met `heartbeat_at` à jour à chaque progression **et** au moins toutes les 60 s pendant un job (minuterie arrêtée à la fin du job).
- Côté CRM, à la lecture des jobs (liste des scans, carte en direct, et avant d'attribuer un job au worker), un job `running` dont `COALESCE(heartbeat_at, started_at)` a plus de **10 minutes** passe en `failed` avec le message « Interrompu : le worker ne répond plus (Mac en veille ou arrêté) ». Fonction pure testable (`isStaleJob(job, now)`) + une requête `UPDATE`.
- Logs : à chaque ajout, ne garder que les **300 dernières lignes** de `scan_jobs.logs`.

- [ ] Tests : `isStaleJob` (vivant, mort depuis 11 min, sans heartbeat mais `started_at` ancien) ; troncature des logs à 300 lignes ; `schemaSync.test.ts` reste vert.
- [ ] Implémenter, vérifier, passer 2.3 à ✅, commit `fix(scans): battement du worker et jobs interrompus marqués en échec`.

### Task 3: annulation pendant le scraping en mode préparation (audit 2.4)

**Files:** `lead-engine-cli/src/prepScan.ts` (~l.196, callback `onProgress` passé à `scrapeMaps`), éventuellement `scanRunner`, tests.

Décision : le callback de progression du scraping relaie la réponse de `hooks.onProgress` (qui renvoie `false` quand le job est annulé), comme le fait déjà `scanRunner` ; `scrapeMaps` s'arrête dès qu'il reçoit `false`. Si nécessaire, extraire une petite fonction pure pour la tester sans Playwright.

- [ ] Test : un `onProgress` qui renvoie `false` arrête le scraping (ou la fonction extraite propage `false`).
- [ ] Implémenter, vérifier, passer 2.4 à ✅, commit `fix(prep): l'annulation arrête aussi la lecture de Google Maps`.

### Task 4: options inconnues du CLI refusées

**Files:** `lead-engine-cli/src/prepScan.ts` (`parseArgs`), `lead-engine-cli/src/index.ts` (scan), et tout autre point d'entrée qui lit `process.argv` à la main (`worker.ts`, `syncQueue.ts`, `generateQueue.ts`… à recenser) ; un utilitaire partagé `lead-engine-cli/src/utils/cliArgs.ts` ; tests.

Décision : chaque point d'entrée déclare ses options connues (y compris `--prod`, `--remote`, `--local`, `--dry-run` lus par `config.ts`) ; une option commençant par `-` absente de la liste arrête le programme avant toute action, avec le message « Option inconnue : --x. Options valides : … » et, si une option valide est proche (même mot à `_`/`-` près, ou distance d'édition ≤ 2), « Vouliez-vous dire --y ? ». Les scripts npm de la racine (`--` final) ne changent pas.

- [ ] Tests de l'utilitaire : `--opportunity_type` → erreur qui suggère `--opportunity` ; option valide → acceptée ; valeur d'option commençant par un tiret non confondue avec une option si elle suit une option à valeur.
- [ ] Implémenter, vérifier que `npm run prep -- --help` ou l'appel sans option inconnue marche toujours, commit `fix(cli): une option inconnue arrête la commande avec une suggestion`.

### Task 5: plus de score inventé à la synchronisation de la file (audit 1.5)

**Files:** `lead-engine-cli/src/syncQueue.ts:~296` (`score: meta.loadTimeMs > 4000 ? 35 : 45`), consommateurs côté CRM (`lead-dashboard-web/src/views/closer.ts` et autres lecteurs de `audit.score`), tests.

Décision : le score n'est envoyé que s'il est mesuré — celui du bilan (`audit_facts.json`) ou celui d'un audit réel ; sinon il est absent (`null`), et l'interface du closer n'affiche alors aucun score (vérifier chaque lecteur de `score` : pas de « 0/100 », pas de « null »). Compléter la ligne 1.5 de l'audit (les faiblesses inventées ont été retirées par la PR #5 ; `meta.json` contient désormais `obsolescence_signals`) et la passer à ✅.

- [ ] Tests : dossier sans bilan → pas de score ; dossier bilan → score du bilan ; rendu du closer sans score → aucune mention de score.
- [ ] Implémenter, vérifier, commit `fix(file): aucun score inventé pour un dossier sans mesure`.

### Task 6: sémantique de la planification (audit 2.2)

**Files:** `lead-engine-cli/src/worker.ts:~490-540` (`shouldRun…`), `lead-dashboard-web/src/routes/scans.ts:~276` (« Lancer maintenant »), tests.

Décisions :
- L'heure est évaluée dans le fuseau **Europe/Paris** (via `Intl.DateTimeFormat`), plus celui du Mac.
- Un passage prévu à `time_of_day` n'est lancé que dans une fenêtre de **2 heures** après cette heure ; au-delà (Mac réveillé tard), il est sauté pour la journée, avec une ligne de log.
- « Lancer maintenant » n'écrit plus `last_run_at` : il crée le job sans toucher au passage planifié du jour. `last_run_at` n'est écrit que par un déclenchement planifié.
- Extraire la décision en fonction pure `isScheduleDue(schedule, now)` testée.

- [ ] Tests : 08:30 prévu, 09:00 Paris → dû ; 23:00 → non dû ; déjà lancé aujourd'hui → non dû ; jour non coché → non dû ; changement d'heure (fin octobre) correct ; « Lancer maintenant » ne modifie pas `last_run_at`.
- [ ] Implémenter, vérifier, passer 2.2 à ✅, commit `fix(planification): fuseau de Paris, fenêtre de 2 h, lancement manuel indépendant`.

### Task 7: petites corrections de textes

**Files:** `lead-dashboard-web/src/templates/emailTemplates.ts` (gabarit de l'audit RGPD : `trackers_list` vide ; objet de `perf_audit_first`), `lead-engine-cli/src/enrichment/…` ou là où vit `lookupCompanySirene` (format du dirigeant), tests.

Décisions :
- Gabarit QA : quand la liste des traceurs est vide, l'introduction « certains scripts s'exécutent immédiatement : » et la liste disparaissent (même mécanisme que `perf_audit_intro`).
- Objet de `perf_audit_first` : neutre, sans parler de chargement (« Quelques points relevés sur {{domain}} »).
- Dirigeant SIRENE : « Nataniel Dray (dray) » → « Nataniel Dray » : retirer le nom d'usage entre parenthèses quand il répète le nom de famille (sans casse ni accents) ; le garder s'il apporte un nom différent.

- [ ] Tests pour chacun des trois cas.
- [ ] Implémenter, vérifier, commit `fix(textes): liste de traceurs vide, objet de l'audit perf, nom du dirigeant`.

### Task 8: base locale en une commande

**Files:** `lead-dashboard-web/package.json`, script éventuel `lead-dashboard-web/scripts/…`, `lead-dashboard-web/AGENTS.md`, `docs/agents/donnees-d1.md`.

Décision : `npm run db:local:reset` (et relais à la racine avec `--` final) crée la base locale **à l'endroit où `npm run dev:web` la lit** (`/tmp/lead-d1-state`), applique `schema.sql` puis `seed.sql` (jetons publics, local uniquement). Piège connu : `wrangler d1 execute --persist-to` n'écrit pas au même endroit que `pages dev` ; vérifier réellement que, après la commande, `npm run dev:web` sert la page de connexion **et** qu'un login du seed fonctionne (ou que `/api/sync` n'échoue plus avec « no such table »). Si wrangler ne le permet pas, écrire directement dans le fichier SQLite de `pages dev` avec un script Node. Documenter la commande.

- [ ] Vérification réelle décrite ci-dessus, consignée dans le rapport (commande et sortie).
- [ ] Commit `chore(local): base D1 locale créée et remplie en une commande`.

### Task 9: wrangler 3 → 4

**Files:** `lead-dashboard-web/package.json`, `package-lock.json`, scripts qui appellent wrangler, `docs/deploiement.md`, `AGENTS.md` si une commande change.

Décision : passer à la dernière wrangler 4 publiée depuis au moins deux semaines ; adapter les options changées (`pages dev`, `d1 execute`, `pages deployment list`). Vérifier : `npm run dev:web` démarre et sert `/login` ; `npm run db:local:reset` (Task 8) marche toujours ; typecheck et tests verts. Aucune commande `--remote`.

- [ ] Vérification réelle consignée, commit `chore(deps): wrangler 4`.

### Task 10: tests fonctionnels en CI

**Files:** `.github/workflows/ci-cd.yml`, `tests/functional.test.ts` si besoin.

Décision : un job (ou une étape) de la CI lance `npm run test:functional` (serveur local sur le port 8789, base locale neuve). Il doit passer en local d'abord ; si des cas sont cassés par du code récent, les corriger s'ils signalent un vrai défaut, ou mettre à jour le test s'il est périmé, en le disant dans le rapport. Durée cible de l'étape : moins de 3 minutes.

- [ ] `npm run test:functional` vert en local (sortie dans le rapport), CI modifiée, commit `ci: tests fonctionnels dans la CI`.

### Task 11: README à jour

**Files:** `lead-engine-cli/README.md`, `lead-dashboard-web/README.md`, `docs/AUDIT_2026-11.md` §6.

Décision : README du moteur : worker, `prep` / `sync-queue`, multi-fournisseur, options réelles (celles de la Task 4) ; supprimer `--dry-run → ./output`, le « fallback Pro → Flash » et les deux clés Gemini s'ils ne sont plus vrais. README du CRM : remplacer le tableau partiel des routes par un renvoi aux fichiers `src/routes/*.ts` et la liste des familles de routes (ne pas maintenir 45 lignes à la main). Marquer les lignes correspondantes du §6 « corrigé ».

- [ ] Commit `docs: README du moteur et du CRM à jour`.
