---
name: leadengine
description: Traite la file de génération LeadEngine (lead-engine-cli/queue/pending) — écrit les demo.html et battlecard.json manquants puis synchronise vers le CRM. À utiliser quand l'utilisateur demande de générer les démos / battlecards en attente, de regarder la pile de démos à calculer, ou via /loop pour un passage régulier.
argument-hint: "[local]  (par défaut : synchronisation vers la prod)"
---

# LeadEngine — traitement de la file de génération

Suis la procédure de `docs/agents/file-de-generation.md` (lis-la en entier), avec :

- **Valeur de `LEADENGINE_AGENT`** : `claude-code`.
- **Argument `local`** : synchronise vers le CRM local (`LEADENGINE_AGENT=claude-code npm run sync-queue -- --local`) au lieu de la production.

## Passage régulier

Session ouverte : `/loop 30m /leadengine`. Chaque passage est idempotent (seuls les fichiers manquants sont écrits).
