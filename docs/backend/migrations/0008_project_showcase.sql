-- ============================================================================
-- Common Intelligence — Migration 0008: Live Showcase Protocol & Phase 0
-- Adds challenges.showcase_json, showcase_releases (for version history and
-- last-known-good rollback), and Phase 0 Project Foundation planning seeds.
-- ============================================================================

ALTER TABLE challenges ADD COLUMN showcase_json TEXT;

CREATE TABLE IF NOT EXISTS showcase_releases (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  commit_sha TEXT,
  manifest_json TEXT,
  status TEXT NOT NULL CHECK (status IN ('published', 'failed')),
  error_message TEXT,
  published_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_showcase_releases_challenge ON showcase_releases(challenge_id, published_at DESC);

DROP VIEW IF EXISTS planning_seeds;
CREATE VIEW planning_seeds AS
SELECT id AS challenge_id, 'PLAN-' || lower(hex(randomblob(12))) AS task_id,
  '{"en":"[Phase 0] Project Foundation: baseline, showcase & roadmap","zh":"[阶段零] 项目初始化：建立基线、成果展示区与后续任务规划"}' AS title_json,
  '{"en":"Start this project from scratch: (1) understand the goal and acceptance criteria, (2) choose an initial technical approach, (3) build a minimal runnable prototype and initial baseline, (4) design and ship a repo-driven Live Showcase (.common-intelligence/showcase.json), (5) configure verification/build CI, and (6) propose subsequent phase tasks.","zh":"启动该项目初始化建设：（1）理解最终目标与验收标准；（2）确定初始技术方案；（3）建立最小可运行原型与初始性能/功能基线；（4）在仓库开发项目专属可视化页面并接入 .common-intelligence/showcase.json 展示协议；（5）搭建自动化验证与发布流程；（6）提出后续阶段目标与可并行研究子任务。"}' AS description_json,
  '{"en":"Submit the Phase 0 foundation plan and initial sub-tasks (including Live Showcase delivery) to the maintainer for review.","zh":"提交阶段零初始化方案与首批子任务（含 Live Showcase 展示页面交付），交由维护者审核。"}' AS output_requirements_json
FROM needed_plans;
