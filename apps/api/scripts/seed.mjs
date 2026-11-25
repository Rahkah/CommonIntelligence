import { DEMO_CHALLENGES } from '../../web/src/data/demoData.ts';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

export function catalogStatements() {
  const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
  return DEMO_CHALLENGES.map((c) => {
    const [owner, repo] = new URL(c.githubRepo).pathname.slice(1).split('/');
    // The chess rating and history in the demo belong to fictional contributors.
    const record =
      c.id === 'grandmaster'
        ? {
            currentBestDisplay: 'Unrated',
            targetDisplay: c.record.targetDisplay,
            targetValue: c.record.targetValue,
            scoreDirection: 'higher',
            scoreUnit: 'Elo',
            attribution: '',
            recordedAt: '',
            sourceUrl: c.record.sourceUrl,
            sourceLabel: c.record.sourceLabel,
          }
        : c.record;
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
        c.id === 'grandmaster' ? [] : c.recordHistory,
        c.rules,
        c.scoringMetric,
        c.verificationMethod,
        c.contributionCriteria,
      ].map((v) => JSON.stringify(v)),
      owner,
      repo,
      c.id === 'project-5904' ? 'superperm-verifier-v1.0.0' : repo + '-verifier-v1',
    ];
    return (
      'INSERT INTO challenges(id,slug,name,status,domain_json,tagline_json,summary_json,background_json,ultimate_goal_json,' +
      'record_info_json,record_history_json,rules_json,scoring_metric_json,verification_method_json,contribution_criteria_json,' +
      'github_repo_owner,github_repo_name,trusted_workflow_name) VALUES (' +
      values.map(quote).join(',') +
      ') ON CONFLICT(id) DO NOTHING;'
    );
  });
}
if (import.meta.main && process.argv.includes('--print')) {
  process.stdout.write(catalogStatements().join('\n') + '\n');
} else if (import.meta.main) {
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
