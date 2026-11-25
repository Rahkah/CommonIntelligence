import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import { createHmac, randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { app, sweep } from '../src/index';
import { catalogStatements } from '../scripts/seed.mjs';

const origin = 'http://localhost:8787';
const sha = '8'.repeat(40),
  mergeSha = '9'.repeat(40);
let proxy,
  env,
  dir,
  db,
  admin,
  seq = 1000;
const query = (s, ...args) => db.prepare(s).bind(...args);
const count = (table) => db.prepare('SELECT count(*) n FROM ' + table).first('n');

async function request(path, { body, headers = {}, method = body === undefined ? 'GET' : 'POST' } = {}) {
  return app.request(
    origin + path,
    {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env
  );
}
async function ok(response, status = 200) {
  const r = await response,
    body = await r.text();
  expect(r.status, body).toBe(status);
  return body ? JSON.parse(body) : null;
}
async function login() {
  const uid = ++seq;
  const start = await request('/auth/github');
  expect(start.status).toBe(302);
  const state = new URL(start.headers.get('Location')).searchParams.get('state');
  const stateCookie = start.headers.get('set-cookie').split(';')[0];
  const finish = await request('/auth/github/callback?state=' + state + '&code=' + uid, {
    headers: { cookie: stateCookie },
  });
  expect(finish.status).toBe(302);
  const cookie = finish.headers.getSetCookie().find((x) => x.startsWith('ci_session='));
  expect(cookie).toMatch(/HttpOnly/i);
  expect(cookie).toMatch(/Secure/i);
  const session = cookie.split(';')[0],
    me = await ok(request('/api/me', { headers: { cookie: session } }));
  expect(me.user.githubId).toBe(String(uid));
  return { uid, headers: { cookie: session, Origin: origin, 'X-CSRF-Token': me.csrfToken } };
}
async function agent(user, maxConcurrentTasks = 3) {
  const minted = await ok(
    request('/api/agent-tokens', {
      headers: user.headers,
      body: {
        name: 'integration',
        expiresInDays: 1,
        maxConcurrentTasks,
        maxTotalTasks: 50,
        scopes: ['agent:register', 'tasks:claim', 'tasks:propose', 'tasks:read', 'knowledge:read'],
      },
    }),
    201
  );
  const headers = { Authorization: 'Bearer ' + minted.plaintextToken };
  const a = await ok(
    request('/api/agents/register', {
      headers,
      body: {
        label: 'test researcher',
        selfReportedModel: 'test',
        selfReportedClient: 'test',
        challengeId: 'grandmaster',
      },
    }),
    201
  );
  return { id: a.id, token: minted, headers, user };
}
const text = (s) => ({ en: s, zh: s });
function proposal(title = 'Reproduce the baseline', dependencies = []) {
  return {
    title,
    description: 'Measure a pinned baseline and publish results.',
    taskType: 'Verification',
    priority: 'Normal',
    requiredCapabilities: [],
    acceptanceCriteria: ['Publish reproducible results'],
    dependencies,
    outputRequirements: 'Report and log',
  };
}
async function challenge() {
  const slug = 'study-' + ++seq;
  await ok(
    request('/api/challenges', {
      headers: admin.headers,
      body: {
        slug,
        name: slug,
        domain: text('science'),
        summary: text('test'),
        goal: text('reproduce'),
        verificationMethod: text('independent replication'),
        rules: [text('include evidence')],
        githubRepo: 'https://github.com/example/' + slug,
        trustedCheckName: 'verify',
        targetDisplay: 'replication',
      },
    }),
    201
  );
  return slug;
}
const claim = (a, cid, tid, extra = {}) =>
  request('/api/tasks/claim', {
    headers: { ...a.headers, ...extra },
    body: { agentId: a.id, challengeId: cid, taskId: tid },
  });
const prop = (a, cid, b) =>
  request('/api/tasks/propose', { headers: a.headers, body: { ...b, challengeId: cid } });
const approve = (task, who = admin) =>
  request('/api/tasks/' + task + '/approve', { headers: who.headers, body: {} });
const submit = (x, opts = {}, extra = {}) =>
  request('/api/tasks/' + x.tid + '/submit', {
    headers: { ...x.a.headers, ...extra },
    body: {
      agentId: x.a.id,
      leaseToken: x.lease.leaseToken,
      headSha: sha,
      prUrl: 'https://github.com/example/' + x.cid + '/pull/1',
      summary: 'Reproducible result',
      ...opts,
    },
  });
async function research() {
  const cid = await challenge(),
    u = await login(),
    a = await agent(u);
  const task = await ok(prop(a, cid, proposal()), 201);
  await ok(approve(task.taskId));
  const lease = await ok(claim(a, cid, task.taskId));
  return { cid, a, tid: task.taskId, lease };
}
function signed(type, payload, delivery = randomUUID(), valid = true) {
  const signature = createHmac('sha256', env.GITHUB_WEBHOOK_SECRET)
    .update(JSON.stringify(payload))
    .digest('hex');
  return request('/webhooks/github', {
    headers: {
      'X-GitHub-Event': type,
      'X-GitHub-Delivery': delivery,
      'X-Hub-Signature-256': 'sha256=' + (valid ? signature : '0'.repeat(64)),
    },
    body: payload,
  });
}
function check(x, conclusion = 'success', head = sha) {
  return {
    repository: { full_name: 'example/' + x.cid },
    action: 'completed',
    check_run: {
      id: ++seq,
      name: 'verify',
      head_sha: head,
      app: { slug: 'github-actions', id: 15368 },
      completed_at: new Date().toISOString(),
      conclusion,
      output: { summary: 'Independent run' },
    },
  };
}
function merged(x, kind = 'FailedApproach', owner = x.a.user.uid) {
  return {
    repository: { full_name: 'example/' + x.cid, default_branch: 'main' },
    action: 'closed',
    pull_request: {
      number: 1,
      head: { sha },
      base: { ref: 'main' },
      merged: true,
      merge_commit_sha: mergeSha,
      user: { id: owner },
      merged_by: { id: admin.uid },
      labels: [{ name: 'verified-acceptance' }],
      body: `- Task ID: ${x.tid}\n- Agent ID: ${x.a.id}\n- Contribution Type: ${kind}\n- Parent Contributions: None\n## Method\nReplication on a pinned baseline\n## Limitations\nOne configuration`,
    },
  };
}
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ci-d1-test-'));
  const configPath = join(dir, 'wrangler.json'),
    persist = join(dir, 'state');
  await writeFile(
    configPath,
    JSON.stringify({
      name: 'ci-test',
      compatibility_date: '2026-11-25',
      d1_databases: [
        {
          binding: 'DB',
          database_name: 'test',
          database_id: '00000000-0000-4000-8000-000000000001',
          migrations_dir: resolve('../../docs/backend/migrations'),
        },
      ],
    })
  );
  const require = createRequire(import.meta.url);
  execFileSync(
    process.execPath,
    [
      join(require.resolve('wrangler/package.json'), '..', 'bin', 'wrangler.js'),
      'd1',
      'migrations',
      'apply',
      'DB',
      '--local',
      '--persist-to',
      persist,
      '--config',
      configPath,
    ],
    { stdio: 'pipe', env: { ...process.env, CI: '1' } }
  );
  proxy = await getPlatformProxy({
    configPath,
    persist: { path: join(persist, 'v3') },
    remoteBindings: false,
  });
  db = proxy.env.DB;
  await db.batch(catalogStatements().map((s) => db.prepare(s)));
  env = {
    DB: db,
    APP_ORIGIN: origin,
    TOKEN_PEPPER: randomUUID(),
    SESSION_SECRET: randomUUID(),
    GITHUB_WEBHOOK_SECRET: randomUUID(),
    GITHUB_CLIENT_ID: 'test',
    GITHUB_CLIENT_SECRET: randomUUID(),
    ASSETS: {
      fetch: async (r) => {
        const path = new URL(r.url).pathname;
        if (path.endsWith('join.txt'))
          return new Response(await readFile(resolve('../web/public' + path)), {
            headers: { 'content-type': 'text/plain' },
          });
        return new Response('<html>Common Intelligence</html>', { headers: { 'content-type': 'text/html' } });
      },
    },
  };
  const original = globalThis.fetch;
  vi.stubGlobal('fetch', async (url, init) => {
    if (String(url) === 'https://github.com/login/oauth/access_token')
      return Response.json({ access_token: init.body.get('code') });
    if (String(url) === 'https://api.github.com/user') {
      const id = Number(init.headers.Authorization.slice(7));
      return Response.json({
        id,
        login: 'user' + id,
        name: null,
        avatar_url: 'https://github.com/user.png',
        html_url: 'https://github.com/user' + id,
      });
    }
    return original(url, init);
  });
  admin = await login();
  await query("UPDATE users SET role='maintainer' WHERE github_id=?", String(admin.uid)).run();
}, 60000);
afterAll(async () => {
  vi.unstubAllGlobals();
  await proxy?.dispose();
  if (dir) await rm(dir, { recursive: true, force: true });
});

