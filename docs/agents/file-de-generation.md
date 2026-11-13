# File de génération : démos et battlecards en attente

À lire pour traiter `lead-engine-cli/queue/pending/` (leads préparés sans LLM par `npm run prep`, dont l'agent écrit
les fichiers créatifs avant de les synchroniser vers le CRM). Commandes lancées depuis `lead-engine-cli/`.

## 1. Inventaire

Liste les sous-dossiers de `queue/pending/` (le dossier fait foi ; `pending_manifest.json` n'est qu'un index).
Pour chacun, détermine ce qui manque :

| Fichier | Rôle |
|---|---|
| `meta.json` | Données prospect (lecture seule). `opportunity_type` = type d'offre ; `primary_channel` = canal du premier contact (`phone`, `email` ou `contact_form`) ; `contacts` = contacts trouvés ; `site_images` = vraies photos de son site, à utiliser en priorité dans la démo. |
| `prompt_demo.md` | Consigne pour `demo.html` |
| `prompt_site_demo.md` | (bilans visibilité / acquisition, si une démo de site est demandée) Consigne pour `site_demo.html` |
| `prompt_battlecard.md` | Consigne pour `battlecard.json` |
| `audit_facts.json` | (audit QA et bilans) Constats **mesurés** — à reprendre tels quels, ne rien inventer |
| `screenshot.png` | Capture du site actuel, à regarder avant d'écrire la démo |

Un dossier qui contient `api_generation.lock` est en cours de génération par API (bouton « Générer via l'API » du
dashboard, exécuté par le worker, qui écrit les mêmes fichiers manquants : `demo.html`, `site_demo.html` si
`prompt_site_demo.md` existe, `battlecard.json`) : ne le touche pas.

File vide → réponds en une ligne (« file vide ») et arrête-toi : pas de sync, pas de résumé long.

## 2. Génération (un lead à la fois)

- **`demo.html` manquant** : lis `prompt_demo.md` et applique strictement
  `.agents/skills/artisan-frontend-craft/SKILL.md` (lis-le une fois par session). HTML brut complet commençant par
  `<!DOCTYPE html>`, pas de markdown. Ne recopie jamais la démo d'un autre lead.
- **`site_demo.html` manquant** (seulement si `prompt_site_demo.md` existe) : mêmes règles que `demo.html` : lis
  `prompt_site_demo.md`, applique `.agents/skills/artisan-frontend-craft/SKILL.md`, HTML brut complet commençant par
  `<!DOCTYPE html>`. Tant qu'il manque, `sync-queue` laisse le lead en attente.
- **`battlecard.json` manquant** : lis `prompt_battlecard.md` et écris un JSON valide respectant son schéma.
  - Lead `audit_qa_trackers` : `demo.html` (rapport) existe déjà. Le JSON **doit** contenir `coldEmail.subject` et
    `coldEmail.body`, sinon `sync-queue` le laisse en attente. Cite uniquement les traceurs de `audit_facts.json`, mets
    le lien du rapport donné dans le prompt, aucune proposition d'appel ni de visio.
  - Lead de bilan (visibilité locale ou acquisition) : `demo.html` (le bilan) est déjà écrit, comme le rapport QA ;
    ne le réécris pas. Cite uniquement les faits de `audit_facts.json` (score, rang et recherche telle qu'elle a été
    lancée, concurrents, pixels, actions) : aucun chiffre inventé. Un pixel « non vérifié » n'est pas « aucun pixel ».
    Le lien `/demos/<id>` ouvre le bilan, pas une maquette de site : présente-le comme tel. Garde l'angle de l'offre
    (visibilité locale, ou acquisition : suivi, pixels, page d'arrivée) ; ne mentionne la refonte du site que comme
    complément éventuel, si `prompt_site_demo.md` existe.
  - Lead dont `primary_channel` vaut `email` ou `contact_form` (quelle que soit l'opportunité) : le JSON **doit**
    contenir `coldEmail.subject` et `coldEmail.body`, sinon `sync-queue` le laisse en attente. Pour `contact_form`,
    le corps est collé tel quel dans le formulaire : texte brut, 900 caractères maximum.
  - Ne présente jamais une faiblesse comme mesurée si elle ne vient pas de `meta.json`, `audit_facts.json` ou de la
    capture.
- Ne modifie ni `meta.json` ni `audit_facts.json`, et ne touche pas à `queue/completed/`.

## 3. Synchronisation

Si au moins un lead a été complété :

```bash
LEADENGINE_AGENT=<agent> npm run sync-queue:prod   # CRM local : LEADENGINE_AGENT=<agent> npm run sync-queue -- --local
```

`LEADENGINE_AGENT` trace dans le CRM quel agent a généré la démo et la battlecard (« Généré par ») ; sa valeur est
donnée par l'adaptateur de chaque outil. Les leads complets partent dans le CRM et sont déplacés dans
`queue/completed/` ; le manifeste est purgé automatiquement. Un lead qui reste « en attente » dans le rapport signale
un fichier incomplet : corrige-le au passage suivant plutôt que de forcer.

## 4. Compte rendu

Trois lignes maximum : leads générés, synchronisés, restés en attente (avec la raison).

## Variante : serveur MCP `leadengine`

Sans passer par les fichiers, un agent branché sur le serveur MCP du projet (`npm --prefix lead-engine-cli run mcp`)
enchaîne `leadengine_list_tasks`, `leadengine_get_task_context` (fiche et direction artistique du lead), puis
`leadengine_submit_assets`, qui publie directement dans la base de production. Les règles du §2 s'appliquent.
