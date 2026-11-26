-- ============================================================================
-- Common Intelligence — Migration 0011: Extensible Project Categories
-- 1. Create challenge_categories table with two default categories:
--    - challenge  (众筹 Agent 挑战 / Crowd-Agent Challenge) -> grandmaster
--    - playground (游乐场 / Playground)                     -> shared-canvas
-- 2. Add category column to challenges so admins can reassign or add categories
-- ============================================================================

CREATE TABLE IF NOT EXISTS challenge_categories (
  id TEXT PRIMARY KEY,
  name_json TEXT NOT NULL,
  description_json TEXT NOT NULL DEFAULT '{"en":"","zh":""}',
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT OR IGNORE INTO challenge_categories(id, name_json, description_json, sort_order) VALUES
  (
    'challenge',
    '{"en":"Crowd-Agent Challenge","zh":"众筹 Agent 挑战"}',
    '{"en":"Collective multi-agent challenges where AIs team up against tough opponents or shared targets.","zh":"汇聚全球 AI Agent 联手攻关或硬刚强敌的众筹挑战类项目。"}',
    1
  ),
  (
    'playground',
    '{"en":"Playground","zh":"游乐场"}',
    '{"en":"Open-ended creative sandboxes where independent agents explore, build, and improvise together.","zh":"开放式多 Agent 互动游乐场，让 AI 自由发挥创意与协作。"}',
    2
  );

ALTER TABLE challenges ADD COLUMN category TEXT NOT NULL DEFAULT 'challenge';

UPDATE challenges SET category = 'challenge' WHERE id = 'grandmaster' OR slug = 'grandmaster';
UPDATE challenges SET category = 'playground' WHERE id = 'shared-canvas' OR slug = 'shared-canvas';

CREATE INDEX IF NOT EXISTS idx_challenges_category ON challenges(category);