it('runs the planner, two independent agents, PR proof, honors, dead ends, and dependency unlock end to end', async () => {
  expect((await request('/')).status).toBe(200);
  const catalog = await ok(request('/api/challenges'));
  expect(catalog.total).toBe(3);
  expect(catalog.items.map((c) => c.slug).sort()).toEqual(['grandmaster', 'open-game', 'open-language']);
  expect(catalog.items.filter((c) => c.status === 'Active')).toHaveLength(1);
  expect(catalog.items.find((c) => c.id === 'grandmaster').record.currentBestValue).toBeUndefined();
  expect((await ok(request('/api/challenges/grandmaster/progress'))).tasksByStatus.Available).toBe(2);
  expect(await (await request('/challenges/grandmaster/join.txt')).text()).toContain('leaseToken');
  const a = await agent(await login()),
    b = await agent(await login()),
    cid = await challenge();
  const plan = await ok(claim(a, cid));
  const route = '/api/tasks/' + plan.taskId + '/plan';
  const body = {
    agentId: a.id,
    leaseToken: plan.leaseToken,
    tasks: [proposal('First approach'), proposal('Cross-check')],
  };
  const idem = { 'Idempotency-Key': randomUUID(), ...a.headers };
  const packet = await ok(request(route, { headers: idem, body }));
  expect(await ok(request(route, { headers: idem, body }))).toEqual(packet);
  const [tid, other] = packet.taskIds;
  expect((await claim(b, cid, tid)).status).toBe(409);
  await ok(approve(tid));
  await ok(approve(other));
  expect((await ok(request('/api/tasks/' + plan.taskId))).status).toBe('Accepted');
  const waiting = await ok(prop(b, cid, proposal('Follow-up', [tid])), 201);
  expect((await ok(approve(waiting.taskId))).status).toBe('Pending');
  const leases = await Promise.all([ok(claim(a, cid)), ok(claim(b, cid))]);
  expect(new Set(leases.map((l) => l.taskId)).size).toBe(2);
  const index = leases.findIndex((l) => l.taskId === tid),
    worker = [a, b][index],
    lease = leases[index];
  expect(
    (
      await ok(
        request('/api/tasks/' + tid + '/heartbeat', {
          headers: worker.headers,
          body: { agentId: worker.id, leaseToken: lease.leaseToken },
        })
      )
    ).taskId
  ).toBe(tid);
  const submitted = {
    agentId: worker.id,
    leaseToken: lease.leaseToken,
    headSha: sha,
    prUrl: 'https://github.com/example/' + cid + '/pull/1',
    summary: 'Independent negative result',
  };
  await ok(request('/api/tasks/' + tid + '/submit', { headers: worker.headers, body: submitted }));
  const x = { cid, a: worker, tid };
  const pr = merged(x),
    run = check(x);
  await ok(signed('check_run', run));
  expect(await count('credentials')).toBe(0);
  await ok(signed('pull_request', pr));
  const k = await ok(
    request('/api/knowledge?challengeId=' + cid + '&status=Refuted', { headers: b.headers })
  );
  expect(k.items[0]).toMatchObject({
    status: 'Refuted',
    kind: 'FailedApproach',
    taskId: tid,
    prUrl: submitted.prUrl,
    methodNotes: text('Replication on a pinned baseline'),
  });
  expect((await ok(request('/api/tasks/' + waiting.taskId))).status).toBe('Available');
  const profile = await ok(request('/api/contributors/user' + worker.user.uid));
  expect(profile.badges.map((b) => b.code)).toContain('first_discovery');
  expect(profile.badges.find((b) => b.code === 'founding_contributor').serialNumber).toBe(1);
  const credential = profile.credentials[0];
  expect((await ok(request('/api/credentials/' + credential.id))).commitSha).toBe(mergeSha);
  for (const path of [
    '/api/credentials/' + credential.id + '.svg',
    '/api/badges/' + worker.user.uid + '.svg',
  ]) {
    const r = await request(path);
    expect(r.headers.get('Content-Security-Policy')).toContain('sandbox');
    expect(await r.text()).toContain('<svg');
  }
  await ok(
    request('/api/agent-tokens/' + worker.token.token.id, { headers: worker.user.headers, method: 'DELETE' }),
    204
  );
  expect((await claim(worker, cid, waiting.taskId)).status).toBe(401);
  expect((await ok(request('/api/credentials/' + credential.id))).status).toBe('Verified');
}, 30000);

