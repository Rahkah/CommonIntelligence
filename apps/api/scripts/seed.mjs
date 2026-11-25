import { DEMO_CHALLENGES } from '../../web/src/data/demoData.ts';
import { STARTER_ROADMAP_TASKS } from '../../web/src/data/starterTasks.ts';
import { PHASE0_BASELINE_REPORT } from '../../../packages/grandmaster-engine/src/baselineData.ts';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

export function catalogStatements() {
  const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
  const gmReport = PHASE0_BASELINE_REPORT;
  const gmBaselineRecord = {
    currentBestDisplay: `${gmReport.matchSummary.estimatedElo.toLocaleString()} Elo (v${gmReport.engineVersion})`,
    currentBestValue: gmReport.matchSummary.estimatedElo,
    targetDisplay: '> 3,650 Elo (Stockfish 19)',
    targetValue: 3650,
    lowerBoundDisplay: `${gmReport.matchSummary.opponentAnchorElo.toLocaleString()} Elo`,
    lowerBoundValue: gmReport.matchSummary.opponentAnchorElo,
    scaleStartValue: gmReport.matchSummary.opponentAnchorElo,
    scoreDirection: 'higher',
    scoreUnit: 'Elo',
    attribution: `${gmReport.engineName} v${gmReport.engineVersion} (${gmReport.matchSummary.wins}W-${gmReport.matchSummary.draws}D-${gmReport.matchSummary.losses}L vs ${gmReport.matchSummary.opponent})`,
    recordedAt: gmReport.executedAt.slice(0, 10),
    sourceUrl: 'https://github.com/common-intelligence-org/grandmaster',
    sourceLabel: `Phase 0 Measured Baseline (${gmReport.benchNps.toLocaleString()} NPS)`,
  };
  const gmBaselineHistory = gmReport.eloHistory.map((pt, idx) => ({
    date: pt.recordedAt.slice(0, 10),
    score: pt.elo,
    label: pt.label,
    attribution: pt.version === '0.1.0' ? 'Phase 0 Launch Agent (Grandmaster-CI v0.1.0)' : 'Reference Anchor',
    note: { en: pt.noteEn, zh: pt.noteZh },
    isCurrentRecord: idx === gmReport.eloHistory.length - 1,
  }));

  const challengeSql = DEMO_CHALLENGES.map((c) => {
    const [owner, repo] = new URL(c.githubRepo).pathname.slice(1).split('/');
    // Only Project Grandmaster has a real executed Phase 0 baseline; other challenges remain untouched.
    const record = c.id === 'grandmaster' ? gmBaselineRecord : c.record;
    const history = c.id === 'grandmaster' ? gmBaselineHistory : c.recordHistory;
    const values = [
      c.id,
      c.slug,
      c.name,
      c.status,
      ...[
        c.domain,
        c.tagline,
        c.summary,
        c.background,
        c.ultimateGoal,
        record,
        history,
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
      'INSERT INTO challenges(id,slug,name,status,domain_json,tagline_json,summary_json,background_json,ultimate_goal_json,' +
      'record_info_json,record_history_json,rules_json,scoring_metric_json,verification_method_json,contribution_criteria_json,showcase_json,' +
      'github_repo_owner,github_repo_name,trusted_workflow_name) VALUES (' +
      values.map(quote).join(',') +
      ') ON CONFLICT(id) DO UPDATE SET ' +
      "showcase_json = COALESCE(challenges.showcase_json, excluded.showcase_json), " +
      "record_info_json = CASE WHEN challenges.id='grandmaster' AND json_extract(challenges.record_info_json,'$.currentBestDisplay')='Unrated' THEN excluded.record_info_json ELSE challenges.record_info_json END, " +
      "record_history_json = CASE WHEN challenges.id='grandmaster' AND challenges.record_history_json='[]' THEN excluded.record_history_json ELSE challenges.record_history_json END;"
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
      JSON.stringify(t.requiredCapabilities),
      JSON.stringify(t.acceptanceCriteria),
      JSON.stringify(t.inputArtifacts),
      JSON.stringify(t.outputRequirements),
    ];
    return (
      'INSERT INTO tasks(task_id,challenge_id,title_json,description_json,task_type,priority,status,' +
      'required_capabilities_json,acceptance_criteria_json,input_artifacts_json,output_requirements_json) VALUES (' +
      values.map(quote).join(',') +
      ') ON CONFLICT(task_id) DO NOTHING;'
    );
  });

  const starterDepSql = STARTER_ROADMAP_TASKS.flatMap((t) =>
    t.dependencies.map(
      (dep) =>
        `INSERT INTO task_dependencies(task_id,depends_on_task_id) VALUES (${quote(t.taskId)},${quote(dep)}) ON CONFLICT(task_id,depends_on_task_id) DO NOTHING;`
    )
  );

  // Replace the generic auto-seeded planning placeholder on grandmaster with its concrete phased starter tasks.
  const cleanupSql = [
    "DELETE FROM tasks WHERE challenge_id='grandmaster' AND is_planning=1 AND status='Available';",
  ];

  return [...challengeSql, ...starterTaskSql, ...starterDepSql, ...cleanupSql];
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
