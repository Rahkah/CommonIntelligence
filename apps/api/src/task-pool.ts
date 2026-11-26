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
  taskType: 'Verification' | 'Documentation' | 'Research';
  requirePendingWork?: boolean;
  title: { en: string; zh: string };
  description: { en: string; zh: string };
  requiredCapabilities: string[];
  acceptanceCriteria: Array<{ en: string; zh: string }>;
  outputRequirements: { en: string; zh: string };
}

const STANDING_TEMPLATES: readonly StandingTaskTemplate[] = [
  {
    prefix: 'MAINT-REVIEW-',
    taskType: 'Verification',
    requirePendingWork: true,
    title: {
      en: '[Routine] Review & independently reproduce pending submissions',
      zh: '[常态任务] 评审并独立复现待验收提交与 PR',
    },
    description: {
      en: 'No primary roadmap tasks are currently open. Audit submitted or verifying PRs in this challenge, independently reproduce their build, tests, or benchmarks on a clean checkout, check for edge cases, regressions, or missing metadata, and publish verifiable review evidence or a targeted fix PR.',
      zh: '当前主任务池暂无可认领任务。请查阅本项目处于 Submitted / Verifying 状态的 PR，在干净环境中独立复现其构建、测试或评测结果，排查边界缺陷、性能回退与元数据遗漏，并提交可复现的评审验证报告或修复 PR。',
    },
    requiredCapabilities: ['code-review', 'verification', 'reproduction'],
    acceptanceCriteria: [
      {
        en: 'Independently reproduce at least one pending or recently merged PR with exact commands, commit SHA, and raw logs.',
        zh: '使用明确命令、commit SHA 与原始日志独立复现至少一个待验收或近期合并的 PR。',
      },
      {
        en: 'Submit verifiable review findings, regression tests, or a reproducible counterexample/fix PR passing CI.',
        zh: '通过可过 CI 的 PR 提交可核验的评审结论、回归测试或可复现缺陷/修复。',
      },
    ],
    outputRequirements: {
      en: 'Pull request with IndependentVerification, Counterexample, or FailedApproach metadata, reproduction steps, and limitations.',
      zh: '提交包含 IndependentVerification、Counterexample 或 FailedApproach 元数据、复现步骤与局限性说明的 PR。',
    },
  },
  {
    prefix: 'MAINT-KNOWLEDGE-',
    taskType: 'Documentation',
    title: {
      en: '[Routine] Curate shared knowledge base & lessons-learned ledger',
      zh: '[常态任务] 维护项目共享知识库、实验经验与失败记录',
    },
    description: {
      en: 'No primary roadmap tasks are currently open. Consolidate recent merged PRs, verified benchmark baselines, architecture choices, and refuted dead ends into concise, well-indexed repository documentation so incoming agents inherit verified context without repeating failed paths.',
      zh: '当前主任务池暂无可认领任务。请梳理近期已合并 PR、有效基线数据、关键架构决策与已证伪的失败尝试，沉淀为结构清晰的仓库知识库与避坑经验文档，帮助后续接入的 Agent 快速继承上下文、避免重复踩坑。',
    },
    requiredCapabilities: ['documentation', 'knowledge-curation', 'research'],
    acceptanceCriteria: [
      {
        en: 'Cross-reference verified findings, exact baseline metrics, commit SHAs, and known dead ends or limitations.',
        zh: '准确关联已验证成果、基线指标、commit SHA 以及已知失败路径或局限性。',
      },
      {
        en: 'Keep all repository checks passing with clean, reproducible instructions.',
        zh: '确保文档中的复现指令准确可执行，且仓库所有 CI 检查通过。',
      },
    ],
    outputRequirements: {
      en: 'Pull request updating repository knowledge / lessons-learned documentation with exact references and passing CI.',
      zh: '提交更新仓库知识库与经验总结文档的 PR，附准确引用并通过 CI 检查。',
    },
  },
  {
    prefix: 'MAINT-AUDIT-',
    taskType: 'Verification',
    title: {
      en: '[Routine] Audit baseline reproducibility, test coverage & showcase sync',
      zh: '[常态任务] 巡检基线可复现性、测试覆盖与成果展示同步',
    },
    description: {
      en: 'No primary roadmap tasks are currently open. Re-run the baseline build, deterministic tests, and benchmarks from a clean checkout, check consistency with .common-intelligence/showcase.json, and add missing regression tests or fix drift.',
      zh: '当前主任务池暂无可认领任务。请在干净环境中复测当前基线的构建、确定性测试与基准跑分，核对 .common-intelligence/showcase.json 成果展示数据一致性，并补充薄弱环节的回归测试或修复偏差。',
    },
    requiredCapabilities: ['testing', 'benchmarking', 'verification'],
    acceptanceCriteria: [
      {
        en: 'Run the repository build, test suite, and baseline benchmark cleanly and record reproducible outputs.',
        zh: '完整运行仓库构建、测试集与基线评测，并记录可复现输出。',
      },
      {
        en: 'Submit focused regression tests, showcase data fixes, or verified audit notes via a CI-passing PR.',
        zh: '通过可过 CI 的 PR 提交聚焦回归测试、展示数据修正或可核验巡检记录。',
      },
    ],
    outputRequirements: {
      en: 'Pull request with reproducible baseline audit logs, regression tests, or verified showcase metadata updates.',
      zh: '提交包含基线巡检日志、回归测试或展示配置修正的 PR。',
    },
  },
  {
    prefix: 'MAINT-SYNTHESIS-',
    taskType: 'Research',
    title: {
      en: '[Routine] Synthesize bottleneck analysis & reproducible diagnostic fixtures',
      zh: '[常态任务] 梳理当前瓶颈分析与可复现诊断样例',
    },
    description: {
      en: 'No primary roadmap tasks are currently open. Profile or analyze the current codebase against the challenge target, pinpoint high-leverage bottlenecks, and contribute a small reproducible diagnostic script or fixture to guide upcoming tasks.',
      zh: '当前主任务池暂无可认领任务。请对照项目终极目标剖析当前代码库的核心瓶颈，产出最小可复现诊断脚本、基准样例或分析报告，为下一批攻关任务提供量化依据。',
    },
    requiredCapabilities: ['research', 'profiling', 'analysis'],
    acceptanceCriteria: [
      {
        en: 'Provide concrete, reproducible measurements isolating at least one clear bottleneck or improvement direction.',
        zh: '提供可复现的量化测量结果，明确指出至少一个核心瓶颈或优化方向。',
      },
      {
        en: 'Deliver a self-contained diagnostic fixture, benchmark case, or research note via a CI-passing PR.',
        zh: '通过可过 CI 的 PR 交付独立可运行的诊断样例、基准用例或研究记录。',
      },
    ],
    outputRequirements: {
      en: 'Pull request with reproducible bottleneck measurements, diagnostic fixture, and clear limitations.',
      zh: '提交包含可复现瓶颈测量、诊断样例与局限性说明的 PR。',
    },
  },
];

/**
 * When an active challenge has zero Available tasks (e.g., primary tasks are Leased/Verifying/Pending
 * and planning is waiting on maintainer review of Proposed tasks), automatically schedule a single
 * low-priority routine maintenance task (review, knowledge curation, baseline audit, or bottleneck analysis).
 * Bounded to at most 2 concurrent open (Available/Leased) routine tasks per challenge.
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
        AND (SELECT count(*) FROM tasks t WHERE t.challenge_id=c.id AND t.task_id LIKE 'MAINT-%' AND t.status IN ('Available','Leased'))<2
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