it('grants only one of five racing claims for a task', async () => {
  const cid = await challenge(),
    workers = await Promise.all(Array.from({ length: 5 }, async () => agent(await login())));
  const tid = (await ok(request('/api/tasks?challengeId=' + cid))).items[0].taskId;
  const results = await Promise.all(workers.map((a) => claim(a, cid, tid)));
  expect(results.filter((r) => r.status === 200)).toHaveLength(1);
  for (const r of results.filter((r) => r.status !== 200))
    expect((await r.json()).code).toBe('LEASE_CONFLICT');
  expect(
    await query("SELECT count(*) n FROM task_leases WHERE task_id=? AND status='active'", tid).first('n')
  ).toBe(1);
});
it('sweeps expiry, records an attempt, and bounds open planning tasks', async () => {
  const x = await research();
  await query("UPDATE task_leases SET expires_at='2000-01-01' WHERE id=?", x.lease.leaseId).run();
  await sweep(db);
  await sweep(db);
  expect((await ok(request('/api/tasks/' + x.tid))).status).toBe('Available');
  expect(
    await query(
      "SELECT count(*) n FROM task_attempts WHERE lease_id=? AND outcome='expired'",
      x.lease.leaseId
    ).first('n')
  ).toBe(1);
  expect(
    await query('SELECT count(*) n FROM tasks WHERE challenge_id=? AND is_planning=1', x.cid).first('n')
  ).toBe(1);
});
it('protects a replacement lease from the expired holder', async () => {
  const x = await research(),
    b = await agent(await login());
  await query("UPDATE task_leases SET expires_at='2000-01-01' WHERE id=?", x.lease.leaseId).run();
  const replacement = await ok(claim(b, x.cid, x.tid));
  expect((await (await submit(x)).json()).code).toBe('LEASE_EXPIRED');
  expect(await query('SELECT status FROM task_leases WHERE id=?', replacement.leaseId).first('status')).toBe(
    'active'
  );
});
it('replays the same submission or claim without a second write and rejects key reuse', async () => {
  const x = await research(),
    headers = { 'Idempotency-Key': randomUUID() };
  const [r1, r2] = await Promise.all([ok(submit(x, {}, headers)), ok(submit(x, {}, headers))]);
  expect(r1).toEqual(r2);
  expect((await (await submit(x, { summary: 'changed' }, headers)).json()).code).toBe('IDEMPOTENCY_CONFLICT');
  expect((await (await submit(x)).json()).code).toBe('CONFLICT');
  const cid = await challenge(),
    key = { 'Idempotency-Key': randomUUID() };
  const claims = await Promise.all([
    ok(claim(x.a, cid, undefined, key)),
    ok(claim(x.a, cid, undefined, key)),
  ]);
  expect(claims[0]).toEqual(claims[1]);
  expect(
    await query('SELECT response_body FROM idempotency_keys WHERE key=?', key['Idempotency-Key']).first(
      'response_body'
    )
  ).not.toContain(claims[0].leaseToken);
});
it('accepts out-of-order evidence, including events before submit, once only', async () => {
  const x = await research(),
    delivery = randomUUID(),
    pr = merged(x);
  await ok(signed('pull_request', pr, delivery));
  await ok(signed('check_run', check(x)));
  await ok(submit(x));
  expect((await ok(request('/api/tasks/' + x.tid))).status).toBe('Accepted');
  const counts = await Promise.all(
    ['contributions', 'credentials', 'user_badges', 'activity_events'].map(count)
  );
  expect(await ok(signed('pull_request', pr, delivery))).toEqual({ duplicate: true });
  await ok(signed('pull_request', pr));
  expect(
    await Promise.all(['contributions', 'credentials', 'user_badges', 'activity_events'].map(count))
  ).toEqual(counts);
});
it('rejects an invalid webhook signature before writing', async () => {
  const n = await count('webhook_deliveries');
  expect((await signed('ping', {}, randomUUID(), false)).status).toBe(401);
  expect(await count('webhook_deliveries')).toBe(n);
});
it('requires a passing trusted check for the exact SHA', async () => {
  const x = await research();
  await ok(submit(x));
  await ok(signed('check_run', check(x, 'success', 'f'.repeat(40))));
  await ok(signed('check_run', check(x, 'failure')));
  await ok(signed('pull_request', merged(x)));
  expect((await ok(request('/api/tasks/' + x.tid))).status).toBe('Rejected');
  expect((await ok(request('/api/contributions?challengeId=' + x.cid))).total).toBe(0);
  expect((await ok(request('/api/activity?challengeId=' + x.cid + '&type=verification_failed'))).total).toBe(
    1
  );
});
it('requires the PR author to match the submission owner', async () => {
  const x = await research();
  await ok(submit(x));
  await ok(signed('check_run', check(x)));
  await ok(signed('pull_request', merged(x, 'IndependentVerification', admin.uid)));
  expect((await ok(request('/api/knowledge?challengeId=' + x.cid))).total).toBe(0);
});
it('rechecks a revised submission against the new SHA and the maintainer review', async () => {
  const x = await research(),
    newHead = 'a'.repeat(40);
  await ok(submit(x));
  await ok(signed('check_run', check(x)));
  await ok(
    request('/api/tasks/' + x.tid + '/revision', {
      headers: x.a.headers,
      body: {
        agentId: x.a.id,
        leaseToken: x.lease.leaseToken,
        headSha: newHead,
        summary: 'Revised evidence',
      },
    })
  );
  const pr = merged(x, 'IndependentVerification');
  pr.pull_request.head.sha = newHead;
  await ok(signed('pull_request', pr));
  expect((await ok(request('/api/contributions?challengeId=' + x.cid))).total).toBe(0);
  await ok(signed('check_run', check(x, 'success', newHead)));
  expect((await ok(request('/api/knowledge?challengeId=' + x.cid + '&status=Reproduced'))).total).toBe(1);
});
it('restricts review, token ownership, CSRF, privileged scopes and task quota', async () => {
  const x = await research(),
    task = await ok(prop(x.a, x.cid, proposal()), 201);
  expect((await approve(task.taskId, x.a.user)).status).toBe(403);
  expect((await approve(task.taskId, x.a)).status).toBe(403);
  expect((await request('/api/credentials', { headers: x.a.headers, body: {} })).status).toBe(404);
  expect(
    (await request('/api/agent-tokens', { headers: { cookie: admin.headers.cookie }, body: {} })).status
  ).toBe(403);
  expect(
    (await request('/api/agent-tokens/' + x.a.token.token.id, { headers: admin.headers, method: 'DELETE' }))
      .status
  ).toBe(404);
  expect(
    (
      await request('/api/agent-tokens', {
        headers: admin.headers,
        body: { name: 'bad', expiresInDays: 1, maxConcurrentTasks: 1, maxTotalTasks: 1, scopes: ['admin'] },
      })
    ).status
  ).toBe(400);
  await ok(approve(task.taskId));
  const a = await agent(await login(), 1);
  const results = await Promise.all([claim(a, x.cid), claim(a, x.cid)]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 403]);
  const stored = await query('SELECT token_hash FROM agent_tokens WHERE id=?', a.token.token.id).first(
    'token_hash'
  );
  expect(stored).toBe(
    createHash('sha256')
      .update(a.token.plaintextToken + env.TOKEN_PEPPER)
      .digest('hex')
  );
});
it('caps founding serials at 100 during concurrent issuance', async () => {
  const seed = await research();
  await ok(submit(seed));
  await ok(signed('check_run', check(seed)));
  await ok(signed('pull_request', merged(seed)));
  const prior = await db
    .prepare("SELECT * FROM user_badges WHERE badge_code='founding_contributor' LIMIT 1")
    .first();
  const start = await db
    .prepare("SELECT max(serial_number) n FROM user_badges WHERE badge_code='founding_contributor'")
    .first('n');
  for (let i = start + 1; i < 100; i++)
    await db.batch([
      query(
        "INSERT INTO users(github_id,username,display_name,avatar_url,profile_url) VALUES(?,?,'fixture','','')",
        'cap-' + i,
        'cap-' + i
      ),
      query(
        "INSERT INTO user_badges(id,github_id,badge_code,challenge_id,contribution_id,credential_id,serial_number) VALUES(?,?,'founding_contributor',?,?,?,?)",
        'badge-cap-' + i,
        'cap-' + i,
        prior.challenge_id,
        prior.contribution_id,
        prior.credential_id,
        i
      ),
    ]);
  const pair = await Promise.all([research(), research()]);
  await Promise.all(
    pair.map(async (x) => {
      await ok(submit(x));
      await ok(signed('check_run', check(x)));
      await ok(signed('pull_request', merged(x)));
    })
  );
  expect(
    await db.prepare("SELECT count(*) n FROM user_badges WHERE badge_code='founding_contributor'").first('n')
  ).toBe(100);
  expect(
    await db
      .prepare("SELECT max(serial_number) n FROM user_badges WHERE badge_code='founding_contributor'")
      .first('n')
  ).toBe(100);
  for (const x of pair) expect((await ok(request('/api/contributions?challengeId=' + x.cid))).total).toBe(1);
}, 30000);
it('bounds input, validates repository URLs and stores unfinished work as inconclusive', async () => {
  const x = await research();
  expect((await submit(x, { summary: 'x'.repeat(2 * 1024 * 1024) })).status).toBe(400);
  expect((await submit(x, { prUrl: 'https://github.com/example/different/pull/1' })).status).toBe(400);
  expect((await ok(request('/api/tasks?status=' + encodeURIComponent("missing'")))).total).toBe(0);
  await ok(
    request('/api/tasks/' + x.tid + '/release', {
      headers: x.a.headers,
      body: {
        agentId: x.a.id,
        leaseToken: x.lease.leaseToken,
        reason: 'Budget reached',
        progressNotes: 'Stopped before reproducing.',
      },
    })
  );
  expect((await ok(request('/api/knowledge?challengeId=' + x.cid + '&status=Inconclusive'))).total).toBe(1);
  expect((await ok(request('/api/knowledge?challengeId=' + x.cid + '&status=Refuted'))).total).toBe(0);
});

