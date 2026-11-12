# À faire

## Ce soir : activer le suivi Cloudflare (onglet Quotas & Coûts IA)

Le code est en prod et `CF_ACCOUNT_ID` est posé. Il manque le jeton d'API.

1. Tableau de bord Cloudflare → **My Profile → API Tokens → Create Token → Custom token**.
   Droits, tous en **lecture** (Read) sur le compte :
   - Account Analytics
   - D1
   - Cloudflare Pages
   - Workers R2 Storage
   - Billing (facultatif : sert à détecter le forfait)
2. Dans `lead-dashboard-web` :
   ```bash
   npx wrangler pages secret put CF_API_TOKEN --project-name lead-dashboard
   ```
   puis coller le jeton.
3. Redéployer pour que le secret soit pris en compte (un push sur main suffit, ou « Retry deployment » dans
   Cloudflare Pages), puis ouvrir **Administration → Quotas & Coûts IA** : la section Cloudflare doit afficher
   les chiffres au lieu des instructions.

## Ensuite

- [x] **Workflow des besoins, étape 2** : le worker exécute les nœuds du graphe par vagues parallèles
      (`lead-engine-cli/src/workflow/runner.ts`), SIRENE compris sans site ; trace dans `audit_data.workflow_trace`.
      Reste : redémarrer le worker de prod pour qu'il prenne le nouveau code.
- [x] **Scan de test réel** (dry-run, 1 lead) : Refonte (avec site) et Création (sans site) passent de bout en bout.
- [ ] **Vérifier l'onglet Besoins en prod** (édition au clic, ajout et retrait de nœuds).
- [ ] **Photos des prospects** : les copier ou passer par un proxy au lieu de les lier directement à leur site.
- [ ] **Envoi des emails via Resend** (phase 4).
- [ ] **Générateurs dédiés** pour Référencement local et Publicité (en brouillon tant que la démo n'est qu'un angle).
- [ ] **Vérification par captures** à ajouter au skill `leadengine`.
- [ ] Mettre à jour wrangler 3 → 4 (avertissement à chaque commande).
