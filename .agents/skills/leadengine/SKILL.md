---
name: leadengine
description: Traite la file de génération LeadEngine (lead-engine-cli/queue/pending) — écrit les demo.html et battlecard.json manquants puis synchronise vers le CRM. À utiliser pour générer les démos et battlecards en attente.
---

# LeadEngine — traitement de la file de génération

Suis la procédure de `docs/agents/file-de-generation.md` (lis-la en entier), avec :

- **Valeur de `LEADENGINE_AGENT`** : `antigravity`.
- **Préparer de nouveaux leads** si on te le demande, depuis la racine du dépôt :
  `npm run prep -- --query "plombier" --city "Bordeaux" --limit 5` (ajouter `--lat … --lng … --radius …` pour une
  zone précise).