it('keeps project proposals private until a maintainer publishes a claimable challenge', async () => {
  const author = await login();
  const other = await login();
  const list = '/api/project-proposals';
  const queue = '/api/admin/project-proposals';
  const slug = 'shared-planning-study';
  const briefContent = {
    name: 'Shared planning study',
    domain: 'Algorithms',
    summary: 'Compare scheduling strategies.',
    goal: 'Reproduce the reference schedule.',
    scoringMetric: 'Number of completed jobs',
    acceptanceCriteria: 'Publish inputs and reproducible results.',
  };
  const project = { schemaVersion: 1, ...briefContent, githubRepo: null };
  const publish = {
    slug,
    githubRepo: 'https://github.com/Example/Shared-Planning',
    trustedCheckName: 'validate-schedule',
    verificationMethod: 'Compare outputs in the pinned CI workflow.',
    targetDisplay: 'Reproduce baseline',
    contributionType: 'IndependentVerification',
  };
  const checkPrivate = async (publicSlug, name) => {
    expect((await request('/api/challenges/' + publicSlug)).status).toBe(404);
    expect((await request('/api/challenges/' + publicSlug + '/progress')).status).toBe(404);
    expect((await request('/challenges/' + publicSlug + '/join.txt')).status).toBe(404);
    expect((await ok(request('/api/challenges'))).items.some((entry) => entry.name === name)).toBe(false);
  };
  expect((await request(list, { body: project })).status).toBe(401);
  expect((await request(list, { body: project, headers: { cookie: author.headers.cookie } })).status).toBe(403);
  const invalidBriefs = [
    project.summary,
    briefContent,
    { ...project, schemaVersion: 2 },
    { ...project, schemaVersion: '1' },
    { ...project, goal: undefined },
    { ...project, scoringMetric: 42 },
    { ...project, acceptanceCriteria: '    ' },
    { ...project, name: 'x'.repeat(151) },
    { ...project, githubRepo: 'https://github.com/example/..' },
    { ...project, status: 'Approved' },
  ];
  for (const body of invalidBriefs) {
    expect(await ok(request(list, { body, headers: author.headers }), 400))
      .toMatchObject({ code: 'VALIDATION_ERROR' });
  }
  expect((await ok(request(list, { headers: author.headers }))).total).toBe(0);
  const headers = { ...author.headers, 'Idempotency-Key': randomUUID() };
  const created = await ok(request(list, { body: project, headers }), 201);
  expect(created).toMatchObject({ status: 'Pending', schemaVersion: 1 });
  expect(created.githubRepo).toBeUndefined();
  expect(await ok(request(list, { body: project, headers }), 201)).toEqual(created);
  expect((await request(list, { body: { ...project, name: 'Different' }, headers })).status).toBe(409);
  await checkPrivate(slug, project.name);
  const authorList = await request(list, { headers: author.headers });
  expect(authorList.headers.get('Cache-Control')).toBe('no-store');
  expect((await ok(authorList)).items).toEqual([created]);
  expect((await ok(request(list, { headers: other.headers }))).items).toEqual([]);
  expect((await request(queue, { headers: author.headers })).status).toBe(403);
  expect((await ok(request('/api/me', { headers: admin.headers }))).canReviewProjects).toBe(true);
  expect((await ok(request(queue, { headers: admin.headers }))).items).toContainEqual(created);
  const approveProject = queue + '/' + created.id + '/approve';
  expect((await request(approveProject, { body: publish, headers: author.headers })).status).toBe(403);
  expect((await request(approveProject, {
    body: { ...publish, contributionType: 'RecordImprovement' }, headers: admin.headers,
  })).status).toBe(400);

  const decisions = await Promise.all([1, 2].map(() => request(approveProject, { body: publish, headers: admin.headers })));
  expect(decisions.map((response) => response.status).sort()).toEqual([200, 409]);
  expect(await ok(decisions.find((response) => response.ok))).toMatchObject({
    status: 'Approved', challengeSlug: slug,
  });
  const catalog = await ok(request('/api/challenges?status=Active'));
  expect(catalog.items[1]).toMatchObject({ slug, stats: { openTasksCount: 1 } });
  expect(await ok(request('/api/challenges/' + slug))).toMatchObject({
    status: 'Active', githubRepo: publish.githubRepo, scoringMetric: text(project.scoringMetric),
  });
  expect(await (await request('/challenges/' + slug + '/join.txt')).text()).toContain(project.acceptanceCriteria);
  const participant = await agent(other);
  const claimed = await ok(claim(participant, slug));
  expect((await ok(request('/api/tasks/' + claimed.taskId))).isPlanning).toBe(true);

  const rejectedProject = { ...project, githubRepo: undefined, name: 'Another planning study' };
  const next = await ok(request(list, { body: rejectedProject, headers: author.headers }), 201);
  const nextPath = queue + '/' + next.id;
  const conflicting = { ...publish, slug: 'another-planning-study', githubRepo: publish.githubRepo.toLowerCase() };
  expect((await request(nextPath + '/approve', { body: conflicting, headers: admin.headers })).status).toBe(409);
  expect((await request(nextPath + '/reject', { body: { reason: ' ' }, headers: admin.headers })).status).toBe(400);
  const reason = 'Provide an independent dataset.';
  expect(await ok(request(nextPath + '/reject', { body: { reason }, headers: admin.headers })))
    .toMatchObject({ status: 'Rejected', rejectionReason: reason, challengeSlug: null });
  await checkPrivate(conflicting.slug, rejectedProject.name);
  expect((await ok(request(list, { headers: author.headers }))).items)
    .toContainEqual(expect.objectContaining({ id: next.id, status: 'Rejected', rejectionReason: reason }));

  await query(
    'INSERT INTO project_proposals(id,author_github_id,proposal_json,submitted_at) VALUES(?,?,?,?)',
    'legacy-brief', String(other.uid), JSON.stringify(briefContent), new Date().toISOString()
  ).run();
  const legacy = (await ok(request(list, { headers: other.headers }))).items[0];
  expect(legacy).toMatchObject({ id: 'legacy-brief', ...briefContent });
  expect(legacy.schemaVersion).toBeUndefined();
}, 30000);

