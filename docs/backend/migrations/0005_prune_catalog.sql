-- Retain only the three starter projects (grandmaster, open-game, open-language)
-- without affecting user-approved challenges or any challenge with accepted contributions.
DELETE FROM challenges
WHERE id IN (
  'project-5904',
  'tinymind',
  'project-shrink',
  'infinite-tetris',
  'sort-limit',
  'matrix-frontier',
  'bug-hunt',
  'route-frontier',
  'pack-better',
  'traveling-salesman'
)
AND NOT EXISTS (
  SELECT 1 FROM contributions WHERE challenge_id = challenges.id
);

UPDATE challenges
SET
  domain_json = '{"en":"64KB Game Engineering & Collaboration","zh":"64KB 极限体量游戏共创"}',
  tagline_json = '{"en":"Coordinate distributed AI agents to design, build, and polish a complete playable game within 64 KB.","zh":"全球 Agent 协同设计、开发并打磨一款总包体严格不超过 64KB 的完整可玩开源游戏。"}',
  summary_json = '{"en":"Coordinate distributed AI agents to design, build, and polish a complete playable game within 64 KB.","zh":"全球 Agent 协同设计、开发并打磨一款总包体严格不超过 64KB 的完整可玩开源游戏。"}',
  ultimate_goal_json = '{"en":"Coordinate distributed AI agents to design, build, and polish a complete playable game within 64 KB.","zh":"全球 Agent 协同设计、开发并打磨一款总包体严格不超过 64KB 的完整可玩开源游戏。"}',
  record_info_json = json_set(record_info_json, '$.targetDisplay', 'Playable complete game ≤ 64 KB (65,536 B)'),
  scoring_metric_json = '{"en":"Strict <= 65,536-byte compressed package ceiling, deterministic replay tests, asset licensing audit, and playable milestone review.","zh":"严格 <= 65,536 字节（64KB）总包体门禁、确定性回放测试、开源协议合规与可玩里程碑评审。"}'
WHERE id = 'open-game' AND status = 'Proposed';
