---
name: leadengine
description: Traite la file de génération LeadEngine (lead-engine-cli/queue/pending) — écrit les demo.html et battlecard.json manquants puis synchronise vers le CRM. À utiliser quand l'utilisateur demande de générer les démos / battlecards en attente, de regarder la pile de démos à calculer, ou via /loop pour un passage régulier.
argument-hint: "[local]  (par défaut : synchronisation vers la prod)"
---

# LeadEngine — traitement de la file de génération

La préparation (`npm run prep`, Playwright, 0 LLM) dépose un dossier par prospect dans
`lead-engine-cli/queue/pending/<id>/`. Ton rôle : produire les fichiers créatifs manquants, puis synchroniser.
Toutes les commandes se lancent depuis `lead-engine-cli/`.

## 1. Inventaire

Liste les sous-dossiers de `lead-engine-cli/queue/pending/` (le dossier fait foi ; `pending_manifest.json` n'est
qu'un index). Pour chacun, détermine ce qui manque :

| Fichier | Rôle |
|---|---|
| `meta.json` | Données prospect (lecture seule). Champ `opportunity_type` = type d'offre. |
| `prompt_demo.md` | Consigne pour `demo.html` |
| `prompt_battlecard.md` | Consigne pour `battlecard.json` |
| `audit_facts.json` | (audit QA) Constats réseau **mesurés** — à reprendre tels quels, ne rien inventer |
| `screenshot.png` | Capture du site actuel, à regarder avant d'écrire la démo |

File vide → réponds en une ligne (« file vide ») et arrête-toi : pas de sync, pas de résumé long.

## 2. Génération (un lead à la fois)

- **`demo.html` manquant** : lis `prompt_demo.md` et applique strictement
  `.agents/skills/artisan-frontend-craft/SKILL.md` (lis-le une fois par session). HTML brut complet commençant par
  `<!DOCTYPE html>`, pas de markdown. Ne recopie jamais la démo d'un autre lead.
- **`battlecard.json` manquant** : lis `prompt_battlecard.md` et écris un JSON valide respectant son schéma.
  - Lead `audit_qa_trackers` : `demo.html` (rapport) existe déjà. Le JSON **doit** contenir `coldEmail.subject` et
    `coldEmail.body`, sinon `sync-queue` le laisse en attente. Cite uniquement les traceurs de `audit_facts.json`, mets
    le lien du rapport donné dans le prompt, aucune proposition d'appel ni de visio.
  - Ne présente jamais une faiblesse comme mesurée si elle ne vient pas de `meta.json`, `audit_facts.json` ou de la
    capture.
- Ne modifie ni `meta.json` ni `audit_facts.json`, et ne touche pas à `queue/completed/`.

## 3. Synchronisation

Si au moins un lead a été complété :

```bash
npm run sync-queue:prod   # argument "local" → npm run sync-queue
```

Les leads complets partent dans le CRM et sont déplacés dans `queue/completed/` ; le manifeste est purgé
automatiquement. Un lead qui reste « en attente » dans le rapport signale un fichier incomplet : corrige-le au passage
suivant plutôt que de forcer.

## 4. Compte rendu

Trois lignes maximum : leads générés, synchronisés, restés en attente (avec la raison).

## Passage régulier

Session ouverte : `/loop 30m /leadengine`. Chaque passage est idempotent (seuls les fichiers manquants sont écrits).