it('authorizes a full Agent session from a project prompt and consumes the code once', async () => {
  const operator = await login();
  const join = '/api/agent-join';
  const body = { challengeId: 'grandmaster' };
  expect((await request(join, { body })).status).toBe(401);
  expect((await request(join, { body, headers: { cookie: operator.headers.cookie } })).status).toBe(403);
  expect((await request(join, { body: { challengeId: 'missing' }, headers: operator.headers })).status).toBe(404);
  const prompt = await request(join, { body, headers: operator.headers });
  expect(prompt.headers.get('Cache-Control')).toBe('no-store');
  const { code, expiresAt } = await ok(prompt, 201);
  expect(expiresAt).toBeTruthy();
  const redemptions = await Promise.all([1, 2].map(() => request(join + '/redeem', { body: { code } })));
  expect(redemptions.map((response) => response.status).sort()).toEqual([201, 401]);
  const { plaintextToken, challengeId } = await ok(redemptions.find((response) => response.ok), 201);
  expect(challengeId).toBe('grandmaster');
  const { items } = await ok(request('/api/agent-tokens', { headers: operator.headers }));
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({
    scopes: ['agent:register', 'tasks:read', 'tasks:claim', 'tasks:propose', 'knowledge:read'],
    maxConcurrentTasks: 1,
    maxTotalTasks: 5,
  });
  const headers = { Authorization: 'Bearer ' + plaintextToken };
  const agent = await ok(request('/api/agents/register', {
    headers, body: { challengeId, label: 'prompt agent', selfReportedModel: 'test', selfReportedClient: 'test' },
  }), 201);
  expect(agent.ownerGithubId).toBe(String(operator.uid));
  expect((await request('/api/admin/project-proposals', { headers })).status).toBe(403);
  expect((await claim({ id: agent.id, headers }, challengeId)).status).toBe(200);
  await ok(request('/api/agent-tokens/' + items[0].id, { headers: operator.headers, method: 'DELETE' }), 204);
  expect((await request('/api/knowledge', { headers })).status).toBe(401);

  const expired = await ok(request(join, { body, headers: operator.headers }), 201);
  await query('UPDATE agent_join_codes SET expires_at=? WHERE owner_github_id=?', '2000-01-01T00:00:00.000Z', String(operator.uid)).run();
  expect((await request(join + '/redeem', { body: { code: expired.code } })).status).toBe(401);
});

