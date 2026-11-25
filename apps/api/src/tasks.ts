import { Hono } from 'hono';
import { z } from 'zod';
import { bearer, browser, maintainer, type Principal } from './auth';
import { mutate } from './mutations';
import {
  type App,
  type Ctx,
  sql,
  guard,
  field,
  key,
  iso,
  now,
  id,
  random,
  required,
  digest,
  json,
  rate,
  event,
  localized,
  fail,
} from './core';
import { reconcile } from './verification';

const taskTypes = [
  'Research',
  'Search',
  'Implementation',
  'Verification',
  'Counterexample',
  'Optimization',
  'Documentation',
  'Integration',
] as const;
const proposal = z
  .object({
    title: field(180),
    description: field(6000),
    taskType: z.enum(taskTypes),
    priority: z.enum(['Critical', 'High', 'Normal', 'Low']),
    dependencies: z
      .array(key)
      .max(12)
      .refine((x) => new Set(x).size === x.length),
    requiredCapabilities: z.array(field(100)).max(12),
    acceptanceCriteria: z.array(field(1000)).min(1).max(12),
    outputRequirements: field(2000),
  })
  .strict();
const lease = z.object({ agentId: key, leaseToken: z.string().regex(/^ci_lease_[0-9a-f]{64}$/) });
export const work = new Hono<App>();
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
const liveChallenge = (db: D1Database, cid: string) =>
  guard(db, 'CONFLICT', "EXISTS(SELECT 1 FROM challenges WHERE id=? AND status='Active')", cid);
