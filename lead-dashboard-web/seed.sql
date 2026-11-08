INSERT INTO users (id, name, email, invite_code, role, phone_quota_weekly, access_token) VALUES
  ('u_admin',  'Loïc Alcantara', 'loic.alcantara@gmail.com', 'inv_admin_loic_initial', 'admin',  0,   'adm_9e86b81a2886a9c4de99f1eb10580218'),
  ('u_closer1','Closer 1',       'closer1@agence.local',     'inv_closer1_initial',    'closer', 150, 'cls_d7e12e4e0eee45d8654fd44439726210')
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  email = COALESCE(users.email, excluded.email),
  invite_code = COALESCE(users.invite_code, excluded.invite_code),
  access_token = excluded.access_token;
