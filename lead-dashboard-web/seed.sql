-- ⚠️ LOCAL ET TESTS UNIQUEMENT — ne jamais exécuter sur la base de production.
-- Ces jetons sont publics (versionnés) : en prod, créer les comptes depuis l'admin (voir README, « Production »).
-- Un compte existant n'est jamais modifié (pas de réinitialisation du jeton ni du code d'invitation).
INSERT INTO users (id, name, email, invite_code, role, phone_quota_weekly, access_token) VALUES
  ('u_admin',  'Loïc Alcantara', 'loic.alcantara@gmail.com', 'inv_' || lower(hex(randomblob(16))), 'admin',  0,   'adm_9e86b81a2886a9c4de99f1eb10580218'),
  ('u_closer1','Closer 1',       'closer1@agence.local',     'inv_' || lower(hex(randomblob(16))), 'closer', 150, 'cls_d7e12e4e0eee45d8654fd44439726210')
ON CONFLICT(id) DO NOTHING;
