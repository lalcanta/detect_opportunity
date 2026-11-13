# Données D1 : schéma, migrations, production

À lire avant de toucher au schéma, à une requête d'écriture en masse ou à la base de production.

## Modifier le schéma (OBLIGATOIRE : trois endroits dans la même PR)

La production n'exécute aucun fichier de migration automatiquement : c'est `ensureAuthSchema`
(`lead-dashboard-web/src/auth.ts`), appelé au premier accès de chaque isolat, qui ajoute colonnes et tables.

1. **`lead-dashboard-web/schema.sql`** : la forme complète, utilisée pour une base neuve et par les tests.
2. **`lead-dashboard-web/migrations/NNNN_description.sql`** (numéro suivant) : l'historique, et la commande à
   lancer à la main quand l'étape 3 ne suffit pas.
3. **`src/auth.ts`** :
   - nouvelle colonne : une ligne `ALTER TABLE … ADD COLUMN …` dans `alterCols` ;
   - nouvelle table : une constante `…_DDL` exportée par le service concerné (modèle :
     `EMAIL_OUTBOX_DDL` dans `src/services/emailOutbox.ts`), appelée dans `ensureAuthSchema` ;
   - puis **incrémenter `AUTH_SCHEMA_VERSION`**, sinon les isolats déjà démarrés ne rejouent rien.

Une DDL recopiée porte le commentaire « Doit rester identique à schema.sql » ; toute modification de `schema.sql`
s'accompagne de la même modification dans la copie.

**Piège** : chaque instruction de `ensureAuthSchema` ignore ses erreurs (`.catch(() => undefined)`). Une DDL fausse
échoue sans bruit : vérifie la table ou la colonne en local
(`npx wrangler d1 execute DB --local --persist-to=/tmp/lead-d1-state --command "PRAGMA table_info(<table>)"`).

**Ce que `ensureAuthSchema` ne sait pas faire** : changer une contrainte `CHECK`, renommer ou supprimer une colonne.
SQLite impose alors de reconstruire la table (modèle : `migrations/0004_leads_status_pending_generation_v2.sql`),
lancée à la main en production après sauvegarde :
`npx wrangler d1 execute lead-dashboard-db --remote --file=migrations/NNNN_….sql`.

## Production (OBLIGATOIRE)

- **Sauvegarde avant toute opération destructive** (reconstruction de table, `UPDATE`/`DELETE` en masse, import) :
  ```bash
  cd lead-dashboard-web
  npx wrangler d1 export lead-dashboard-db --remote --output=../../backup_prod_$(date +%Y%m%d_%H%M).sql
  ```
  Le fichier part hors du dépôt (il contient des données personnelles) ; vérifie sa taille avant de continuer.
- **La base s'appelle `lead-dashboard-db`** (liaison `DB`). Le script `db:init:remote` vise un autre nom : ne pas
  l'utiliser tel quel.
- **Les scripts `db:migrate:*` n'appliquent que la migration `0001`** : ne pas s'en servir pour les suivantes.

## Contenu de la base

- `opportunity_definitions` fait foi pour les besoins (voir `besoins.md`).
- Les photos des prospects ne sont pas en base : bucket R2 `lead-media`, clé `leads/<id>/<n>`
  (`src/services/leadMedia.ts`).
