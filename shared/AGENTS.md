# shared — code commun au moteur (Node) et au CRM (Cloudflare Workers)

Complète `AGENTS.md` à la racine, qui reste valable ici.

- **Aucune API propre à un environnement** hors des fichiers `*.test.ts` : ni `node:*`, ni liaisons Cloudflare ;
  les entrées-sorties s'injectent (exemple : `fetcher` dans `outreach/email.ts`). Ce code tourne des deux côtés.
- **Aucune dépendance npm** : `shared/` n'a pas de `node_modules`.
- **Un nouveau dossier de tests doit être ajouté au script `test` de `package.json` à la racine**, sinon la CI ne le
  lance pas (c'est déjà le cas de `outreach/`).
- **Besoins** : lire `docs/agents/besoins.md` avant de toucher à `opportunities/`.
