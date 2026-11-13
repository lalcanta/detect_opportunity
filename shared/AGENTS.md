# shared — code commun au moteur (Node) et au CRM (Cloudflare Workers)

Complète `AGENTS.md` à la racine, qui reste valable ici.

- **Aucune API propre à un environnement** hors des fichiers `*.test.ts` : ni `node:*`, ni liaisons Cloudflare ;
  les entrées-sorties s'injectent (exemple : `fetcher` dans `outreach/email.ts`). Ce code tourne des deux côtés.
- **Aucune dépendance npm** : `shared/` n'a pas de `node_modules`.
- **Tests** : `shared/<dossier>/*.test.ts`, lancés par `npm test` à la racine (et donc par la CI) ; un test placé plus
  profond n'est pas lancé.
- **Besoins** : lire `docs/agents/besoins.md` avant de toucher à `opportunities/`.
