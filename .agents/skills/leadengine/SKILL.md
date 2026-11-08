---
name: leadengine
description: Automatisation complète d'acquisition de leads, démos Tailwind et battlecards closers avec Antigravity CLI (0€ coût API externe).
---

# Skill : LeadEngine Antigravity CLI

Ce skill permet de piloter l'acquisition, la création de démos Tailwind haute conversion et la synchronisation CRM en **0€ de coût API externe**, en confiant les générations créatives et stratégiques directement à Antigravity.

## Workflow en 3 étapes :

### 1. Préparation locale (Playwright - 0 LLM)
Lance la cartographie Google Maps, l'inspection de site, l'extraction de logo, et la création du flyer PDF dans `queue/pending/<leadId>/` :
```bash
npm run prep -- --query "plombier" --city "Bordeaux" --limit 5
```
Ou avec coordonnées géographiques précises :
```bash
npm run prep -- --query "électricien" --city "Lyon" --limit 10 --lat 45.7640 --lng 4.8357 --radius 15
```

### 2. Génération Antigravity (0€ coût token API)
Quand l'utilisateur demande :
> "Génère les démos et battlecards des leads en attente"

Antigravity exécute :
1. Lit `lead-engine-cli/queue/pending_manifest.json` (ou scanne `lead-engine-cli/queue/pending/`).
2. Pour chaque lead `leadDir = lead-engine-cli/queue/pending/<id>` :
   - Lit `meta.json`, `prompt_demo.md`, et `prompt_battlecard.md`.
   - Inspecte `screenshot.png` si présent pour analyser les faiblesses du site actuel.
   - Écrit `leadDir/demo.html` :
     - Code HTML5 complet avec CDN Tailwind.
     - Sticky bottom call bar mobile (`tel:`, WhatsApp).
     - Couleurs de marque et logo client respectés.
     - Preuve sociale (vrais avis Google) et grille de services locale.
   - Écrit `leadDir/battlecard.json` :
     - Script d'appel closer mot-à-mot.
     - Objections et répliques.
     - Message WhatsApp de closing avec le lien démo.
     - Audit critique et arguments ROI.

### 3. Synchronisation Cloud CRM (1 commande)
Une fois les fichiers `demo.html` et `battlecard.json` écrits :
```bash
npm run sync-queue
```
Les leads sont poussés dans le Cloud CRM via `/api/sync` et déplacés dans `queue/completed/<leadId>/`.
Les closers retrouvent immédiatement les fiches dans le Kanban avec démo interactive, flyer PDF prêt à l'emploi et battlecard d'appel.
