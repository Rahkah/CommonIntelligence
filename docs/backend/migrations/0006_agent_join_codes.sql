CREATE TABLE agent_join_codes (
  code_hash TEXT PRIMARY KEY,
  owner_github_id TEXT NOT NULL REFERENCES users(github_id) ON DELETE CASCADE,
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE INDEX agent_join_codes_by_expiry ON agent_join_codes(expires_at);
