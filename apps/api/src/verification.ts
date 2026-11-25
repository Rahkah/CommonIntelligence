import { Hono } from 'hono';
import { z } from 'zod';
import { type App, sql, utf8, hex, required, fail, field, key, id, now } from './core';

const sha = z.string().regex(/^[a-f0-9]{40}$/);
const repoName = z.string().regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/);
const kinds = [
  'RecordImprovement',
  'SearchAlgorithm',
  'PruningStrategy',
  'Optimization',
  'MathematicalLemma',
  'VerifiedSearchRegion',
  'Counterexample',
  'IndependentVerification',
  'CandidateStructure',
  'FailedApproach',
] as const;
const runSchema = z.object({
  id: z.number().int().positive(),
  name: field(256),
  head_sha: sha,
  app: z.object({ slug: z.string(), id: z.number() }),
  conclusion: z.string().nullable(),
  completed_at: z.iso.datetime({ offset: true }).nullable(),
  output: z.object({ summary: z.string().nullable() }).optional(),
});
const mergedSchema = z.object({
  number: z.number().int().positive(),
  merged: z.literal(true),
  head: z.object({ sha }),
  base: z.object({ ref: z.string() }),
  merge_commit_sha: sha,
  user: z.object({ id: z.number().int().positive() }),
  merged_by: z.object({ id: z.number().int().positive() }).nullable(),
  labels: z.array(z.object({ name: z.string() })),
  body: z.string().nullable(),
});
function metadata(body: string, name: string) {
  return body.match(new RegExp('^(?:-\\s*)?' + name + ':[ \\t]*([^\\r\\n]*)', 'im'))?.[1]?.trim() ?? '';
}
function section(body: string, name: string) {
  return (
    body.match(
      new RegExp('^##[ \\t]+' + name + '[^\\n]*\\n([\\s\\S]*?)(?=\\n## |$(?![\\s\\S]))', 'im')
    )?.[1] ?? ''
  )
    .trim()
    .slice(0, 6000);
}
function evidence(db: D1Database, repo: string, workflow: string, input: unknown) {
  const parsed = runSchema.safeParse(input);
  if (!parsed.success) return null;
  const r = parsed.data;
  if (
    r.name !== workflow ||
    r.app.slug !== 'github-actions' ||
    r.app.id !== 15368 ||
    !r.completed_at ||
    !r.conclusion
  )
    return null;
  const conclusion = ['success', 'failure', 'cancelled', 'timed_out'].includes(r.conclusion)
    ? r.conclusion
    : 'failure';
  return sql(
    db,
    `INSERT INTO check_evidence(run_id,repo,head,name,conclusion,summary,completed_at) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(run_id) DO UPDATE SET conclusion=excluded.conclusion,summary=excluded.summary,completed_at=excluded.completed_at
    WHERE excluded.completed_at>=check_evidence.completed_at`,
    r.id,
    repo,
    r.head_sha,
    r.name,
    conclusion,
    r.output?.summary?.slice(0, 6000) ?? '',
    new Date(r.completed_at).toISOString()
  );
}
function reconcileWrites(db: D1Database, tid: string) {
  return [
    sql(
      db,
      `INSERT INTO verification_runs(id,pull_request_id,github_check_run_id,workflow_name,verifier_version,head_sha,conclusion,summary_text,metrics_json,completed_at)
      SELECT 'run_'||e.run_id,p.id,CAST(e.run_id AS TEXT),e.name,e.name,e.head,e.conclusion,e.summary,
        CASE WHEN json_valid(e.summary) THEN e.summary ELSE '{}' END,e.completed_at
      FROM pull_requests p JOIN challenges h ON h.id=p.challenge_id JOIN check_evidence e
        ON e.repo=p.repo_full_name AND e.head=p.head_sha AND e.name=h.trusted_workflow_name WHERE p.task_id=?
      ON CONFLICT(github_check_run_id) DO UPDATE SET conclusion=excluded.conclusion,summary_text=excluded.summary_text,
        metrics_json=excluded.metrics_json,completed_at=excluded.completed_at WHERE verification_runs.pull_request_id=excluded.pull_request_id`,
      tid
    ),
    sql(
      db,
      `INSERT OR IGNORE INTO activity_events(id,event_type,challenge_id,actor_github_id,task_id,pull_request_id,summary_json)
      SELECT 'check_'||v.id||'_'||v.conclusion,CASE v.conclusion WHEN 'success' THEN 'verification_passed' ELSE 'verification_failed' END,
        p.challenge_id,p.submitted_by_github_id,p.task_id,p.id,json_object('en',v.conclusion,'zh',v.conclusion)
        FROM pull_requests p JOIN verification_runs v ON v.pull_request_id=p.id AND v.head_sha=p.head_sha WHERE p.task_id=?`,
      tid
    ),
    sql(
      db,
      `UPDATE tasks SET status=(SELECT CASE v.conclusion WHEN 'success' THEN 'Verifying' ELSE 'Rejected' END
      FROM verification_runs v JOIN pull_requests p ON p.id=v.pull_request_id AND p.head_sha=v.head_sha WHERE p.task_id=tasks.task_id
      ORDER BY v.completed_at DESC,CAST(v.github_check_run_id AS INTEGER) DESC LIMIT 1),updated_at=${now} WHERE task_id=?
      AND status IN ('Submitted','Verifying','Rejected') AND EXISTS(SELECT 1 FROM verification_runs v JOIN pull_requests p
        ON p.id=v.pull_request_id AND p.head_sha=v.head_sha WHERE p.task_id=tasks.task_id)`,
      tid
    ),
    sql(
      db,
      `UPDATE pull_requests AS p SET (author_github_id,author_username,merge_commit_sha,pr_state,contribution_type,parsed_parents_json,merged_at)=
      (SELECT e.github_id,coalesce((SELECT username FROM users WHERE github_id=e.github_id),''),e.merge_sha,'merged',e.kind,e.parents,coalesce(p.merged_at,${now})
      FROM merged_evidence e WHERE e.repo=p.repo_full_name AND e.number=p.pr_number AND e.head=p.head_sha)
      WHERE task_id=? AND EXISTS(SELECT 1 FROM merged_evidence e WHERE e.repo=p.repo_full_name AND e.number=p.pr_number AND e.head=p.head_sha)`,
      tid
    ),
    sql(
      db,
      `INSERT INTO contributions(id,challenge_id,task_id,pull_request_id,verification_run_id,contributor_github_id,title_json,contribution_type,
      summary_json,status,self_reported_agent_model,merge_commit_sha,verifier_version)
      SELECT ?,challenge_id,task_id,pr_id,run_id,github_id,title_json,kind,json_object('en',summary,'zh',summary),
      CASE kind WHEN 'FailedApproach' THEN 'Refuted' WHEN 'IndependentVerification' THEN 'Reproduced' ELSE 'Verified' END,
      self_reported_model,merge_sha,verifier_version FROM eligible_contributions WHERE task_id=? LIMIT 1`,
      id('contrib'),
      tid
    ),
  ];
}
export async function reconcile(db: D1Database, tid: string) {
  await db.batch(reconcileWrites(db, tid));
}

