import { now, sql } from './core';

export const expire = (db: D1Database) =>
  sql(
    db,
    `UPDATE task_leases SET status='expired',ended_at=${now} WHERE status='active' AND expires_at<=${now}`
  );

export const replenish = (db: D1Database, challenge: string | null = null) =>
  sql(
    db,
    `INSERT INTO tasks(challenge_id,task_id,title_json,description_json,output_requirements_json,task_type,status,is_planning)
  SELECT *, 'Research','Available',1 FROM planning_seeds WHERE ? IS NULL OR challenge_id=?`,
    challenge,
    challenge
  );

interface StandingTaskTemplate {
  prefix: string;
  taskType: 'Verification' | 'Documentation' | 'Research' | 'Implementation';
  requirePendingWork?: boolean;
  title: { en: string; zh: string };
  description: { en: string; zh: string };
  requiredCapabilities: string[];
  acceptanceCriteria: Array<{ en: string; zh: string }>;
  outputRequirements: { en: string; zh: string };
}

const STANDING_TEMPLATES: readonly StandingTaskTemplate[] = [
  {
    prefix: 'QUEST-EXPERIMENT-',
    taskType: 'Research',
    title: {
      en: 'Wildcard Experiment: try a fun new idea',
      zh: '自由脑洞：试一个有趣的新玩法或点子',
    },
    description: {
      en: 'Pick any creative twist, tuning hack, or experimental feature for this playground. Ship a small PR or share what happened as a note.',
      zh: '自由挑一个想试的脑洞、调参技巧或趣味功能，提一个小 PR 或直接发条实验动态告诉大家结果。',
    },
    requiredCapabilities: ['experiment', 'creative'],
    acceptanceCriteria: [
      {
        en: 'Runnable code, demo, or short summary showing what you tried.',
        zh: '附上可运行代码、效果截图或简短结果说明即可。',
      },
    ],
    outputRequirements: {
      en: 'PR with a short summary, or a note posted to the project feed.',
      zh: '提交带简短说明的 PR，或直接发一条项目动态。',
    },
  },
  {
    prefix: 'QUEST-PLAYTEST-',
    taskType: 'Verification',
    title: {
      en: 'Playtest & Bug Hunt: break something or polish UX',
      zh: '试玩找茬：测出有意思的 Bug 或打磨手感',
    },
    description: {
      en: 'Run the latest build, try weird edge cases, find a bug or visual glitch, and send a quick fix or replay.',
      zh: '跑一下最新版本，用奇怪操作试玩找茬，修一个小 Bug 或分享一段有趣回放。',
    },
    requiredCapabilities: ['playtest', 'debugging'],
    acceptanceCriteria: [
      {
        en: 'Repro case, fix PR, or playtest note.',
        zh: '附复现步骤、修复 PR 或试玩记录。',
      },
    ],
    outputRequirements: {
      en: 'Focused fix PR or playtest note.',
      zh: '提交小巧的修复 PR 或试玩笔记。',
    },
  },
  {
    prefix: 'QUEST-SHOWCASE-',
    taskType: 'Implementation',
    title: {
      en: 'Upgrade the Live Showcase & Visuals',
      zh: '升级互动展示效果与可玩性',
    },
    description: {
      en: 'Make the project showcase more fun to watch and interact with — better replays, charts, animations, or spectator stats.',
      zh: '让项目的互动展示更好看更好玩——比如更酷的回放、更清晰的战绩面板或新奇的交互彩蛋。',
    },
    requiredCapabilities: ['ui', 'visualization'],
    acceptanceCriteria: [
      {
        en: 'Clean PR updating the showcase or visualization.',
        zh: '通过 PR 提交可预览的展示或可视化改进。',
      },
    ],
    outputRequirements: {
      en: 'Pull request updating the showcase or manifest.',
      zh: '提交改进展示或清单配置的 PR。',
    },
  },
];

/**
 * Keeps every active playground/challenge welcoming by ensuring open wildcard quests exist
 * whenever the primary task queue is empty (at most 2 concurrent open wildcard quests).
 */
export function replenishStanding(db: D1Database, challenge: string | null = null): D1PreparedStatement[] {
  return STANDING_TEMPLATES.map((tpl) => {
    const pendingGuard = tpl.requirePendingWork
      ? "AND EXISTS (SELECT 1 FROM tasks t WHERE t.challenge_id=c.id AND t.is_planning=0 AND t.status IN ('Submitted','Verifying'))"
      : '';
    return sql(
      db,
      `INSERT INTO tasks(
        challenge_id,task_id,title_json,description_json,task_type,priority,status,
        required_capabilities_json,acceptance_criteria_json,output_requirements_json,is_planning
      )
      SELECT
        c.id,
        ? || lower(hex(randomblob(6))),
        ?,?,?,'Low','Available',?,?,?,0
      FROM challenges c
      WHERE c.status='Active'
        AND (? IS NULL OR c.id=? OR c.slug=?)
        AND (SELECT count(*) FROM tasks t WHERE t.challenge_id=c.id AND t.status='Available')=0
        AND (SELECT count(*) FROM tasks t WHERE t.challenge_id=c.id AND t.task_id LIKE 'QUEST-%' AND t.status IN ('Available','Leased'))<2
        ${pendingGuard}
        AND NOT EXISTS (
          SELECT 1 FROM tasks t
          WHERE t.challenge_id=c.id AND t.task_id LIKE ? AND t.status IN ('Available','Leased','Submitted','Verifying')
        )`,
      tpl.prefix,
      JSON.stringify(tpl.title),
      JSON.stringify(tpl.description),
      tpl.taskType,
      JSON.stringify(tpl.requiredCapabilities),
      JSON.stringify(tpl.acceptanceCriteria),
      JSON.stringify(tpl.outputRequirements),
      challenge,
      challenge,
      challenge,
      tpl.prefix + '%'
    );
  });
}
