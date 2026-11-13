# À faire

## Fait : suivi Cloudflare actif

Jeton `CF_API_TOKEN` posé le 2026-11-12, la section Cloudflare de l'onglet Quotas & Coûts IA affiche les chiffres.

## Ensuite

- [x] **Workflow des besoins, étape 2** : le worker exécute les nœuds du graphe par vagues parallèles
      (`lead-engine-cli/src/workflow/runner.ts`), SIRENE compris sans site ; trace dans `audit_data.workflow_trace`.
      Reste : redémarrer le worker de prod pour qu'il prenne le nouveau code.
- [x] **Scan de test réel** (dry-run, 1 lead) : Refonte (avec site) et Création (sans site) passent de bout en bout.
- [x] **Vérifier l'onglet Besoins en prod** (édition au clic, ajout et retrait de nœuds) : validé le 2026-11-13.
- [x] **Photos des prospects** : copiées dans le bucket R2 `lead-media` à la synchronisation (ou au premier affichage),
      servies par `/demos/:id/media/:n` ; la démo est réécrite à l'affichage, anciennes démos comprises.
- [x] **Envoi des emails** en port/adapter (`shared/outreach/email.ts`) : bouton « Envoyer » du closer, file
      `email_outbox`, limite par jour, mention STOP ajoutée si absente. Adapters : manuel (défaut), SMTP (worker),
      Resend, Brevo. Reste à **choisir le domaine d'envoi** puis l'activer (voir ci-dessous).

## Activer l'envoi d'emails (quand le domaine d'envoi est prêt)

Domaine secondaire conseillé (ex. `prenom-nom.fr` plutôt que le domaine principal), avec SPF, DKIM et DMARC.
Resend et Brevo interdisent la prospection à froid dans leurs conditions : pour un premier contact, préférer SMTP.

- Dashboard (secrets Pages, puis redéployer) : `EMAIL_PROVIDER` (`smtp` | `resend` | `brevo`),
  `EMAIL_FROM` (`Nom <adresse@domaine-envoi.fr>`), facultatifs `EMAIL_REPLY_TO`, `EMAIL_DAILY_LIMIT` (30 par défaut),
  et `RESEND_API_KEY` ou `BREVO_API_KEY` selon le fournisseur.
  ```bash
  npx wrangler pages secret put EMAIL_PROVIDER --project-name lead-dashboard
  ```
- Worker, pour SMTP (dans le `.env` de `lead-engine-cli`, puis redémarrer le worker) : `SMTP_HOST`, `SMTP_PORT`
  (587 ou 465), `SMTP_USER`, `SMTP_PASS`. L'adresse `SMTP_USER` doit pouvoir envoyer en tant que `EMAIL_FROM`.
- [ ] **Générateurs dédiés** pour Référencement local et Publicité (en brouillon tant que la démo n'est qu'un angle).
- [ ] **Vérification par captures** à ajouter au skill `leadengine`.
- [ ] Mettre à jour wrangler 3 → 4 (avertissement à chaque commande).