function newProposal(
  db: D1Database,
  p: Principal,
  cid: string,
  b: z.infer<typeof proposal>,
  plan: string | null = null,
  agentId: string | null = null
) {
  const tid = id('task'),
    date = iso();
  const result = {
    ...b,
    taskId: tid,
    challengeId: cid,
    title: localized(b.title),
    description: localized(b.description),
    status: 'Proposed',
    acceptanceCriteria: b.acceptanceCriteria.map(localized),
    outputRequirements: localized(b.outputRequirements),
    inputArtifacts: [],
    assignedAgentId: null,
    leaseExpiresAt: null,
    createdAt: date,
    updatedAt: date,
    planId: plan,
    isPlanning: false,
    proposedByGithubId: p.owner,
    proposedByAgentId: agentId,
  };
  const writes = [
    liveChallenge(db, cid),
    sql(
      db,
      `INSERT INTO tasks(task_id,challenge_id,title_json,description_json,task_type,priority,
    required_capabilities_json,acceptance_criteria_json,output_requirements_json,proposed_by_github_id,plan_id,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      tid,
      cid,
      JSON.stringify(result.title),
      JSON.stringify(result.description),
      b.taskType,
      b.priority,
      JSON.stringify(b.requiredCapabilities),
      JSON.stringify(result.acceptanceCriteria),
      JSON.stringify(result.outputRequirements),
      p.owner,
      plan,
      date,
      date
    ),
    guard(
      db,
      'VALIDATION_ERROR',
      `(SELECT count(*) FROM tasks WHERE challenge_id=? AND task_id IN (SELECT value FROM json_each(?)))=?`,
      cid,
      JSON.stringify(b.dependencies),
      b.dependencies.length
    ),
    sql(
      db,
      'INSERT INTO task_dependencies(task_id,depends_on_task_id) SELECT ?,value FROM json_each(?)',
      tid,
      JSON.stringify(b.dependencies)
    ),
    event(db, 'task_proposed', cid, p.owner, b.title, tid, agentId),
  ];
  return { result, writes };
}
work.post('/api/tasks/propose', async (c) => {
  const p = c.req.header('Authorization') ? await bearer(c, 'tasks:propose') : await browser(c);
  const b = await json(c, proposal.extend({ challengeId: key }));
  return mutate(c, p, async () => {
    await rate(c, (p.token ?? p.owner) + ':propose', 86400, 10);
    return { ...newProposal(c.env.DB, p, b.challengeId, b), status: 201 };
  });
});
work.post('/api/tasks/:id/approve', async (c) => {
  await maintainer(c);
  const tid = c.req.param('id'),
    db = c.env.DB;
  const result = await sql(
    db,
    `UPDATE tasks SET status=CASE WHEN EXISTS(SELECT 1 FROM task_dependencies d JOIN tasks t
    ON t.task_id=d.depends_on_task_id WHERE d.task_id=? AND t.status!='Accepted') THEN 'Pending' ELSE 'Available' END, updated_at=${now}
    WHERE task_id=? AND status='Proposed' AND challenge_id IN (SELECT id FROM challenges WHERE status='Active') RETURNING status,plan_id`,
    tid,
    tid
  ).first<{ status: string; plan_id: string | null }>();
  if (!result) fail(409, 'CONFLICT');
  return c.json({ taskId: tid, status: result.status });
});
work.post('/api/tasks/:id/reject', async (c) => {
  await maintainer(c);
  const tid = c.req.param('id'),
    db = c.env.DB;
  const row = await sql(
    db,
    `UPDATE tasks SET status='Rejected',updated_at=${now} WHERE task_id=? AND status='Proposed' RETURNING plan_id`,
    tid
  ).first<{ plan_id: string | null }>();
  if (!row) fail(409, 'CONFLICT');
  return c.json({ taskId: tid, status: 'Rejected' });
});
work.post('/api/tasks/claim', async (c) => {
  const p = await bearer(c, 'tasks:claim');
  const b = await json(c, z.object({ challengeId: key, agentId: key, taskId: key.optional() }).strict());
  const response = await mutate(c, p, async () => {
    await rate(c, p.token + ':claim', 3600, 10);
    const db = c.env.DB,
      lid = id('lease'),
      token = 'ci_lease_' + random(),
      expires = iso(1800000);
    const hash = await digest(token + required(c.env.TOKEN_PEPPER));
    const candidate = `SELECT t.task_id FROM tasks t WHERE challenge_id=? AND (? IS NULL OR t.task_id=?)
      AND status='Available' AND (is_planning=0 OR EXISTS(SELECT 1 FROM agent_tokens tok,json_each(tok.scopes_json) s
        WHERE tok.id=? AND s.value='tasks:propose')) AND NOT EXISTS(SELECT 1 FROM task_dependencies d JOIN tasks upstream
        ON upstream.task_id=d.depends_on_task_id WHERE d.task_id=t.task_id AND upstream.status!='Accepted')
      ORDER BY is_planning,CASE priority WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 WHEN 'Normal' THEN 2 ELSE 3 END,created_at,task_id LIMIT 1`;
    const filter = [b.challengeId, b.taskId ?? null, b.taskId ?? null, p.token];
    return {
      result: { leaseId: lid, leaseToken: token, leaseExpiresAt: expires },
      writes: [
        expire(db),
        liveChallenge(db, b.challengeId),
        replenish(db, b.challengeId),
        guard(
          db,
          'FORBIDDEN',
          'EXISTS(SELECT 1 FROM agents WHERE id=? AND owner_github_id=?)',
          b.agentId,
          p.owner
        ),
        guard(db, 'LEASE_CONFLICT', 'EXISTS(' + candidate + ')', ...filter),
        guard(
          db,
          'FORBIDDEN',
          `EXISTS(SELECT 1 FROM agent_tokens WHERE id=? AND revoked_at IS NULL AND expires_at>${now} AND tasks_claimed_count<max_total_tasks
        AND (SELECT count(*) FROM task_leases WHERE token_id=? AND status='active')<max_concurrent_tasks)`,
          p.token,
          p.token
        ),
        sql(
          db,
          `INSERT INTO task_leases(id,task_id,agent_id,owner_github_id,token_id,lease_token_hash,expires_at)
        SELECT ?,task_id,?,?,?,?,? FROM (${candidate})`,
          lid,
          b.agentId,
          p.owner,
          p.token,
          hash,
          expires,
          ...filter
        ),
        sql(
          db,
          `INSERT INTO activity_events(id,event_type,challenge_id,actor_github_id,summary_json,task_id,agent_id)
        SELECT ?,'task_claimed',?,owner_github_id,json_object('en','Claimed '||task_id,'zh','已认领 '||task_id),task_id,agent_id
        FROM task_leases WHERE id=?`,
          id('event'),
          b.challengeId,
          lid
        ),
      ],
    };
  });
  const receipt = (await response.json()) as { leaseId: string; leaseToken: string; leaseExpiresAt: string };
  const taskId = await sql(
    c.env.DB,
    'SELECT task_id FROM task_leases WHERE id=?',
    receipt.leaseId
  ).first<string>('task_id');
  return c.json({ ...receipt, taskId });
});
async function leaseContext(c: Ctx, p: Principal, tid: string, b: z.infer<typeof lease>) {
  const db = c.env.DB;
  const row = await sql(
    db,
    `SELECT l.id,l.status,l.expires_at,t.challenge_id,t.is_planning,h.github_repo_owner||'/'||h.github_repo_name repo,
    u.username,a.self_reported_model model FROM task_leases l JOIN tasks t ON t.task_id=l.task_id JOIN challenges h ON h.id=t.challenge_id
    JOIN users u ON u.github_id=l.owner_github_id JOIN agents a ON a.id=l.agent_id
    WHERE l.task_id=? AND l.agent_id=? AND l.owner_github_id=? AND (? IS NULL OR l.token_id=?) AND l.lease_token_hash=?`,
    tid,
    b.agentId,
    p.owner,
    p.token,
    p.token,
    await digest(b.leaseToken + required(c.env.TOKEN_PEPPER))
  ).first<{
    id: string;
    status: string;
    expires_at: string;
    challenge_id: string;
    is_planning: number;
    repo: string;
    username: string;
    model: string;
  }>();
  if (!row) fail(409, 'INVALID_LEASE_TOKEN');
  if (row.status === 'expired' || row.expires_at <= iso()) fail(409, 'LEASE_EXPIRED');
  if (row.status !== 'active') fail(409, 'CONFLICT');
  const active = guard(
    db,
    'LEASE_EXPIRED',
    `EXISTS(SELECT 1 FROM task_leases WHERE id=? AND status='active' AND expires_at>${now})`,
    row.id
  );
  return { ...row, active };
}
work.post('/api/tasks/:id/heartbeat', async (c) => {
  const p = await bearer(c, 'tasks:claim'),
    b = await json(c, lease.strict()),
    tid = c.req.param('id'),
    db = c.env.DB;
  await rate(c, p.token + ':heartbeat', 3600, 120);
  const l = await leaseContext(c, p, tid, b),
    expires = iso(1800000);
  await db.batch([l.active, sql(db, 'UPDATE task_leases SET expires_at=? WHERE id=?', expires, l.id)]);
  return c.json({ taskId: tid, leaseExpiresAt: expires });
});
work.post('/api/tasks/:id/release', async (c) => {
  const p = c.req.header('Authorization') ? await bearer(c, 'tasks:claim') : await browser(c);
  const b = await json(
    c,
    lease.extend({ reason: field(1000), progressNotes: z.string().max(6000).optional() }).strict()
  );
  const tid = c.req.param('id'),
    db = c.env.DB,
    l = await leaseContext(c, p, tid, b);
  const writes = [
    l.active,
    sql(db, `UPDATE task_leases SET status='released',ended_at=${now} WHERE id=?`, l.id),
    sql(
      db,
      `INSERT INTO task_attempts(id,task_id,lease_id,agent_id,owner_github_id,outcome,reason,progress_notes)
      VALUES(?,?,?,?,?,'released',?,?)`,
      id('attempt'),
      tid,
      l.id,
      b.agentId,
      p.owner,
      b.reason,
      b.progressNotes ?? null
    ),
  ];
  if (b.progressNotes)
    writes.push(
      sql(
        db,
        `INSERT INTO research_artifacts(id,challenge_id,task_id,author_github_id,kind,status,title_json,summary_json,method_notes_json)
    VALUES(?,?,?,?,'ResearchNote','Inconclusive',?,?,?)`,
        id('note'),
        l.challenge_id,
        tid,
        p.owner,
        ...[b.reason, b.progressNotes, b.progressNotes].map((x) => JSON.stringify(localized(x)))
      )
    );
  await db.batch(writes);
  return c.json({ taskId: tid, status: 'Available' });
});
work.post('/api/tasks/:id/plan', async (c) => {
  const p = await bearer(c, 'tasks:propose');
  const b = await json(c, lease.extend({ tasks: z.array(proposal).min(1).max(10) }).strict()),
    tid = c.req.param('id'),
    db = c.env.DB;
  return mutate(c, p, async () => {
    const l = await leaseContext(c, p, tid, b);
    if (!l.is_planning) fail(409, 'CONFLICT', 'Expected a planning task.');
    await rate(c, p.token + ':propose', 86400, 10);
    const children = b.tasks.map((x) => newProposal(db, p, l.challenge_id, x, tid, b.agentId));
    return {
      result: { taskId: tid, status: 'Submitted', taskIds: children.map((x) => x.result.taskId) },
      writes: [
        l.active,
        ...children.flatMap((x) => x.writes),
        sql(db, `UPDATE task_leases SET status='submitted',ended_at=${now} WHERE id=?`, l.id),
      ],
    };
  });
});
work.post('/api/tasks/:id/submit', async (c) => {
  const p = await bearer(c, 'tasks:claim'),
    b = await json(
      c,
      lease
        .extend({ prUrl: field(500), headSha: z.string().regex(/^[0-9a-f]{40}$/), summary: field(6000) })
        .strict()
    );
  const tid = c.req.param('id'),
    db = c.env.DB;
  const result = await mutate(c, p, async () => {
    const l = await leaseContext(c, p, tid, b);
    if (l.is_planning) fail(409, 'CONFLICT', 'Submit planning tasks through /plan.');
    const match = b.prUrl.match(/^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/([1-9]\d*)$/);
    if (!match || match[1] !== l.repo || !Number.isSafeInteger(Number(match[2])))
      fail(400, 'VALIDATION_ERROR', 'Expected a pull request in the challenge repository.');
    await rate(c, p.token + ':submit', 3600, 20);
    const number = Number(match[2]),
      pr = id('pr');
    return {
      result: { taskId: tid, status: 'Submitted', prNumber: number },
      writes: [
        l.active,
        guard(
          db,
          'CONFLICT',
          'NOT EXISTS(SELECT 1 FROM pull_requests WHERE repo_full_name=? AND pr_number=?)',
          l.repo,
          number
        ),
        sql(
          db,
          `INSERT INTO pull_requests(id,challenge_id,task_id,repo_full_name,pr_number,pr_url,author_github_id,author_username,
        submitted_by_github_id,head_sha,pr_state,self_reported_agent_id,self_reported_model) VALUES(?,?,?,?,?,?,'','',?,?,'open',?,?)`,
          pr,
          l.challenge_id,
          tid,
          l.repo,
          number,
          b.prUrl,
          p.owner,
          b.headSha,
          b.agentId,
          l.model
        ),
        sql(
          db,
          `INSERT INTO task_attempts(id,task_id,lease_id,agent_id,owner_github_id,outcome,pr_url,head_sha,progress_notes) VALUES(?,?,?,?,?,'submitted',?,?,?)`,
          id('attempt'),
          tid,
          l.id,
          b.agentId,
          p.owner,
          b.prUrl,
          b.headSha,
          b.summary
        ),
        sql(db, `UPDATE task_leases SET status='submitted',ended_at=${now} WHERE id=?`, l.id),
        event(db, 'pr_submitted', l.challenge_id, p.owner, b.summary, tid, b.agentId, pr),
      ],
    };
  });
  await reconcile(db, tid);
  return result;
});

// A contributor may push a revision during review, after the original work lease has ended.
work.post('/api/tasks/:id/revision', async (c) => {
  const p = await bearer(c, 'tasks:claim'),
    db = c.env.DB,
    tid = c.req.param('id');
  const b = await json(
    c,
    lease.extend({ headSha: z.string().regex(/^[0-9a-f]{40}$/), summary: field(6000) }).strict()
  );
  const response = await mutate(c, p, async () => {
    const row = await sql(
      db,
      `SELECT pr.id,pr.pr_url,l.id leaseId,pr.head_sha oldHead,pr.challenge_id
      FROM pull_requests pr JOIN task_leases l ON l.task_id=pr.task_id AND l.agent_id=pr.self_reported_agent_id
      WHERE pr.task_id=? AND pr.submitted_by_github_id=? AND l.status='submitted' AND l.token_id=? AND l.agent_id=? AND l.lease_token_hash=?`,
      tid,
      p.owner,
      p.token,
      b.agentId,
      await digest(b.leaseToken + required(c.env.TOKEN_PEPPER))
    ).first<{ id: string; pr_url: string; leaseId: string; oldHead: string; challenge_id: string }>();
    if (!row) fail(409, 'INVALID_LEASE_TOKEN');
    await rate(c, p.token + ':submit', 3600, 20);
    return {
      result: { taskId: tid, status: 'Submitted', headSha: b.headSha },
      writes: [
        guard(
          db,
          'CONFLICT',
          `EXISTS(SELECT 1 FROM tasks WHERE task_id=? AND status IN ('Verifying','Submitted','Rejected'))
        AND EXISTS(SELECT 1 FROM pull_requests WHERE id=? AND head_sha=? AND head_sha!=?)
        AND NOT EXISTS(SELECT 1 FROM merged_evidence e JOIN pull_requests pr ON pr.repo_full_name=e.repo AND pr.pr_number=e.number
          WHERE pr.id=? AND e.head!=?)`,
          tid,
          row.id,
          row.oldHead,
          b.headSha,
          row.id,
          b.headSha
        ),
        sql(db, `UPDATE pull_requests SET head_sha=?,updated_at=${now} WHERE id=?`, b.headSha, row.id),
        sql(db, `UPDATE tasks SET status='Submitted',updated_at=${now} WHERE task_id=?`, tid),
        sql(
          db,
          `INSERT INTO task_attempts(id,task_id,lease_id,agent_id,owner_github_id,outcome,pr_url,head_sha,progress_notes)
        VALUES(?,?,?,?,?,'submitted',?,?,?)`,
          id('attempt'),
          tid,
          row.leaseId,
          b.agentId,
          p.owner,
          row.pr_url,
          b.headSha,
          b.summary
        ),
        event(db, 'pr_submitted', row.challenge_id, p.owner, b.summary, tid, b.agentId, row.id),
      ],
    };
  });
  await reconcile(db, tid);
  return response;
});
