# Guide de Déploiement Continu (CI/CD) sur Cloudflare Pages & GitHub

Ce guide documente la mise en place du dépôt Git, du pipeline GitHub Actions et du déploiement automatisé sur Cloudflare Pages pour **LeadEngine Dashboard**.

---

## 1. Structure du Pipeline CI/CD

Le workflow GitHub Actions est configuré dans `.github/workflows/ci-cd.yml` :

### Étapes automatiques :
1. **Validation TypeScript :** Vérifie `lead-engine-cli` et `lead-dashboard-web`.
2. **Exécution des 69 tests automatisés :** Cycle de vie, verrous d'appels, iCalendar, RGPD traceurs, templates d'emails, rendu des composants.
3. **Déploiement Cloudflare Pages :** Déploie automatiquement `lead-dashboard-web` sur Cloudflare si tous les tests sont au vert.

---

## 2. Lier votre Dépôt GitHub

Le dépôt Git local est initialisé sur la branche `main` avec le commit initial propre (tous les secrets et bases de données locales sont strictement exclus par le `.gitignore`).

Pour lier votre dépôt distant GitHub :

```bash
# 1. Créez un nouveau dépôt vide sur https://github.com/new (ex: detect_opportunity)
# 2. Associez le remote distant (SSH ou HTTPS) :
git remote add origin git@github.com:<votre-compte>/detect_opportunity.git

# 3. Poussez votre code :
git push -u origin main
```

---

## 3. Configuration des Secrets GitHub Actions

Dans votre dépôt GitHub, rendez-vous dans :
👉 **Settings > Secrets and variables > Actions > New repository secret**

Ajoutez les 2 secrets suivants :

| Secret | Description | Où le trouver |
| :--- | :--- | :--- |
| `CLOUDFLARE_API_TOKEN` | Token d'API avec permissions *Cloudflare Pages (Edit)* | Cloudflare Dashboard > *My Profile* > *API Tokens* > *Create Token (Edit Cloudflare Pages)* |
| `CLOUDFLARE_ACCOUNT_ID` | Identifiant de votre compte Cloudflare | Sur la page d'accueil Cloudflare (colonne de droite) |

---

## 4. Configuration de la Base D1 en Production sur Cloudflare

1. **Création de la base D1 de production :**
   ```bash
   npx wrangler d1 create lead-dashboard-db
   ```
   *Wrangler vous affichera le `database_id` généré.*

2. **Liaison du binding D1 sur Cloudflare Pages :**
   - Sur [dash.cloudflare.com](https://dash.cloudflare.com), ouvrez votre projet Pages **`lead-dashboard`**.
   - Allez dans **Settings > Functions > D1 database bindings**.
   - Cliquez sur **Add binding** :
     - Variable name : `DB`
     - D1 database : `lead-dashboard-db`

3. **Variables d'environnement de production (Settings > Environment variables) :**
   - `SYNC_SECRET_TOKEN` : Votre jeton secret partagé avec votre worker Mac.
   - `SESSION_SECRET` : Une clé aléatoire pour signer les sessions.
   - `WHITELIST_EMAILS` : `loic.alcantara@gmail.com`

---

## 5. Fonctionnement au quotidien

- **Chaque `git push origin main` :** Lance les tests et met à jour votre dashboard en production en moins de 60 secondes.
- **Le Worker local (Mac) :** Reste sur votre machine pour scraper et générer les démos sans coût, et synchronise directement vers l'URL Cloudflare en production grâce au token `SYNC_SECRET_TOKEN`.
