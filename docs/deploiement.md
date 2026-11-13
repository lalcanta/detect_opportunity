# Déploiement et exploitation

Deux morceaux tournent en production : le **CRM** sur Cloudflare Pages, et le **worker** sur un Mac. Ils ne se
parlent que dans un sens : le worker interroge le CRM et lui pousse ses résultats (`SYNC_SECRET_TOKEN`).

## 1. Livrer une modification

1. Branche depuis `main`, PR vers `main`.
2. La CI GitHub Actions (`.github/workflows/ci-cd.yml`) lance typecheck et tests sur la PR. Elle ne déploie pas et
   n'utilise aucun secret.
3. **Attendre la CI verte avant de fusionner** : Cloudflare Pages construit la production à chaque fusion dans
   `main`, sans attendre GitHub Actions.
4. Construction Pages : pas de commande de build, sortie `lead-dashboard-web/public/`, fonctions dans
   `lead-dashboard-web/functions/`. En ligne en 1 à 2 minutes ; vérifier dans le tableau de bord Cloudflare
   (Workers & Pages → `lead-dashboard` → Deployments) que le commit fusionné est bien le déploiement de production.
5. Si la fusion touche `lead-engine-cli/` ou `shared/` : redémarrer le worker (§4).

Non vérifié depuis le dépôt : la construction d'aperçus pour les branches de PR (réglage Pages « Branch
deployments »).

**Retour arrière** : dans Deployments, « Rollback » sur le déploiement précédent, puis `git revert` du commit fautif
par une PR. Le schéma D1 n'est pas annulé par un retour arrière (voir `docs/agents/donnees-d1.md`).

## 2. Ressources Cloudflare

Déclarées dans `lead-dashboard-web/wrangler.toml`, lu par Pages :

| Liaison | Ressource | Rôle |
|---|---|---|
| `DB` | D1 `lead-dashboard-db` | toutes les données du CRM |
| `MEDIA` | R2 `lead-media` | copies des photos et logos des prospects |
| `AI` | Workers AI | génération légère côté CRM |

Le schéma se met à jour tout seul au premier accès après déploiement (`ensureAuthSchema`) ; les exceptions et la
sauvegarde préalable sont dans `docs/agents/donnees-d1.md`.

## 3. Secrets et variables du CRM

`lead-dashboard-web/src/types.ts` (`Env`) fait foi. Chaque secret se pose par son propriétaire, depuis
`lead-dashboard-web/` :

```bash
npx wrangler pages secret put <NOM> --project-name lead-dashboard
```

**Un secret n'est pris en compte qu'au déploiement suivant** : redéployer (nouvelle fusion, ou « Retry deployment »
sur le dernier déploiement de production).

| Usage | Variables |
|---|---|
| Indispensable | `SYNC_SECRET_TOKEN` (identique côté worker), `PUBLIC_APP_URL` |
| Génération côté CRM | `GEMINI_API_KEY` |
| Alertes « lead chaud » | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `DISCORD_WEBHOOK_URL` |
| Paiement | `STRIPE_SECRET_KEY`, `STRIPE_AMOUNT_CENTS`, `STRIPE_PRODUCT_NAME` |
| Connexion Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Suivi de consommation Cloudflare (onglet Quotas) | `CF_ACCOUNT_ID`, `CF_API_TOKEN` |
| Envoi d'emails | `EMAIL_PROVIDER`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `EMAIL_DAILY_LIMIT`, `RESEND_API_KEY`, `BREVO_API_KEY` (procédure : `A_FAIRE.md`) |
| Attribution automatique | `AUTO_ASSIGN` |

## 4. Worker (Mac)

- Configuration : `lead-engine-cli/.env` (modèle `.env.example`, schéma complet dans `lead-engine-cli/src/config.ts`) :
  clés LLM, `REMOTE_APP_URL_PROD`, le même `SYNC_SECRET_TOKEN` que le CRM ; `SMTP_*` pour l'envoi SMTP.
- Lancement en production, depuis la racine : `npm run worker:prod`. Il tourne tant que le Mac est allumé et
  connecté ; un scan lancé depuis le CRM reste « en attente » sinon.
- **Redémarrage après chaque fusion** qui touche `lead-engine-cli/` ou `shared/` : arrêter le processus
  (`Ctrl+C`), relancer `npm run worker:prod`.

## 5. Première installation

```bash
cd lead-dashboard-web
npx wrangler d1 create lead-dashboard-db          # reporter le database_id dans wrangler.toml
npx wrangler r2 bucket create lead-media
npx wrangler d1 execute lead-dashboard-db --remote --file=schema.sql
```

Créer le projet Pages `lead-dashboard` relié au dépôt GitHub (branche de production `main`, sans commande de build,
répertoire racine `lead-dashboard-web`, réglage non vérifiable depuis le dépôt), poser les secrets (§3), puis créer le premier administrateur (jeton et
invitation aléatoires) et ouvrir `/invite/<invite_code>` pour choisir son mot de passe :

```bash
npx wrangler d1 execute lead-dashboard-db --remote --command "INSERT INTO users (id, name, email, role, phone_quota_weekly, invite_code, access_token) VALUES ('u_admin', 'Admin', 'vous@domaine.fr', 'admin', 0, 'inv_' || lower(hex(randomblob(16))), 'tok_' || lower(hex(randomblob(24))))"
npx wrangler d1 execute lead-dashboard-db --remote --command "SELECT invite_code FROM users WHERE id = 'u_admin'"
```

**Ne jamais exécuter `seed.sql` en production** : ses jetons sont publics. Si c'est arrivé :
`npm run db:rotate-seed-credentials:remote`.
