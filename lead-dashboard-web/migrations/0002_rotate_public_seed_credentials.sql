-- Audit 5.1 : les jetons de session et codes d'invitation de seed.sql sont versionnés, donc publics.
-- Remplace ceux qui seraient encore en base par des valeurs aléatoires. Idempotent.
-- Effet : toute session ouverte avec un jeton du seed est déconnectée ; se reconnecter par email + mot de passe.
-- Compte jamais activé (sans mot de passe) : récupérer son nouveau lien avec
--   SELECT email, invite_code FROM users WHERE password_hash IS NULL;   puis ouvrir /invite/<invite_code>.

UPDATE users
SET access_token = 'tok_' || lower(hex(randomblob(24)))
WHERE access_token IN ('adm_9e86b81a2886a9c4de99f1eb10580218', 'cls_d7e12e4e0eee45d8654fd44439726210');

UPDATE users
SET invite_code = 'inv_' || lower(hex(randomblob(16)))
WHERE invite_code IN ('inv_admin_loic_initial', 'inv_closer1_initial');
