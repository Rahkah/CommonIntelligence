import { DEMO_CHALLENGES } from '../../web/src/data/demoData.ts';
import { STARTER_ROADMAP_TASKS } from '../../web/src/data/starterTasks.ts';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const DEFAULT_CATEGORIES = [
  {
    id: 'challenge',
    name: { en: 'Crowd-Agent Challenge', zh: '众筹 Agent 挑战' },
    description: {
      en: 'Collective multi-agent challenges where AIs team up against tough opponents or shared targets.',
      zh: '汇聚全球 AI Agent 联手攻关或硬刚强敌的众筹挑战类项目。',
    },
    sortOrder: 1,
  },
  {
    id: 'playground',
    name: { en: 'Playground', zh: '游乐场' },
    description: {
      en: 'Open-ended creative sandboxes where independent agents explore, build, and improvise together.',
      zh: '开放式多 Agent 互动游乐场，让 AI 自由发挥创意与协作。',
    },
    sortOrder: 2,
  },
];

export function catalogStatements() {
  const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";

  const categorySql = DEFAULT_CATEGORIES.map((cat) =>
    `INSERT OR IGNORE INTO challenge_categories(id,name_json,description_json,sort_order) VALUES (${quote(cat.id)},${quote(JSON.stringify(cat.name))},${quote(JSON.stringify(cat.description))},${Number(cat.sortOrder)});`
  );

  const challengeSql = DEMO_CHALLENGES.map((c) => {
    const [owner, repo] = new URL(c.githubRepo).pathname.slice(1).split('/');
    const values = [
      c.id,
      c.slug,
      c.name,
      c.category ?? 'challenge',
      c.status,
      ...[
        c.domain,
        c.tagline,
        c.summary,
        c.background,
        c.ultimateGoal,
        c.record,
        c.recordHistory,
        c.rules,
        c.scoringMetric,
        c.verificationMethod,
        c.contributionCriteria,
        c.showcase ?? null,
      ].map((v) => JSON.stringify(v)),
      owner,
      repo,
      repo + '-verifier-v1',
    ];
    return (
      'INSERT INTO challenges(id,slug,name,category,status,domain_json,tagline_json,summary_json,background_json,ultimate_goal_json,' +
      'record_info_json,record_history_json,rules_json,scoring_metric_json,verification_method_json,contribution_criteria_json,showcase_json,' +
      'github_repo_owner,github_repo_name,trusted_workflow_name) VALUES (' +
      values.map(quote).join(',') +
      ') ON CONFLICT(id) DO UPDATE SET ' +
      'tagline_json = excluded.tagline_json, ' +
      'summary_json = excluded.summary_json, ' +
      'domain_json = excluded.domain_json, ' +
      'showcase_json = COALESCE(challenges.showcase_json, excluded.showcase_json);'
    );
  });

  const starterTaskSql = STARTER_ROADMAP_TASKS.map((t) => {
    const values = [
      t.taskId,
      t.challengeId,
      JSON.stringify(t.title),
      JSON.stringify(t.description),
      t.taskType,
      t.priority,
      t.status,
      t.recommendedClass ?? null,
      t.effortTier ?? 'M',
      JSON.stringify(t.supportedModes ?? ['agent']),
      t.deliveryMode ?? 'pr_auto_verify',
      t.outputSchemaKind ?? null,
      t.verificationMode ?? 'pr_auto_verify',
      JSON.stringify(t.requiredCapabilities),
      JSON.stringify(t.acceptanceCriteria),
      JSON.stringify(t.inputArtifacts),
      JSON.stringify(t.outputRequirements),
    ];
    return (
      'INSERT INTO tasks(task_id,challenge_id,title_json,description_json,task_type,priority,status,' +
      'recommended_class,effort_tier,supported_modes_json,delivery_mode,output_schema_kind,verification_mode,' +
      'required_capabilities_json,acceptance_criteria_json,input_artifacts_json,output_requirements_json) VALUES (' +
      values.map((v) => (v === null ? 'NULL' : quote(v))).join(',') +
      ') ON CONFLICT(task_id) DO NOTHING;'
    );
  });

  const starterDepSql = STARTER_ROADMAP_TASKS.flatMap((t) =>
    t.dependencies.map(
      (dep) =>
        `INSERT INTO task_dependencies(task_id,depends_on_task_id) VALUES (${quote(t.taskId)},${quote(dep)}) ON CONFLICT(task_id,depends_on_task_id) DO NOTHING;`
    )
  );

  const cleanupSql = [
    "DELETE FROM challenges WHERE id IN ('open-game','open-language','ai-civilization') AND NOT EXISTS (SELECT 1 FROM contributions WHERE challenge_id=challenges.id);",
    "DELETE FROM tasks WHERE challenge_id IN ('grandmaster','shared-canvas') AND is_planning=1 AND status='Available';",
  ];

  return [...categorySql, ...challengeSql, ...starterTaskSql, ...starterDepSql, ...cleanupSql];
}

const isEntrypoint =
  Boolean(import.meta.main) ||
  (process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === process.argv[1].toLowerCase());
if (isEntrypoint && process.argv.includes('--print')) {
  process.stdout.write(catalogStatements().join('\n') + '\n');
} else if (isEntrypoint) {
  const dir = await mkdtemp(join(tmpdir(), 'ci-catalog-'));
  try {
    const file = join(dir, 'catalog.sql');
    await writeFile(file, catalogStatements().join('\n'));
    const require = createRequire(import.meta.url);
    const cli = join(require.resolve('wrangler/package.json'), '..', 'bin', 'wrangler.js');
    const result = spawnSync(process.execPath, [cli, 'd1', 'execute', 'DB', '--local', '--file', file], {
      stdio: 'inherit',
    });
    process.exitCode = result.status ?? 1;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
