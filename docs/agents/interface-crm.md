# Interface du CRM

À lire avant tout travail dans `lead-dashboard-web/src/views/`. La description visuelle complète (surfaces, couleurs
des statuts et des besoins) est dans `DESIGN_SYSTEM.md`.

## Règles (OBLIGATOIRE)

- **Tailwind v3 par CDN uniquement** : pas de classe propre à v4 (`shadow-xs`, `shadow-2xs`), pas de valeur
  fractionnaire non prévue (`py-0.2`) ; elles ne produisent aucun style, sans erreur.
- **Composants partagés dans `src/views/components.ts`** (statuts, badges de besoin, emplacement de démo) : les
  réutiliser plutôt que recopier des classes, pour que le rendu serveur et les mises à jour client restent identiques.
- **Navigation latérale** : `sideNavShell` (`src/views/sideNav.ts`), commune au pipeline et à l'administration.
  Une nouvelle section s'ajoute dans les groupes de `src/views/admin.ts` ou `src/views/closer.ts`.
- **Fragment rafraîchi sans rechargement** : une fonction serveur unique, appelée au rendu de la page et renvoyée
  par l'API ; le script client remplace le nœud (modèle : `src/views/liveScanCard.ts`). Pas de `location.reload()`
  pour rafraîchir des données.
- **Réglages par clics plutôt que par saisie** : boutons, puces, interrupteurs, curseurs, listes prédéfinies ; le texte
  libre en dernier recours et facultatif. Un nœud de workflow déclare ses prérequis pour que l'ordre se déduise.
  (Demande de Loïc Alcantara, 12/11/2026.)
- **Échapper toute donnée** insérée dans le HTML : `esc()` côté serveur, `escHtml()` dans les scripts client.

## Vérifier

Lancer le CRM local (`lead-dashboard-web/AGENTS.md`), ouvrir la page en largeur bureau (1400 px) et mobile
(390 px) : pas de débordement horizontal, pas d'erreur dans la console, état vide et état rempli vus tous les deux.