export const hooks = new Hono<App>();
hooks.post('/webhooks/github', async (c) => {
  const bytes = await c.req.arrayBuffer(),
    signature = c.req.header('X-Hub-Signature-256')?.match(/^sha256=([0-9a-f]{64})$/)?.[1];
  if (!signature) fail(401, 'INVALID_WEBHOOK_SIGNATURE');
  const secret = await crypto.subtle.importKey(
    'raw',
    utf8(required(c.env.GITHUB_WEBHOOK_SECRET)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  if (
    !(await crypto.subtle.verify(
      'HMAC',
      secret,
      Uint8Array.from(signature.match(/../g)!, (v) => parseInt(v, 16)),
      bytes
    ))
  )
    fail(401, 'INVALID_WEBHOOK_SIGNATURE');
  const delivery = key.parse(c.req.header('X-GitHub-Delivery')),
    type = key.parse(c.req.header('X-GitHub-Event')),
    db = c.env.DB;
  const duplicate = () => sql(db, 'SELECT 1 FROM webhook_deliveries WHERE delivery_id=?', delivery).first();
  if (await duplicate()) return c.json({ duplicate: true });
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    fail(400, 'VALIDATION_ERROR');
  }
  const b = z
    .object({
      action: z.string().optional(),
      repository: z.object({ full_name: repoName, default_branch: z.string().optional() }),
      check_run: z.unknown().optional(),
      pull_request: z.unknown().optional(),
      check_suite: z.unknown().optional(),
    })
    .parse(payload);
  const repo = b.repository.full_name;
  const config = await sql(
    db,
    "SELECT trusted_workflow_name name FROM challenges WHERE github_repo_owner||'/'||github_repo_name=?",
    repo
  ).first<{ name: string }>();
  const writes: D1PreparedStatement[] = [];
  let head: string | undefined, number: number | undefined;
  if (config && type === 'pull_request' && b.action === 'closed') {
    const parsed = mergedSchema.safeParse(b.pull_request);
    if (parsed.success && parsed.data.base.ref === b.repository.default_branch) {
      const pr = parsed.data,
        body = pr.body ?? '',
        kind = z.enum(kinds).safeParse(metadata(body, 'Contribution Type'));
      const parentText = metadata(body, 'Parent Contributions');
      const parents =
        !parentText || /^none$/i.test(parentText)
          ? []
          : [...new Set(parentText.split(',').map((v) => v.trim()))];
      if (kind.success && parents.length <= 32) {
        number = pr.number;
        writes.push(
          sql(
            db,
            `INSERT INTO merged_evidence(repo,number,head,merge_sha,github_id,task_id,agent_id,kind,parents,reviewer_id,reviewed,method,limitations)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(repo,number) DO NOTHING`,
            repo,
            number,
            pr.head.sha,
            pr.merge_commit_sha,
            String(pr.user.id),
            metadata(body, 'Task ID'),
            metadata(body, 'Agent ID'),
            kind.data,
            JSON.stringify(parents),
            pr.merged_by ? String(pr.merged_by.id) : null,
            Number(pr.labels.some((l) => l.name === 'verified-acceptance')),
            section(body, 'Method') || section(body, 'Reproduction Steps'),
            section(body, '(?:Clean-Room & )?Limitations')
          )
        );
      }
    }
  }
  if (config && b.action === 'completed' && type === 'check_run') {
    const w = evidence(db, repo, config.name, b.check_run);
    if (w) {
      writes.push(w);
      head = runSchema.parse(b.check_run).head_sha;
    }
  }
  if (config && b.action === 'completed' && type === 'check_suite') {
    const suite = z
      .object({ id: z.number().int().positive(), head_sha: sha, app: z.object({ id: z.number() }) })
      .parse(b.check_suite);
    if (suite.app.id === 15368) {
      const r = await fetch(
        `https://api.github.com/repos/${repo}/check-suites/${suite.id}/check-runs?per_page=100&check_name=${encodeURIComponent(config.name)}`,
        { headers: { 'User-Agent': 'CommonIntelligence', Accept: 'application/vnd.github+json' } }
      );
      if (!r.ok) fail(503, 'INTERNAL_ERROR', 'GitHub check lookup unavailable. Retry this delivery.');
      const { check_runs } = z.object({ check_runs: z.array(z.unknown()).max(100) }).parse(await r.json());
      for (const run of check_runs) {
        const data = runSchema.safeParse(run);
        if (data.success && data.data.head_sha === suite.head_sha) {
          const w = evidence(db, repo, config.name, run);
          if (w) writes.push(w);
        }
      }
      head = suite.head_sha;
    }
  }
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  // Save evidence and its delivery together. Reconcile after commit so concurrent submit and webhook cannot both miss each other.
  try {
    await db.batch([
      sql(
        db,
        `INSERT INTO webhook_deliveries(delivery_id,event_name,action,repo_full_name,payload_sha256,status)
      VALUES(?,?,?,?,?,?)`,
        delivery,
        type,
        b.action ?? null,
        repo,
        hex(hash),
        writes.length ? 'processed' : 'ignored'
      ),
      ...writes,
    ]);
  } catch (err) {
    if (!(await duplicate())) throw err;
    return c.json({ duplicate: true });
  }
  if (head || number) {
    const rows = await sql(
      db,
      'SELECT task_id FROM pull_requests WHERE repo_full_name=? AND (head_sha=? OR pr_number=?)',
      repo,
      head ?? null,
      number ?? null
    ).all<{ task_id: string }>();
    for (const row of rows.results) await reconcile(db, row.task_id);
  }
  return c.json({ processed: writes.length > 0 });
});
