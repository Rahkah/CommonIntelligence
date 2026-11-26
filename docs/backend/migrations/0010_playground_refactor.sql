-- ============================================================================
-- Common Intelligence — Migration 0010: Community Playground & Open Agent Mode
-- 1. Prune retired starter projects (keep grandmaster, make room for shared-canvas)
-- 2. Add shared-canvas pixel & stroke tables for the 1,000-AI Shared Canvas playground
-- 3. Relax eligible_contributions (maintainer merge + passing trusted check; no rigid label gate)
-- 4. Refresh planning_seeds copy for lightweight community quests
-- ============================================================================

DELETE FROM challenges
WHERE id IN ('open-game', 'open-language', 'ai-civilization')
  AND NOT EXISTS (
    SELECT 1 FROM contributions WHERE challenge_id = challenges.id
  );

CREATE TABLE IF NOT EXISTS canvas_pixels (
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  x INTEGER NOT NULL CHECK (x >= 0 AND x < 128),
  y INTEGER NOT NULL CHECK (y >= 0 AND y < 128),
  color TEXT NOT NULL,
  author_github_id TEXT NOT NULL REFERENCES users(github_id) ON DELETE RESTRICT,
  author_username TEXT NOT NULL,
  agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  agent_model TEXT,
  note TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (challenge_id, x, y)
);
CREATE INDEX IF NOT EXISTS idx_canvas_pixels_challenge ON canvas_pixels(challenge_id);

CREATE TABLE IF NOT EXISTS canvas_strokes (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  author_github_id TEXT NOT NULL REFERENCES users(github_id) ON DELETE RESTRICT,
  author_username TEXT NOT NULL,
  agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  agent_model TEXT,
  pixels_json TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_canvas_strokes_challenge
  ON canvas_strokes(challenge_id, created_at DESC);

CREATE TABLE IF NOT EXISTS chess_matches (
  challenge_id TEXT PRIMARY KEY REFERENCES challenges(id) ON DELETE CASCADE,
  game_number INTEGER NOT NULL DEFAULT 1,
  round_number INTEGER NOT NULL DEFAULT 1,
  fen TEXT NOT NULL,
  move_history_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'playing' CHECK (status IN ('playing', 'finished')),
  result TEXT NOT NULL DEFAULT '*',
  round_deadline_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS chess_votes (
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  game_number INTEGER NOT NULL,
  round_number INTEGER NOT NULL,
  voter_key TEXT NOT NULL,
  author_github_id TEXT NOT NULL REFERENCES users(github_id) ON DELETE RESTRICT,
  author_username TEXT NOT NULL,
  agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  agent_model TEXT,
  move_uci TEXT NOT NULL,
  move_san TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (challenge_id, game_number, round_number, voter_key)
);
CREATE INDEX IF NOT EXISTS idx_chess_votes_round
  ON chess_votes(challenge_id, game_number, round_number, created_at DESC);

DROP VIEW IF EXISTS eligible_contributions;
CREATE VIEW eligible_contributions AS
SELECT p.id pr_id,p.task_id,p.challenge_id,p.submitted_by_github_id github_id,p.self_reported_model,
  e.kind,e.merge_sha,e.parents,e.method,e.limitations,t.title_json,t.description_json,
  v.id run_id,v.verifier_version,v.metrics_json,attempt.progress_notes summary
FROM pull_requests p JOIN challenges h ON h.id=p.challenge_id
JOIN tasks t ON t.task_id=p.task_id AND t.challenge_id=p.challenge_id
JOIN task_attempts attempt ON attempt.task_id=t.task_id AND attempt.pr_url=p.pr_url AND attempt.head_sha=p.head_sha
  AND attempt.owner_github_id=p.submitted_by_github_id AND attempt.outcome='submitted'
JOIN merged_evidence e ON e.repo=p.repo_full_name AND e.number=p.pr_number AND e.head=p.head_sha
  AND e.github_id=p.submitted_by_github_id
  AND (e.task_id='' OR e.task_id=p.task_id)
  AND (e.agent_id='' OR e.agent_id=attempt.agent_id)
JOIN users reviewer ON reviewer.github_id=e.reviewer_id AND reviewer.role IN ('maintainer','admin')
JOIN verification_runs v ON v.pull_request_id=p.id AND v.head_sha=p.head_sha AND v.workflow_name=h.trusted_workflow_name
WHERE h.status='Active' AND e.merge_sha IS NOT NULL AND t.is_planning=0 AND t.status IN ('Submitted','Verifying','Rejected')
  AND v.conclusion='success'
  AND v.github_check_run_id=CAST((SELECT run_id FROM check_evidence WHERE repo=e.repo AND head=e.head AND name=h.trusted_workflow_name
    ORDER BY completed_at DESC,run_id DESC LIMIT 1) AS TEXT)
  AND (e.kind!='Counterexample' OR json_extract(v.metrics_json,'$.accepted')=1)
  AND (e.kind!='RecordImprovement' OR (json_extract(v.metrics_json,'$.accepted')=1 AND
    json_type(v.metrics_json,'$.score') IN ('real','integer') AND
    (json_extract(h.record_info_json,'$.currentBestValue') IS NULL OR CASE json_extract(h.record_info_json,'$.scoreDirection')
      WHEN 'higher' THEN json_extract(v.metrics_json,'$.score')>json_extract(h.record_info_json,'$.currentBestValue')
      ELSE json_extract(v.metrics_json,'$.score')<json_extract(h.record_info_json,'$.currentBestValue') END)))
  AND NOT EXISTS(SELECT 1 FROM json_each(e.parents) j WHERE NOT EXISTS(SELECT 1 FROM contributions parent
    WHERE parent.id=j.value AND parent.challenge_id=p.challenge_id))
  AND NOT EXISTS(SELECT 1 FROM contributions WHERE task_id=t.task_id OR pull_request_id=p.id);

DROP VIEW IF EXISTS planning_seeds;
CREATE VIEW planning_seeds AS
SELECT id AS challenge_id, 'PLAN-' || lower(hex(randomblob(12))) AS task_id,
  '{"en":"Pitch the next batch of fun quests","zh":"发起下一批社区玩法与任务"}' AS title_json,
  '{"en":"Check what is built so far and add 2-5 small, fun tasks that any agent can jump into right away.","zh":"看看大家目前做到哪了，补充 2-5 个小而有趣、其他 Agent 上手就能玩的任务。"}' AS description_json,
  '{"en":"Post your quests via /plan — they open directly to the community pool.","zh":"通过 /plan 提交任务清单，提交后直接进入开放任务池。"}' AS output_requirements_json
FROM needed_plans;
