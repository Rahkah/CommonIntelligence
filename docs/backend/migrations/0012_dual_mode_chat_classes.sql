-- ============================================================================
-- Common Intelligence — Migration 0012: Dual-Mode Participation (Chat + Agent)
-- & Raid Class Metadata
--
-- 1. Extend tasks with class affinity, effort tier, supported participation
--    modes, delivery mode, context spec, structured output schema, and
--    event/dedup provenance.
-- 2. Enforce entry-tier class gating for Chat mode (scout / arbiter lightweight)
--    while advanced execution classes (forger / tactician / pioneer) stay
--    Agent-only.
-- 3. Extend research_artifacts with submission channel, role class, content
--    dedup hash, structured payload, self-reported model, and verification count.
-- 4. Add artifact_links (cross-mode provenance DAG) and artifact_verifications
--    (independent peer/Agent verification with strict anti-self-verify).
-- 5. Extend agent_join_codes and agents for class/budget session configs.
-- ============================================================================

ALTER TABLE tasks ADD COLUMN recommended_class TEXT
  CHECK (recommended_class IS NULL OR recommended_class IN ('scout', 'arbiter', 'forger', 'tactician', 'pioneer'));
ALTER TABLE tasks ADD COLUMN effort_tier TEXT NOT NULL DEFAULT 'M'
  CHECK (effort_tier IN ('S', 'M', 'L'));
ALTER TABLE tasks ADD COLUMN supported_modes_json TEXT NOT NULL DEFAULT '["agent"]';
ALTER TABLE tasks ADD COLUMN delivery_mode TEXT NOT NULL DEFAULT 'pr_auto_verify'
  CHECK (delivery_mode IN ('artifact_api', 'pr_auto_verify', 'pr_maintainer_review', 'experiment_run', 'playground_action'));
ALTER TABLE tasks ADD COLUMN context_spec_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE tasks ADD COLUMN output_schema_kind TEXT;
ALTER TABLE tasks ADD COLUMN verification_mode TEXT NOT NULL DEFAULT 'pr_auto_verify'
  CHECK (verification_mode IN ('deterministic_inline', 'peer_or_agent_verify', 'pr_auto_verify', 'maintainer_review'));
ALTER TABLE tasks ADD COLUMN trigger_source TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE tasks ADD COLUMN trigger_ref_id TEXT;
ALTER TABLE tasks ADD COLUMN dedup_fingerprint TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_match
  ON tasks(challenge_id, status, recommended_class, effort_tier);
CREATE INDEX IF NOT EXISTS idx_tasks_dedup
  ON tasks(challenge_id, dedup_fingerprint) WHERE dedup_fingerprint IS NOT NULL;

-- Backfill existing tasks cleanly without breaking historical rows
UPDATE tasks SET
  recommended_class = 'scout',
  effort_tier = 'S',
  supported_modes_json = '["chat","agent"]',
  delivery_mode = 'artifact_api',
  output_schema_kind = 'hypothesis_proposal',
  verification_mode = 'peer_or_agent_verify'
WHERE recommended_class IS NULL AND task_type IN ('Research', 'Documentation') AND is_planning = 0;

UPDATE tasks SET
  recommended_class = 'arbiter',
  effort_tier = 'S',
  supported_modes_json = '["chat","agent"]',
  delivery_mode = 'artifact_api',
  output_schema_kind = 'counterexample_review',
  verification_mode = 'peer_or_agent_verify'
WHERE recommended_class IS NULL AND task_type IN ('Verification', 'Counterexample') AND is_planning = 0;

UPDATE tasks SET
  recommended_class = 'forger',
  effort_tier = 'M',
  supported_modes_json = '["agent"]',
  delivery_mode = 'pr_auto_verify',
  verification_mode = 'pr_auto_verify'
WHERE recommended_class IS NULL AND task_type IN ('Implementation', 'Integration') AND is_planning = 0;

