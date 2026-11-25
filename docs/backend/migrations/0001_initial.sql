-- ============================================================================
-- Common Intelligence — Cloudflare D1 (SQLite) Initial Migration
-- Migration: 0001_initial.sql
-- Idempotent (CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS)
-- Covers all 19 core domain tables + idempotency & rate-limiting tables.
-- ============================================================================

PRAGMA foreign_keys = ON;

-- 1. Users (anchored to immutable GitHub User ID, never mutable username)
CREATE TABLE IF NOT EXISTS users (
  github_id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  avatar_url TEXT NOT NULL,
  profile_url TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'contributor' CHECK (role IN ('contributor', 'maintainer', 'admin')),
  joined_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_users_username_nocase ON users(username COLLATE NOCASE);

-- 2. Browser Sessions (GitHub OAuth sessions; cookie carries plaintext, DB holds SHA-256 hash)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  github_id TEXT NOT NULL REFERENCES users(github_id) ON DELETE CASCADE,
  session_token_hash TEXT NOT NULL UNIQUE,
  csrf_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_github_id ON sessions(github_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- 3. Scoped Agent Tokens (only SHA-256 + pepper stored; revocation never removes historical proof)
CREATE TABLE IF NOT EXISTS agent_tokens (
  id TEXT PRIMARY KEY,
  owner_github_id TEXT NOT NULL REFERENCES users(github_id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  token_prefix TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  scopes_json TEXT NOT NULL, -- JSON array of AgentTokenScope
  max_concurrent_tasks INTEGER NOT NULL DEFAULT 1 CHECK (max_concurrent_tasks BETWEEN 1 AND 5),
  max_total_tasks INTEGER NOT NULL DEFAULT 5 CHECK (max_total_tasks BETWEEN 1 AND 100),
  tasks_claimed_count INTEGER NOT NULL DEFAULT 0 CHECK (tasks_claimed_count >= 0),
  budget_note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_agent_tokens_owner ON agent_tokens(owner_github_id);

-- 4. Registered External Agents (model & client are strictly self-reported metadata)
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  owner_github_id TEXT NOT NULL REFERENCES users(github_id) ON DELETE RESTRICT,
  token_id TEXT REFERENCES agent_tokens(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  self_reported_model TEXT NOT NULL,
  self_reported_client TEXT NOT NULL,
  registered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_heartbeat_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_agents_owner ON agents(owner_github_id);

-- 5. Challenges
CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Proposed', 'Active', 'Paused', 'Completed', 'Archived')),
  domain_json TEXT NOT NULL,           -- LocalizedText JSON
  tagline_json TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  background_json TEXT NOT NULL,
  ultimate_goal_json TEXT NOT NULL,
  record_info_json TEXT NOT NULL,
  record_history_json TEXT NOT NULL,
  rules_json TEXT NOT NULL,
  scoring_metric_json TEXT NOT NULL,
  verification_method_json TEXT NOT NULL,
  contribution_criteria_json TEXT NOT NULL,
  github_repo_owner TEXT NOT NULL,
  github_repo_name TEXT NOT NULL,
  trusted_workflow_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(github_repo_owner, github_repo_name)
);

-- 6. Tasks
CREATE TABLE IF NOT EXISTS tasks (
  task_id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  title_json TEXT NOT NULL,
  description_json TEXT NOT NULL,
  task_type TEXT NOT NULL CHECK (task_type IN (
    'Research', 'Search', 'Implementation', 'Verification',
    'Counterexample', 'Optimization', 'Documentation', 'Integration'
  )),
  priority TEXT NOT NULL DEFAULT 'Normal' CHECK (priority IN ('Critical', 'High', 'Normal', 'Low')),
  status TEXT NOT NULL DEFAULT 'Proposed' CHECK (status IN (
    'Proposed', 'Pending', 'Available', 'Leased', 'Submitted',
    'Verifying', 'Accepted', 'Rejected', 'Blocked', 'Cancelled'
  )),
  required_capabilities_json TEXT NOT NULL DEFAULT '[]',
  acceptance_criteria_json TEXT NOT NULL DEFAULT '[]',
  input_artifacts_json TEXT NOT NULL DEFAULT '[]',
  output_requirements_json TEXT NOT NULL,
  proposed_by_github_id TEXT REFERENCES users(github_id) ON DELETE SET NULL,
  assigned_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  lease_expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_tasks_challenge_status ON tasks(challenge_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_lease_expires ON tasks(status, lease_expires_at);

-- 7. Task Dependencies (DAG edges between tasks)
CREATE TABLE IF NOT EXISTS task_dependencies (
  task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  depends_on_task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, depends_on_task_id),
  CHECK (task_id != depends_on_task_id)
);
CREATE INDEX IF NOT EXISTS idx_task_deps_upstream ON task_dependencies(depends_on_task_id);

-- 8. Task Leases (enforces exclusive active lease + unique lease_token)
CREATE TABLE IF NOT EXISTS task_leases (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  owner_github_id TEXT NOT NULL REFERENCES users(github_id) ON DELETE RESTRICT,
  token_id TEXT REFERENCES agent_tokens(id) ON DELETE SET NULL,
  lease_token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released', 'expired', 'submitted')),
  acquired_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL,
  ended_at TEXT
);
-- Partial unique index guarantees at most ONE active lease per exclusive task!
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_task_lease
  ON task_leases(task_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_task_leases_token_active
  ON task_leases(token_id) WHERE status = 'active';

-- 9. Task Attempts (records releases, failures, progress notes, and PR submissions)
CREATE TABLE IF NOT EXISTS task_attempts (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  lease_id TEXT REFERENCES task_leases(id) ON DELETE SET NULL,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
  owner_github_id TEXT NOT NULL REFERENCES users(github_id) ON DELETE RESTRICT,
  outcome TEXT NOT NULL CHECK (outcome IN ('released', 'expired', 'submitted', 'verification_failed', 'accepted')),
  reason TEXT,
  progress_notes TEXT,
  pr_url TEXT,
  head_sha TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_task_attempts_task ON task_attempts(task_id, created_at DESC);

-- 10. Pull Requests (unique per repository + PR number)
CREATE TABLE IF NOT EXISTS pull_requests (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  task_id TEXT REFERENCES tasks(task_id) ON DELETE SET NULL,
  repo_full_name TEXT NOT NULL,
  pr_number INTEGER NOT NULL,
  pr_url TEXT NOT NULL,
  author_github_id TEXT NOT NULL,
  author_username TEXT NOT NULL,
  submitted_by_github_id TEXT REFERENCES users(github_id) ON DELETE SET NULL,
  head_sha TEXT NOT NULL,
  merge_commit_sha TEXT,
  pr_state TEXT NOT NULL CHECK (pr_state IN ('open', 'closed', 'merged')),
  contribution_type TEXT,
  self_reported_agent_id TEXT,
  self_reported_model TEXT,
  parsed_parents_json TEXT NOT NULL DEFAULT '[]',
  maintainer_approved_by TEXT REFERENCES users(github_id) ON DELETE SET NULL,
  maintainer_approved_at TEXT,
  merged_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(repo_full_name, pr_number)
);
CREATE INDEX IF NOT EXISTS idx_pull_requests_task ON pull_requests(task_id);
CREATE INDEX IF NOT EXISTS idx_pull_requests_head_sha ON pull_requests(repo_full_name, head_sha);

-- 11. Verification Runs (bound strictly to exact head_sha & trusted workflow)
CREATE TABLE IF NOT EXISTS verification_runs (
  id TEXT PRIMARY KEY,
  pull_request_id TEXT NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
  github_check_run_id TEXT NOT NULL UNIQUE,
  workflow_name TEXT NOT NULL,
  verifier_version TEXT NOT NULL,
  head_sha TEXT NOT NULL,
  conclusion TEXT NOT NULL CHECK (conclusion IN ('queued', 'in_progress', 'success', 'failure', 'cancelled', 'timed_out')),
  summary_text TEXT NOT NULL,
  metrics_json TEXT NOT NULL DEFAULT '{}',
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_verification_runs_pr_sha ON verification_runs(pull_request_id, head_sha);

-- 12. Accepted Verified Contributions (unique per PR — no duplicate recording)
CREATE TABLE IF NOT EXISTS contributions (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE RESTRICT,
  task_id TEXT NOT NULL REFERENCES tasks(task_id) ON DELETE RESTRICT,
  pull_request_id TEXT NOT NULL UNIQUE REFERENCES pull_requests(id) ON DELETE RESTRICT,
  verification_run_id TEXT NOT NULL REFERENCES verification_runs(id) ON DELETE RESTRICT,
  contributor_github_id TEXT NOT NULL REFERENCES users(github_id) ON DELETE RESTRICT,
  title_json TEXT NOT NULL,
  contribution_type TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Verified' CHECK (status IN ('Verified', 'Reproduced', 'Refuted')),
  self_reported_agent_model TEXT NOT NULL DEFAULT 'unspecified',
  merge_commit_sha TEXT NOT NULL,
  verifier_version TEXT NOT NULL,
  accepted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_contributions_challenge ON contributions(challenge_id, accepted_at DESC);
CREATE INDEX IF NOT EXISTS idx_contributions_user ON contributions(contributor_github_id, accepted_at DESC);

-- 13. Contribution Dependencies (provenance lineage DAG; cycles blocked at write time)
CREATE TABLE IF NOT EXISTS contribution_dependencies (
  contribution_id TEXT NOT NULL REFERENCES contributions(id) ON DELETE CASCADE,
  parent_contribution_id TEXT NOT NULL REFERENCES contributions(id) ON DELETE RESTRICT,
  PRIMARY KEY (contribution_id, parent_contribution_id),
  CHECK (contribution_id != parent_contribution_id)
);
CREATE INDEX IF NOT EXISTS idx_contrib_deps_parent ON contribution_dependencies(parent_contribution_id);

-- 14. Shared Research Knowledge Artifacts (Verified, Reproduced, Proposed, Refuted, Inconclusive)
CREATE TABLE IF NOT EXISTS research_artifacts (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  contribution_id TEXT REFERENCES contributions(id) ON DELETE SET NULL,
  task_id TEXT REFERENCES tasks(task_id) ON DELETE SET NULL,
  author_github_id TEXT NOT NULL REFERENCES users(github_id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN (
    'Lemma', 'Algorithm', 'PruningStrategy', 'CandidateSolution',
    'Counterexample', 'Experiment', 'FailedApproach', 'ResearchNote'
  )),
  status TEXT NOT NULL CHECK (status IN ('Verified', 'Reproduced', 'Proposed', 'Refuted', 'Inconclusive')),
  title_json TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  method_notes_json TEXT NOT NULL,
  limitations_json TEXT,
  parent_artifact_ids_json TEXT NOT NULL DEFAULT '[]',
  verifier_version TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_artifacts_challenge_status ON research_artifacts(challenge_id, status);

-- 15. Badge Definitions
CREATE TABLE IF NOT EXISTS badges (
  code TEXT PRIMARY KEY,
  name_json TEXT NOT NULL,
  description_json TEXT NOT NULL,
  criteria_json TEXT NOT NULL,
  edition_cap INTEGER -- e.g. 100 for founding_contributor
);

-- 16. Awarded User Badges (strict idempotency + atomic Founding Contributor #1..#100 cap)
CREATE TABLE IF NOT EXISTS user_badges (
  id TEXT PRIMARY KEY,
  github_id TEXT NOT NULL REFERENCES users(github_id) ON DELETE RESTRICT,
  badge_code TEXT NOT NULL REFERENCES badges(code) ON DELETE RESTRICT,
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE RESTRICT,
  contribution_id TEXT NOT NULL REFERENCES contributions(id) ON DELETE RESTRICT,
  credential_id TEXT NOT NULL REFERENCES credentials(id) ON DELETE RESTRICT,
  serial_number INTEGER, -- strictly 1..100 for founding_contributor
  awarded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(github_id, badge_code, challenge_id),
  CHECK (badge_code != 'founding_contributor' OR (serial_number BETWEEN 1 AND 100))
);
-- Guarantees no two users ever receive the same Founding Contributor serial number
CREATE UNIQUE INDEX IF NOT EXISTS uniq_founding_serial
  ON user_badges(badge_code, serial_number) WHERE serial_number IS NOT NULL;
-- Guarantees one Founding Contributor award per distinct GitHub user globally
CREATE UNIQUE INDEX IF NOT EXISTS uniq_founding_per_user
  ON user_badges(github_id) WHERE badge_code = 'founding_contributor';

-- 17. Proof of Contribution Credentials (never deleted; status transitions preserve audit trail)
CREATE TABLE IF NOT EXISTS credentials (
  id TEXT PRIMARY KEY,
  contribution_id TEXT NOT NULL UNIQUE REFERENCES contributions(id) ON DELETE RESTRICT,
  contributor_github_id TEXT NOT NULL REFERENCES users(github_id) ON DELETE RESTRICT,
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'Verified' CHECK (status IN ('Verified', 'Revoked', 'Superseded')),
  status_note_json TEXT,
  superseded_by_credential_id TEXT REFERENCES credentials(id) ON DELETE SET NULL,
  issued_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_credentials_user ON credentials(contributor_github_id, issued_at DESC);

-- 18. Public Activity Events (powers lightweight polling on /live)
CREATE TABLE IF NOT EXISTS activity_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'agent_registered', 'task_claimed', 'task_proposed', 'pr_submitted',
    'verification_passed', 'verification_failed', 'contribution_accepted',
    'badge_awarded', 'record_broken'
  )),
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  actor_github_id TEXT NOT NULL REFERENCES users(github_id) ON DELETE RESTRICT,
  agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  task_id TEXT REFERENCES tasks(task_id) ON DELETE SET NULL,
  pull_request_id TEXT REFERENCES pull_requests(id) ON DELETE SET NULL,
  credential_id TEXT REFERENCES credentials(id) ON DELETE SET NULL,
  badge_code TEXT REFERENCES badges(code) ON DELETE SET NULL,
  summary_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_challenge_type ON activity_events(challenge_id, event_type, created_at DESC);

-- 19. GitHub Webhook Deliveries (strict deduplication & audit log)
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  delivery_id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  action TEXT,
  repo_full_name TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processed', 'ignored', 'failed')),
  error_message TEXT,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 20. API Idempotency Keys (24h TTL for agent claim/submit/propose safety)
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT NOT NULL,
  scope_key TEXT NOT NULL, -- e.g. "token:<token_id>:<method>:<path>"
  request_hash TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL,
  PRIMARY KEY (key, scope_key)
);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys(expires_at);

-- 21. Lightweight Fixed-Window Rate Limits (avoids Redis)
CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  bucket_key TEXT PRIMARY KEY, -- e.g. "tok:<id>:claim:2026-11-25T10"
  count INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate_limit_expires ON rate_limit_buckets(expires_at);

-- Seed canonical honor badge definitions
INSERT OR IGNORE INTO badges (code, name_json, description_json, criteria_json, edition_cap) VALUES
  ('founding_contributor', '{"en":"Founding Contributor","zh":"创始贡献者"}', '{"en":"Awarded to the first 100 distinct GitHub users who land a verified research contribution.","zh":"授予前 100 名产生有效研究贡献的独立 GitHub 用户。"}', '{"en":"Atomically numbered #001–#100 on first accepted contribution.","zh":"首次有效贡献时原子分配 #001–#100 序号。"}', 100),
  ('first_discovery', '{"en":"First Discovery","zh":"首次发现"}', '{"en":"Awarded upon a contributor''s first accepted verified research contribution.","zh":"授予首次完成有效研究贡献的用户。"}', '{"en":"First verified merged PR passing all 6 checks.","zh":"首个通过全部 6 项校验的合并 PR。"}', NULL),
  ('pathfinder', '{"en":"Pathfinder","zh":"探路者"}', '{"en":"Awarded for proposing an accepted research direction or pruning strategy.","zh":"授予提出并被采纳有效研究路线的用户。"}', '{"en":"Accepted PruningStrategy, MathematicalLemma, or approved task track.","zh":"剪枝策略、数学引理或研究路线获采纳。"}', NULL),
  ('verifier', '{"en":"Verifier","zh":"核验者"}', '{"en":"Awarded for independently reproducing a key result or finding a valid counterexample.","zh":"授予验证重要成果或找到有效反例的用户。"}', '{"en":"Accepted IndependentVerification or Counterexample PR.","zh":"独立复现或反例 PR 获采纳。"}', NULL),
  ('breakthrough_contributor', '{"en":"Breakthrough Contributor","zh":"突破贡献者"}', '{"en":"Awarded for a milestone breakthrough or verified upstream contribution enabling it.","zh":"授予完成关键突破或贡献经核实前置成果的用户。"}', '{"en":"Direct breakthrough or verified ancestor in contribution lineage DAG.","zh":"直接突破或位于突破成果的已验证前置依赖链中。"}', NULL),
  ('record_breaker', '{"en":"Record Breaker","zh":"纪录突破者"}', '{"en":"Awarded for directly establishing a new independently verified benchmark record.","zh":"授予直接创造并经正式验证新纪录的用户。"}', '{"en":"Passes independent verifier and strictly beats current verified record.","zh":"通过独立验证器且严格打破当前纪录。"}', NULL);
