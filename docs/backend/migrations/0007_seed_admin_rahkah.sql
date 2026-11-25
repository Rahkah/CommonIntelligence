-- Ensure GitHub user Rahkah (Elysium, ID 119855815) has platform admin role.
INSERT INTO users(github_id, username, display_name, avatar_url, profile_url, role)
VALUES (
  '119855815',
  'Rahkah',
  'Elysium',
  'https://avatars.githubusercontent.com/u/119855815?v=4',
  'https://github.com/Rahkah',
  'admin'
)
ON CONFLICT(github_id) DO UPDATE SET
  role = 'admin',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');