UPDATE tasks SET
  recommended_class = 'tactician',
  effort_tier = 'M',
  supported_modes_json = '["agent"]',
  delivery_mode = 'pr_auto_verify',
  verification_mode = 'pr_auto_verify'
WHERE recommended_class IS NULL AND task_type IN ('Optimization', 'Search') AND is_planning = 0;

-- Starter interactive micro-tasks explicitly support both Chat & Agent modes
UPDATE tasks SET
  recommended_class = 'scout',
  effort_tier = 'S',
  supported_modes_json = '["chat","agent"]',
  delivery_mode = 'playground_action',
  output_schema_kind = 'canvas_pixels',
  verification_mode = 'deterministic_inline'
WHERE task_id = 'TASK-CANVAS-01';

UPDATE tasks SET
  recommended_class = 'scout',
  effort_tier = 'S',
  supported_modes_json = '["chat","agent"]',
  delivery_mode = 'playground_action',
  output_schema_kind = 'chess_tactic_vote',
  verification_mode = 'deterministic_inline'
WHERE task_id = 'TASK-GM-01';

-- Extend research_artifacts for unified Chat + Agent knowledge provenance
ALTER TABLE research_artifacts ADD COLUMN submission_channel TEXT NOT NULL DEFAULT 'agent'
  CHECK (submission_channel IN ('agent', 'chat'));
ALTER TABLE research_artifacts ADD COLUMN role_class TEXT
  CHECK (role_class IS NULL OR role_class IN ('scout', 'arbiter', 'forger', 'tactician', 'pioneer'));
ALTER TABLE research_artifacts ADD COLUMN content_sha256 TEXT;
ALTER TABLE research_artifacts ADD COLUMN structured_payload_json TEXT;
ALTER TABLE research_artifacts ADD COLUMN self_reported_model TEXT;
ALTER TABLE research_artifacts ADD COLUMN verified_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE research_artifacts ADD COLUMN refuted_by_artifact_id TEXT REFERENCES research_artifacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_artifacts_content_hash
  ON research_artifacts(challenge_id, content_sha256) WHERE content_sha256 IS NOT NULL;

-- Cross-mode artifact lineage DAG (Chat hypotheses/reviews <-> Agent implementations/PRs)
CREATE TABLE IF NOT EXISTS artifact_links (
  from_artifact_id TEXT NOT NULL REFERENCES research_artifacts(id) ON DELETE CASCADE,
  to_artifact_id TEXT NOT NULL REFERENCES research_artifacts(id) ON DELETE RESTRICT,
  relation_type TEXT NOT NULL CHECK (relation_type IN (
    'derived_from', 'uses_capability', 'fuses', 'verifies', 'refutes', 'diagnoses', 'implements'
  )),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (from_artifact_id, to_artifact_id, relation_type),
  CHECK (from_artifact_id != to_artifact_id)
);
CREATE INDEX IF NOT EXISTS idx_artifact_links_to ON artifact_links(to_artifact_id, relation_type);

-- Independent peer / Agent verification records (anti-self-verification enforced in API + UNIQUE)
CREATE TABLE IF NOT EXISTS artifact_verifications (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL REFERENCES research_artifacts(id) ON DELETE CASCADE,
  verifier_github_id TEXT NOT NULL REFERENCES users(github_id) ON DELETE RESTRICT,
  verifier_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('confirm', 'refute', 'inconclusive')),
  evidence_summary TEXT NOT NULL,
  repro_notes TEXT,
  evidence_url TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (artifact_id, verifier_github_id)
);
CREATE INDEX IF NOT EXISTS idx_artifact_verifications_artifact
  ON artifact_verifications(artifact_id, verdict);

-- Agent session class/budget metadata
ALTER TABLE agent_join_codes ADD COLUMN session_config_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE agents ADD COLUMN preferred_class TEXT;
ALTER TABLE agents ADD COLUMN declared_env_json TEXT NOT NULL DEFAULT '[]';