it('seeds phased starter task pools and restricts /admin console to allowlisted IPs', async () => {
  const gmTasks = await ok(request('/api/tasks?challengeId=grandmaster'));
  expect(gmTasks.items.map((t) => t.taskId)).toContain('TASK-GM-P1-01');
  expect(gmTasks.items.map((t) => t.taskId)).toContain('TASK-GM-P1-02');
  expect(gmTasks.items.find((t) => t.taskId === 'TASK-GM-P1-02').dependencies).toEqual(['TASK-GM-P1-01']);

  const ogTasks = await ok(request('/api/tasks?challengeId=open-game'));
  expect(ogTasks.items.map((t) => t.taskId)).toContain('TASK-OG-P1-01');
  expect(ogTasks.items.map((t) => t.taskId)).toContain('TASK-OG-P3-01');

  const olTasks = await ok(request('/api/tasks?challengeId=open-language'));
  expect(olTasks.items.map((t) => t.taskId)).toContain('TASK-OL-P1-01');
  expect(olTasks.items.map((t) => t.taskId)).toContain('TASK-OL-P3-02');

  const prevAllowlist = env.ADMIN_IP_ALLOWLIST;
  env.ADMIN_IP_ALLOWLIST = '141.11.146.88';
  try {
    expect((await request('/admin', { headers: { 'CF-Connecting-IP': '203.0.113.9' } })).status).toBe(403);
    expect(
      (await request('/api/admin/console/overview', { headers: { 'CF-Connecting-IP': '203.0.113.9' } })).status
    ).toBe(403);

    expect((await request('/admin', { headers: { 'CF-Connecting-IP': '141.11.146.88' } })).status).toBe(200);
    const overview = await ok(
      request('/api/admin/console/overview', { headers: { 'CF-Connecting-IP': '141.11.146.88' } })
    );
    expect(overview.clientIp).toBe('141.11.146.88');
    expect(overview.summary.challengesTotal).toBeGreaterThanOrEqual(3);

    // Cross-origin mutation must be blocked even from an allowlisted IP
    expect(
      (
        await request('/api/admin/console/tasks/TASK-OG-P1-01/status', {
          method: 'PATCH',
          headers: { 'CF-Connecting-IP': '141.11.146.88', Origin: 'https://evil.example' },
          body: { status: 'Available' },
        })
      ).status
    ).toBe(403);

    // Same-origin mutation from allowlisted IP succeeds
    const patched = await ok(
      request('/api/admin/console/tasks/TASK-OG-P1-01/status', {
        method: 'PATCH',
        headers: { 'CF-Connecting-IP': '141.11.146.88', Origin: origin },
        body: { status: 'Available' },
      })
    );
    expect(patched).toMatchObject({ taskId: 'TASK-OG-P1-01', status: 'Available' });
  } finally {
    env.ADMIN_IP_ALLOWLIST = prevAllowlist;
  }
}, 20000);
