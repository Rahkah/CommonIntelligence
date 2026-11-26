import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { getPlatformProxy } from 'wrangler';
import { createHmac, randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { app, sweep } from '../src/index';
import { setGitHubRepoFetch } from '../src/github-repos';
import { catalogStatements } from '../scripts/seed.mjs';
import { validateProjectBrief } from '@common-intelligence/shared';

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
  expect(catalog.total).toBe(2);
  expect(catalog.items.map((c) => c.slug).sort()).toEqual(['grandmaster', 'shared-canvas']);
  expect(catalog.items.filter((c) => c.status === 'Active')).toHaveLength(2);
  expect(
    validateProjectBrief({
      schemaVersion: 1,
      category: 'playground',
      name: '100-AI Town',
      domain: 'Multi-Agent Playground',
      summary: 'A tiny pixel town run by 100 AIs.',
      goal: 'Agents trade and build streets together.',
      githubRepo: null,
    })
  ).toHaveProperty('data');

  const grandmasterInstructions = await (await request('/challenges/grandmaster/join.txt')).text();
  expect(grandmasterInstructions).toContain('/api/agent-join/quickstart');
  expect(grandmasterInstructions).toContain('/api/chess/grandmaster/vote');

  const canvasInstructions = await (await request('/challenges/shared-canvas/join.txt')).text();
  expect(canvasInstructions).toContain('/api/canvas/shared-canvas/paint');

  const gmShowcase = await ok(request('/api/challenges/grandmaster/showcase'));
  expect(gmShowcase.showcase).toMatchObject({ kind: 'chess-trainer', status: 'live' });
  const canvasShowcase = await ok(request('/api/challenges/shared-canvas/showcase'));
  expect(canvasShowcase.showcase).toMatchObject({ kind: 'shared-canvas', status: 'live' });

  const a = await agent(await login()),
    b = await agent(await login()),
    cid = await challenge();
  const plan = await ok(claim(a, cid));
  const planner = await ok(request('/api/tasks/' + plan.taskId));
  expect(planner.outputRequirements.zh).toContain('任务拆解提示');
  const route = '/api/tasks/' + plan.taskId + '/plan';
  const body = {
    agentId: a.id,
    leaseToken: plan.leaseToken,
    tasks: [proposal('First approach'), proposal('Cross-check')],
  };
  const idem = { 'Idempotency-Key': randomUUID(), ...a.headers };
  const packet = await ok(request(route, { headers: idem, body }));
  expect(await ok(request(route, { headers: idem, body }))).toEqual(packet);
  expect(packet.status).toBe('Accepted');
  const [tid] = packet.taskIds;
  expect((await ok(request('/api/tasks/' + plan.taskId))).status).toBe('Accepted');
  // Tasks with unmet deps auto-enter Pending; tasks without deps auto-enter Available directly!
  const waiting = await ok(prop(b, cid, proposal('Follow-up', [tid])), 201);
  expect(waiting.status).toBe('Pending');
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
    { ...project, summary: '    ' },
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
  expect(catalog.items.find((item) => item.slug === slug)).toMatchObject({ slug, stats: { openTasksCount: 1 } });
  expect(await ok(request('/api/challenges/' + slug))).toMatchObject({
    status: 'Active', githubRepo: publish.githubRepo, scoringMetric: text(project.scoringMetric),
  });
  expect(await (await request('/challenges/' + slug + '/join.txt')).text()).toContain(project.goal);
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
  const body = { challengeId: 'shared-canvas' };
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
  expect(challengeId).toBe('shared-canvas');
  const { items } = await ok(request('/api/agent-tokens', { headers: operator.headers }));
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({
    scopes: ['agent:register', 'tasks:read', 'tasks:claim', 'tasks:propose', 'knowledge:read'],
    maxConcurrentTasks: 3,
    maxTotalTasks: 30,
  });
  const headers = { Authorization: 'Bearer ' + plaintextToken };
  const agent = await ok(request('/api/agents/register', {
    headers, body: { challengeId, label: 'prompt agent', selfReportedModel: 'test', selfReportedClient: 'test' },
  }), 201);
  expect(agent.ownerGithubId).toBe(String(operator.uid));
  expect((await request('/api/admin/project-proposals', { headers })).status).toBe(403);
  const claimed = await ok(claim({ id: agent.id, headers }, challengeId));
  expect(await ok(request('/api/tasks/' + claimed.taskId))).toMatchObject({ challengeId: 'shared-canvas' });
  await ok(request('/api/agent-tokens/' + items[0].id, { headers: operator.headers, method: 'DELETE' }), 204);
  expect((await request('/api/knowledge', { headers })).status).toBe(401);

  const expired = await ok(request(join, { body, headers: operator.headers }), 201);
  await query('UPDATE agent_join_codes SET expires_at=? WHERE owner_github_id=?', '2000-01-01T00:00:00.000Z', String(operator.uid)).run();
  expect((await request(join + '/redeem', { body: { code: expired.code } })).status).toBe(401);
});

it('seeds starter quest pools and restricts /admin console to allowlisted IPs', async () => {
  const gmTasks = await ok(request('/api/tasks?challengeId=grandmaster'));
  expect(gmTasks.items.map((t) => t.taskId)).toContain('TASK-GM-01');
  expect(gmTasks.items.map((t) => t.taskId)).toContain('TASK-GM-02');

  const canvasTasks = await ok(request('/api/tasks?challengeId=shared-canvas'));
  expect(canvasTasks.items.map((t) => t.taskId)).toContain('TASK-CANVAS-01');
  expect(canvasTasks.items.map((t) => t.taskId)).toContain('TASK-CANVAS-03');

  const prevAllowlist = env.ADMIN_IP_ALLOWLIST;
  env.ADMIN_IP_ALLOWLIST = '141.11.146.88,240e:38d:8d42:d000::/64';
  try {
    expect((await request('/admin', { headers: { 'CF-Connecting-IP': '203.0.113.9' } })).status).toBe(403);
    expect(
      (await request('/api/admin/console/overview', { headers: { 'CF-Connecting-IP': '203.0.113.9' } })).status
    ).toBe(403);
    expect((await request('/admin', { headers: { 'CF-Connecting-IP': '240e:38d:8d42:d000:78ef:af41:8a17:de32' } })).status).toBe(200);
    expect((await request('/admin', { headers: { 'CF-Connecting-IP': '240e:38d:8d42:d001::1' } })).status).toBe(403);

    expect((await request('/admin', { headers: { 'CF-Connecting-IP': '141.11.146.88' } })).status).toBe(200);
    const overview = await ok(
      request('/api/admin/console/overview', { headers: { 'CF-Connecting-IP': '141.11.146.88' } })
    );
    expect(overview.clientIp).toBe('141.11.146.88');
    expect(overview.summary.challengesTotal).toBeGreaterThanOrEqual(2);

    // Cross-origin mutation must be blocked even from an allowlisted IP
    expect(
      (
        await request('/api/admin/console/tasks/TASK-CANVAS-01/status', {
          method: 'PATCH',
          headers: { 'CF-Connecting-IP': '141.11.146.88', Origin: 'https://evil.example' },
          body: { status: 'Available' },
        })
      ).status
    ).toBe(403);

    // Same-origin mutation from allowlisted IP succeeds
    const patched = await ok(
      request('/api/admin/console/tasks/TASK-CANVAS-01/status', {
        method: 'PATCH',
        headers: { 'CF-Connecting-IP': '141.11.146.88', Origin: origin },
        body: { status: 'Available' },
      })
    );
    expect(patched).toMatchObject({ taskId: 'TASK-CANVAS-01', status: 'Available' });

    // Default categories: grandmaster -> challenge, shared-canvas -> playground
    const cats = await ok(request('/api/categories'));
    expect(cats.items.map((c) => c.id)).toEqual(['challenge', 'playground']);
    const challengeList = await ok(request('/api/challenges?category=challenge'));
    expect(challengeList.items.some((c) => c.slug === 'grandmaster')).toBe(true);
    expect(challengeList.items.some((c) => c.slug === 'shared-canvas')).toBe(false);
    const playgroundList = await ok(request('/api/challenges?category=playground'));
    expect(playgroundList.items.some((c) => c.slug === 'shared-canvas')).toBe(true);
    expect(playgroundList.items.some((c) => c.slug === 'grandmaster')).toBe(false);

    // Admin can create a new category, edit it, reassign a project, and delete once unused
    const adminMutationHeaders = { 'CF-Connecting-IP': '141.11.146.88', Origin: origin };
    const createdCat = await ok(
      request('/api/admin/console/categories', {
        method: 'POST',
        headers: adminMutationHeaders,
        body: {
          id: 'simulation',
          nameZh: '模拟实验',
          nameEn: 'Simulation Lab',
          descriptionZh: '多智能体模拟实验',
          descriptionEn: 'Multi-agent simulation experiments',
          sortOrder: 3,
        },
      }),
      201
    );
    expect(createdCat).toMatchObject({ id: 'simulation', sortOrder: 3, challengesCount: 0 });

    const editedCat = await ok(
      request('/api/admin/console/categories/simulation', {
        method: 'PATCH',
        headers: adminMutationHeaders,
        body: { nameZh: '模拟沙盒', sortOrder: 5 },
      })
    );
    expect(editedCat).toMatchObject({ id: 'simulation', sortOrder: 5, name: { en: 'Simulation Lab', zh: '模拟沙盒' } });

    const moved = await ok(
      request('/api/admin/console/challenges/shared-canvas/category', {
        method: 'PATCH',
        headers: adminMutationHeaders,
        body: { category: 'simulation' },
      })
    );
    expect(moved).toMatchObject({ slug: 'shared-canvas', category: 'simulation' });

    // Cannot delete category while assigned to a project
    expect(
      (
        await request('/api/admin/console/categories/simulation', {
          method: 'DELETE',
          headers: adminMutationHeaders,
        })
      ).status
    ).toBe(409);

    // Reassign back to playground, then delete the temporary category
    await ok(
      request('/api/admin/console/challenges/shared-canvas/category', {
        method: 'PATCH',
        headers: adminMutationHeaders,
        body: { category: 'playground' },
      })
    );
    const deletedCat = await ok(
      request('/api/admin/console/categories/simulation', {
        method: 'DELETE',
        headers: adminMutationHeaders,
      })
    );
    expect(deletedCat).toEqual({ id: 'simulation', deleted: true });
  } finally {
    env.ADMIN_IP_ALLOWLIST = prevAllowlist;
  }
}, 20000);

it('tracks public page views and recent online activity for the protected admin traffic report', async () => {
  const record = '/api/site-traffic';
  const report = '/api/admin/console/traffic';
  const visitorHeaders = { Origin: origin, 'CF-Connecting-IP': '203.0.113.9' };
  const adminHeaders = { ...admin.headers, 'CF-Connecting-IP': '141.11.146.88' };
  const user = await login();
  const previousAllowlist = env.ADMIN_IP_ALLOWLIST;
  env.ADMIN_IP_ALLOWLIST = '141.11.146.88';
  try {
    expect((await request(report, { headers: { 'CF-Connecting-IP': '141.11.146.88' } })).status).toBe(401);
    expect((await request(report, { headers: { ...user.headers, 'CF-Connecting-IP': '141.11.146.88' } })).status).toBe(403);
    expect((await request(report, { headers: { ...admin.headers, 'CF-Connecting-IP': '203.0.113.9' } })).status).toBe(403);
    expect((await request(record, { headers: { Origin: 'https://elsewhere.example' }, body: { path: '/' } })).status).toBe(403);
    for (const path of ['/admin', '/docs?secret=not-for-logs']) {
      expect((await request(record, { headers: visitorHeaders, body: { path } })).status).toBe(400);
    }

    const firstView = await request(record, { headers: visitorHeaders, body: { path: '/' } });
    expect(firstView.status).toBe(204);
    const cookie = firstView.headers.get('set-cookie');
    expect(cookie).toContain('HttpOnly');
    await ok(request(record, { headers: { ...visitorHeaders, cookie: cookie.split(';')[0] }, body: {} }), 204);
    await ok(request(record, { headers: user.headers, body: { path: '/docs' } }), 204);
    await ok(request(record, { headers: user.headers, body: {} }), 204);

    await query(
      'INSERT INTO site_page_views(id,path,signed_in,visited_at) VALUES(?,?,?,?)',
      'expired-page', '/', 0, '2000-01-01T00:00:00.000Z'
    ).run();
    await query(
      'INSERT INTO site_presence(visitor_id,last_seen_at) VALUES(?,?)',
      'expired-visitor', '2000-01-01T00:00:00.000Z'
    ).run();
    await sweep(db);
    const res = await request(report, { headers: adminHeaders });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const stats = await ok(res);
    expect(stats.registeredUsers).toBe(await db.prepare('SELECT count(*) n FROM users').first('n'));
    expect(stats.online).toEqual({ total: 2, registered: 1, anonymous: 1, minutes: 5 });
    expect(stats.pageViews).toEqual({ total: 3, last24Hours: 2 });
    expect(stats.recentVisits).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '/', signedIn: false }),
      expect.objectContaining({ path: '/docs', signedIn: true }),
    ]));
    expect(stats.recentVisits).toHaveLength(2);
  } finally {
    env.ADMIN_IP_ALLOWLIST = previousAllowlist;
  }
}, 20000);

it('automates public GitHub repo creation, ownership notice, webhook setup, batch sync, and safe deletion', async () => {
  const externalCid = await challenge();
  const repos = new Map();
  const prevToken = env.GITHUB_ADMIN_TOKEN;
  const prevOrg = env.GITHUB_ORG_NAME;
  const prevOrigin = env.APP_ORIGIN;
  const prevAllowlist = env.ADMIN_IP_ALLOWLIST;
  env.GITHUB_ADMIN_TOKEN = 'ghp_test_automation_token';
  env.GITHUB_ORG_NAME = 'common-intelligence-org';
  env.APP_ORIGIN = 'https://api.common-intelligence.workers.dev';
  env.ADMIN_IP_ALLOWLIST = '141.11.146.88';

  setGitHubRepoFetch(async (url, init = {}) => {
    const method = (init.method || 'GET').toUpperCase();
    const u = new URL(String(url));
    const jsonRes = (status, data) =>
      new Response(status === 204 ? null : JSON.stringify(data), {
        status,
        headers: { 'content-type': 'application/json' },
      });

    // POST /orgs/:org/repos
    const createMatch = u.pathname.match(/^\/orgs\/([^/]+)\/repos$/);
    if (method === 'POST' && createMatch) {
      const org = decodeURIComponent(createMatch[1]);
      const body = JSON.parse(String(init.body));
      const full = `${org}/${body.name}`;
      if (repos.has(full)) return jsonRes(422, { message: 'Repository creation failed: name already exists' });
      repos.set(full, { ...body, files: new Map(), hooks: [] });
      return jsonRes(201, { full_name: full, html_url: `https://github.com/${full}` });
    }

    // GET/DELETE /repos/:owner/:repo
    const repoMatch = u.pathname.match(/^\/repos\/([^/]+)\/([^/]+)$/);
    if (repoMatch) {
      const full = `${decodeURIComponent(repoMatch[1])}/${decodeURIComponent(repoMatch[2])}`;
      if (method === 'GET') {
        return repos.has(full) ? jsonRes(200, { full_name: full }) : jsonRes(404, { message: 'Not Found' });
      }
      if (method === 'DELETE') {
        if (!repos.has(full)) return jsonRes(404, { message: 'Not Found' });
        repos.delete(full);
        return jsonRes(204, null);
      }
    }

    // GET/PUT /repos/:owner/:repo/contents/:path
    const contentMatch = u.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/contents\/(.+)$/);
    if (contentMatch) {
      const full = `${decodeURIComponent(contentMatch[1])}/${decodeURIComponent(contentMatch[2])}`;
      const path = contentMatch[3].split('/').map(decodeURIComponent).join('/');
      const record = repos.get(full);
      if (!record) return jsonRes(404, { message: 'Not Found' });
      if (method === 'GET') {
        return record.files.has(path)
          ? jsonRes(200, { sha: 'existing_sha', path })
          : jsonRes(404, { message: 'Not Found' });
      }
      if (method === 'PUT') {
        const body = JSON.parse(String(init.body));
        const decoded = Buffer.from(body.content, 'base64').toString('utf8');
        record.files.set(path, decoded);
        return jsonRes(201, { content: { path } });
      }
    }

    // GET/POST /repos/:owner/:repo/hooks
    const hooksMatch = u.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/hooks$/);
    if (hooksMatch) {
      const full = `${decodeURIComponent(hooksMatch[1])}/${decodeURIComponent(hooksMatch[2])}`;
      const record = repos.get(full);
      if (!record) return jsonRes(404, { message: 'Not Found' });
      if (method === 'GET') return jsonRes(200, record.hooks);
      if (method === 'POST') {
        const body = JSON.parse(String(init.body));
        record.hooks.push(body);
        return jsonRes(201, { id: record.hooks.length, ...body });
      }
    }

    return jsonRes(404, { message: `Unhandled mock route: ${method} ${u.pathname}` });
  });

  try {
    const author = await login();
    const adminConsoleHeaders = { 'CF-Connecting-IP': '141.11.146.88', Origin: env.APP_ORIGIN };

    // 1. User submits a project proposal with no GitHub repo; maintainer approves with autoCreateRepo=true
    const proposal = await ok(
      request('/api/project-proposals', {
        headers: { ...author.headers, Origin: env.APP_ORIGIN, 'Idempotency-Key': randomUUID() },
        body: {
          schemaVersion: 1,
          name: 'Auto Managed Solver',
          domain: 'Combinatorics',
          summary: 'Collaborative solver with auto-provisioned public repository.',
          goal: 'Verify minimal constructions automatically.',
          scoringMetric: 'Verified size',
          acceptanceCriteria: 'Reproducible script passing verifier.',
          githubRepo: null,
        },
      }),
      201
    );

    const approved = await ok(
      request(`/api/admin/project-proposals/${proposal.id}/approve`, {
        headers: { ...admin.headers, Origin: env.APP_ORIGIN },
        body: {
          slug: 'auto-managed-solver',
          autoCreateRepo: true,
          verificationMethod: 'Trusted CI verifier checks metadata and reproducible outputs.',
          targetDisplay: 'Reproducible verified solver',
          contributionType: 'IndependentVerification',
        },
      })
    );
    expect(approved.status).toBe('Approved');
    expect(approved.challengeSlug).toBe('auto-managed-solver');
    expect(approved.githubRepo).toBe('https://github.com/common-intelligence-org/auto-managed-solver');

    const createdRepo = repos.get('common-intelligence-org/auto-managed-solver');
    expect(createdRepo).toBeTruthy();
    expect(createdRepo.private).toBe(false);
    expect(createdRepo.files.get('LICENSE')).toContain('Copyright (c) 2026 Common Intelligence Contributors');
    expect(createdRepo.files.get('NOTICE')).toContain('归全体\nCommon Intelligence 贡献者共同所有');
    expect(createdRepo.files.get('README.md')).toContain('全体 Common Intelligence 贡献者');
    expect(createdRepo.files.get('.github/workflows/verify.yml')).toContain('auto-managed-solver-verifier-v1');
    expect(createdRepo.files.get('verifiers/verify-pr.mjs')).toContain('"auto-managed-solver"');
    expect(createdRepo.hooks).toHaveLength(1);
    expect(createdRepo.hooks[0].config.url).toBe(`${env.APP_ORIGIN}/webhooks/github`);

    // 2. Batch provision creates all missing starter repos and syncs existing ones idempotently
    const batch = await ok(
      request('/api/admin/console/repos/provision-all', {
        method: 'POST',
        headers: adminConsoleHeaders,
        body: {},
      })
    );
    expect(batch.org).toBe('common-intelligence-org');
    expect(batch.created).toBeGreaterThanOrEqual(2);
    expect(repos.has('common-intelligence-org/grandmaster')).toBe(true);
    expect(repos.has('common-intelligence-org/shared-canvas')).toBe(true);

    // 3. Delete the uncontributed auto-managed challenge AND automatically delete its GitHub repo
    const deleted = await ok(
      request('/api/admin/console/challenges/auto-managed-solver?deleteRepo=true', {
        method: 'DELETE',
        headers: adminConsoleHeaders,
      })
    );
    expect(deleted).toMatchObject({
      slug: 'auto-managed-solver',
      deleted: true,
      repoDeletion: { owner: 'common-intelligence-org', repo: 'auto-managed-solver', deleted: true },
    });
    expect(repos.has('common-intelligence-org/auto-managed-solver')).toBe(false);
    expect((await request('/api/challenges/auto-managed-solver')).status).toBe(404);

    // 4. Safety guard: refuse deleting an unmanaged external repo (owner !== GITHUB_ORG_NAME)
    expect(
      (
        await request(`/api/admin/console/challenges/${externalCid}?deleteRepo=true`, {
          method: 'DELETE',
          headers: adminConsoleHeaders,
        })
      ).status
    ).toBe(403);
    // Still allow deleting the DB row when deleteRepo is NOT requested
    await ok(
      request(`/api/admin/console/challenges/${externalCid}`, {
        method: 'DELETE',
        headers: adminConsoleHeaders,
      })
    );
  } finally {
    setGitHubRepoFetch(undefined);
    env.GITHUB_ADMIN_TOKEN = prevToken;
    env.GITHUB_ORG_NAME = prevOrg;
    env.APP_ORIGIN = prevOrigin;
    env.ADMIN_IP_ALLOWLIST = prevAllowlist;
  }
}, 20000);

it('hides agent machine labels from public tasks, activity, and agent lookup endpoints while keeping model names', async () => {
  const operator = await login();
  const minted = await ok(
    request('/api/agent-tokens', {
      headers: operator.headers,
      body: {
        name: 'privacy-token',
        expiresInDays: 1,
        maxConcurrentTasks: 2,
        maxTotalTasks: 10,
        scopes: ['agent:register', 'tasks:claim', 'tasks:propose', 'tasks:read', 'knowledge:read'],
      },
    }),
    201
  );
  const headers = { Authorization: 'Bearer ' + minted.plaintextToken };
  const registered = await ok(
    request('/api/agents/register', {
      headers,
      body: {
        challengeId: 'grandmaster',
        label: 'Bleap-Pro',
        selfReportedModel: 'AWS Quick (Smart mode)',
        selfReportedClient: 'custom',
      },
    }),
    201
  );
  const claimed = await ok(claim({ id: registered.id, headers }, 'grandmaster'));

  // Simulate a pre-existing legacy DB event whose summary_json stored the machine hostname
  await query(
    `UPDATE activity_events SET summary_json=? WHERE event_type='agent_registered' AND agent_id=?`,
    JSON.stringify({ en: 'Registered Bleap-Pro', zh: 'Registered Bleap-Pro' }),
    registered.id
  ).run();

  const [publicAgent, taskDetail, activityList] = await Promise.all([
    ok(request('/api/agents/' + registered.id)),
    ok(request('/api/tasks/' + claimed.taskId)),
    ok(request('/api/activity?challengeId=grandmaster&limit=20')),
  ]);

  expect(publicAgent.selfReportedModel).toBe('AWS Quick (Smart mode)');
  expect(publicAgent.label).toBeUndefined();
  expect(JSON.stringify(publicAgent)).not.toContain('Bleap-Pro');

  expect(taskDetail.assignedAgentModelSelfReported).toBe('AWS Quick (Smart mode)');
  expect(taskDetail.assignedAgentLabel).toBeUndefined();
  expect(JSON.stringify(taskDetail)).not.toContain('Bleap-Pro');

  const regEvent = activityList.items.find(
    (e) => e.type === 'agent_registered' && e.actorGithubId === String(operator.uid)
  );
  expect(regEvent).toBeTruthy();
  expect(regEvent.selfReportedModel).toBe('AWS Quick (Smart mode)');
  expect(regEvent.agentLabel).toBeUndefined();
  expect(regEvent.summary.en).toContain('AWS Quick (Smart mode)');
  expect(JSON.stringify(activityList.items)).not.toContain('Bleap-Pro');
});

it('auto-schedules bounded wildcard quests when no primary tasks are available', async () => {
  const cid = await challenge();
  const a1 = await agent(await login());
  const a2 = await agent(await login());
  const a3 = await agent(await login());

  // Claim the planning task and submit two quests (they open directly into Available!)
  const planLease = await ok(claim(a1, cid));
  const planned = await ok(
    request('/api/tasks/' + planLease.taskId + '/plan', {
      headers: a1.headers,
      body: {
        agentId: a1.id,
        leaseToken: planLease.leaseToken,
        tasks: [proposal('Primary quest 1'), proposal('Primary quest 2')],
      },
    })
  );
  const [t1, t2] = planned.taskIds;
  // Claim both primary quests so primary Available count drops to 0 and a planning seed is blocked by an open plan/proposed or we claim it
  const l1 = await ok(claim(a1, cid, t1));
  await ok(claim(a2, cid, t2));
  // Claim any auto-replenished planning task too so Available count is 0
  const maybePlan = await ok(request('/api/tasks?challengeId=' + cid + '&status=Available'));
  if (maybePlan.items.length > 0 && maybePlan.items[0].isPlanning) {
    await ok(claim(a3, cid, maybePlan.items[0].taskId));
  }

  // 1. With 0 Available primary tasks, GET /api/tasks schedules QUEST-EXPERIMENT-*
  const firstPool = await ok(request('/api/tasks?challengeId=' + cid + '&status=Available'));
  expect(firstPool.items).toHaveLength(1);
  expect(firstPool.items[0].taskId).toMatch(/^QUEST-EXPERIMENT-/);
  expect(firstPool.items[0].priority).toBe('Low');

  // 2. Claiming QUEST-EXPERIMENT-* rotates to QUEST-PLAYTEST-*
  const expLease = await ok(claim(a1, cid));
  expect(expLease.taskId).toBe(firstPool.items[0].taskId);

  const secondPool = await ok(request('/api/tasks?challengeId=' + cid + '&status=Available'));
  expect(secondPool.items).toHaveLength(1);
  expect(secondPool.items[0].taskId).toMatch(/^QUEST-PLAYTEST-/);

  // 3. Releasing a primary task puts it back in front of wildcard quests
  await ok(
    request('/api/tasks/' + t1 + '/release', {
      headers: a1.headers,
      body: { agentId: a1.id, leaseToken: l1.leaseToken, reason: 'handing off' },
    })
  );
  const nextClaim = await ok(claim(a3, cid));
  expect(nextClaim.taskId).toBe(t1);
}, 20000);

it('supports 1-step agent quickstart, 1,000-AI shared canvas painting, collective vote chess vs Stockfish 19, and quick notes', async () => {
  const player1 = await login();
  const player2 = await login();

  // 1. Quickstart for Shared Canvas: 1 call redeems code + mints 7-day token + registers agent
  const canvasCode = await ok(
    request('/api/agent-join', { headers: player1.headers, body: { challengeId: 'shared-canvas' } }),
    201
  );
  const qsCanvas = await ok(
    request('/api/agent-join/quickstart', {
      body: { code: canvasCode.code, label: 'pixel-bot', selfReportedModel: 'claude-sonnet-4.5' },
    }),
    201
  );
  expect(qsCanvas.plaintextToken).toMatch(/^ci_agt_/);
  expect(qsCanvas.agentId).toMatch(/^agt_/);
  expect(qsCanvas.maxConcurrentTasks).toBe(3);
  expect(qsCanvas.maxTotalTasks).toBe(30);
  expect(qsCanvas.nextSteps.canvasEndpoint).toBe('/api/canvas/shared-canvas/paint');

  // 2. Paint pixels directly via Agent Bearer token
  const painted = await ok(
    request('/api/canvas/shared-canvas/paint', {
      headers: { Authorization: 'Bearer ' + qsCanvas.plaintextToken },
      body: {
        agentId: qsCanvas.agentId,
        pixels: [
          { x: 5, y: 5, color: '#10b981' },
          { x: 6, y: 5, color: '#6366f1' },
        ],
        note: 'First AI pixels!',
      },
    }),
    201
  );
  expect(painted.paintedCount).toBe(2);
  const canvasState = await ok(request('/api/canvas/shared-canvas'));
  expect(canvasState.stats.paintedPixels).toBeGreaterThanOrEqual(2);
  expect(canvasState.stats.uniqueAgents).toBeGreaterThanOrEqual(1);
  expect(canvasState.recentStrokes[0].note).toBe('First AI pixels!');

  // 3. Quickstart for Collective Vote Chess vs Stockfish 19 (Agent-only voting & analysis)
  const chessCode1 = await ok(
    request('/api/agent-join', { headers: player1.headers, body: { challengeId: 'grandmaster' } }),
    201
  );
  const qsChess1 = await ok(
    request('/api/agent-join/quickstart', {
      body: { code: chessCode1.code, label: 'tactic-bot-1', selfReportedModel: 'gemini-2.5-pro' },
    }),
    201
  );
  expect(qsChess1.nextSteps.chessEndpoint).toBe('/api/chess/grandmaster/vote');

  const chessCode2 = await ok(
    request('/api/agent-join', { headers: player2.headers, body: { challengeId: 'grandmaster' } }),
    201
  );
  const qsChess2 = await ok(
    request('/api/agent-join/quickstart', {
      body: { code: chessCode2.code, label: 'tactic-bot-2', selfReportedModel: 'claude-sonnet-4.5' },
    }),
    201
  );

  const chessCode3 = await ok(
    request('/api/agent-join', { headers: player1.headers, body: { challengeId: 'grandmaster' } }),
    201
  );
  const qsChess3 = await ok(
    request('/api/agent-join/quickstart', {
      body: { code: chessCode3.code, label: 'tactic-bot-3', selfReportedModel: 'codex-gpt-5' },
    }),
    201
  );

  // Unregistered agent token must also be rejected
  const unregisteredToken = await ok(
    request('/api/agent-tokens', {
      headers: player1.headers,
      body: { name: 'unregistered-bot', expiresInDays: 1 },
    }),
    201
  );

  // Human browser sessions and unregistered tokens cannot vote or post analysis
  expect(
    (
      await request('/api/chess/grandmaster/vote', {
        headers: player1.headers,
        body: { move: 'e4', reason: 'Manual human attempt' },
      })
    ).status
  ).toBe(403);
  expect(
    (
      await request('/api/chess/grandmaster/vote', {
        headers: { Authorization: 'Bearer ' + unregisteredToken.plaintextToken },
        body: { move: 'e4' },
      })
    ).status
  ).toBe(403);
  expect(
    (
      await request('/api/challenges/grandmaster/notes', {
        headers: player1.headers,
        body: { title: 'Manual note', summary: 'Should be rejected for human browser sessions.' },
      })
    ).status
  ).toBe(403);
  expect(
    (
      await request('/api/challenges/grandmaster/notes', {
        headers: { Authorization: 'Bearer ' + unregisteredToken.plaintextToken },
        body: { title: 'Unregistered note', summary: 'Should require a registered agent.' },
      })
    ).status
  ).toBe(403);

  const initialMatch = await ok(request('/api/chess/grandmaster'));
  expect(initialMatch.roundNumber).toBe(1);
  expect(initialMatch.legalMoves.length).toBe(20);

  // Two agents back e4, one backs d4 -> e4 must win!
  await ok(
    request('/api/chess/grandmaster/vote', {
      headers: { Authorization: 'Bearer ' + qsChess1.plaintextToken },
      body: { agentId: qsChess1.agentId, move: 'e4', reason: 'Best by test!' },
    }),
    201
  );
  await ok(
    request('/api/chess/grandmaster/vote', {
      headers: { Authorization: 'Bearer ' + qsChess2.plaintextToken },
      body: { move: 'e2e4', reason: 'Agree with e4!' },
    }),
    201
  );
  await ok(
    request('/api/chess/grandmaster/vote', {
      headers: { Authorization: 'Bearer ' + qsChess3.plaintextToken },
      body: { agentId: qsChess3.agentId, move: 'd4', reason: 'Queen pawn game' },
    }),
    201
  );

  // Illegal move from an agent is rejected cleanly
  expect(
    (
      await request('/api/chess/grandmaster/vote', {
        headers: { Authorization: 'Bearer ' + qsChess1.plaintextToken },
        body: { agentId: qsChess1.agentId, move: 'e2e5' },
      })
    ).status
  ).toBe(400);

  const beforeResolve = await ok(request('/api/chess/grandmaster'));
  expect(beforeResolve.tallies[0]).toMatchObject({ moveUci: 'e2e4', moveSan: 'e4', votes: 2 });

  // Resolve round: e4 plays, Stockfish replies, match advances to Round 2!
  const resolved = await ok(
    request('/api/chess/grandmaster/resolve', {
      headers: { Authorization: 'Bearer ' + qsChess1.plaintextToken },
      body: {},
    })
  );
  expect(resolved.collectiveMove.san).toBe('e4');
  expect(resolved.stockfishReply).toBeTruthy();
  expect(resolved.match.roundNumber).toBe(2);
  expect(resolved.match.moveHistory).toHaveLength(2);
  expect(resolved.match.specialActions?.some((m) => m.uci === 'resign')).toBe(true);
  expect(resolved.match.voteHistory).toHaveLength(1);
  expect(resolved.match.voteHistory[0]).toMatchObject({
    roundNumber: 1,
    winningMoveUci: 'e2e4',
    winningMoveSan: 'e4',
    stockfishReplyUci: resolved.stockfishReply.uci,
    totalVotes: 3,
  });

  // Round 2: AI Swarm votes to resign ("resign" / "投降") -> resolving ends game cleanly as 0-1 without Stockfish reply
  await ok(
    request('/api/chess/grandmaster/vote', {
      headers: { Authorization: 'Bearer ' + qsChess1.plaintextToken },
      body: { agentId: qsChess1.agentId, move: 'resign', reason: 'Position lost — save time and start Game 2!' },
    }),
    201
  );
  await ok(
    request('/api/chess/grandmaster/vote', {
      headers: { Authorization: 'Bearer ' + qsChess2.plaintextToken },
      body: { agentId: qsChess2.agentId, move: '投降', reason: 'Agreed, let us reset.' },
    }),
    201
  );
  const resigned = await ok(
    request('/api/chess/grandmaster/resolve', {
      headers: { Authorization: 'Bearer ' + qsChess1.plaintextToken },
      body: {},
    })
  );
  expect(resigned.collectiveMove.uci).toBe('resign');
  expect(resigned.collectiveMove.san).toBe('Resign');
  expect(resigned.stockfishReply).toBeNull();
  expect(resigned.match.status).toBe('finished');
  expect(resigned.match.result).toBe('0-1');
  expect(resigned.match.voteHistory.map((r) => r.roundNumber)).toEqual([2, 1]);
  expect(resigned.match.gameHistory).toHaveLength(1);
  expect(resigned.match.gameHistory[0]).toMatchObject({
    gameNumber: 1,
    result: '0-1',
    endReason: 'resign',
    totalPlies: 3,
    totalVotes: 5,
  });
  expect(resigned.match.gameHistory[0].voteHistory.map((r) => r.roundNumber)).toEqual([2, 1]);

  // Finish 11 more games (Games #2..#12) to verify historical game storage is strictly capped at 10
  let latestMatch = resigned.match;
  for (let g = 2; g <= 12; g++) {
    const started = await ok(
      request('/api/chess/grandmaster/new-game', {
        headers: { Authorization: 'Bearer ' + qsChess1.plaintextToken },
        body: {},
      }),
      201
    );
    expect(started.gameNumber).toBe(g);
    expect(started.status).toBe('playing');

    await ok(
      request('/api/chess/grandmaster/vote', {
        headers: { Authorization: 'Bearer ' + qsChess1.plaintextToken },
        body: { agentId: qsChess1.agentId, move: 'resign', reason: `Concede game #${g}` },
      }),
      201
    );
    const ended = await ok(
      request('/api/chess/grandmaster/resolve', {
        headers: { Authorization: 'Bearer ' + qsChess1.plaintextToken },
        body: {},
      })
    );
    latestMatch = ended.match;
  }

  expect(latestMatch.gameHistory).toHaveLength(10);
  expect(latestMatch.gameHistory.map((g) => g.gameNumber)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3]);
  expect(
    await query('SELECT count(*) n FROM chess_game_history WHERE challenge_id=?', 'grandmaster').first('n')
  ).toBe(10);
  expect(
    await query(
      'SELECT count(*) n FROM chess_votes WHERE challenge_id=? AND game_number IN (1, 2)',
      'grandmaster'
    ).first('n')
  ).toBe(0);

  // Start next game so subsequent tests see an active game cleanly
  const nextGame = await ok(
    request('/api/chess/grandmaster/new-game', {
      headers: { Authorization: 'Bearer ' + qsChess1.plaintextToken },
      body: {},
    }),
    201
  );
  expect(nextGame.gameNumber).toBe(13);
  expect(nextGame.status).toBe('playing');
  expect(nextGame.gameHistory).toHaveLength(10);

  // 4. Lightweight agent-only analysis note without needing a PR
  const note = await ok(
    request('/api/challenges/grandmaster/notes', {
      headers: { Authorization: 'Bearer ' + qsChess1.plaintextToken },
      body: { title: 'Round 1 recap', summary: 'e4 won 2-1 and Stockfish replied cleanly!' },
    }),
    201
  );
  expect(note.title.en).toBe('Round 1 recap');
}, 25000);

it('allows /api/agent-join and quickstart without TOKEN_PEPPER in local dev bypass mode, but rejects missing TOKEN_PEPPER in production', async () => {
  const prevBypass = env.LOCAL_DEV_AUTH_BYPASS;
  const prevPepper = env.TOKEN_PEPPER;
  const prevOrigin = env.APP_ORIGIN;
  try {
    // 1. Local dev bypass on localhost without TOKEN_PEPPER succeeds
    env.LOCAL_DEV_AUTH_BYPASS = 'true';
    env.APP_ORIGIN = 'http://localhost:8787';
    env.TOKEN_PEPPER = '';

    const localJoin = await ok(
      request('/api/agent-join', {
        headers: { Origin: 'http://localhost:8787' },
        body: { challengeId: 'grandmaster' },
      }),
      201
    );
    expect(localJoin.code).toMatch(/^ci_join_/);

    const localQs = await ok(
      request('/api/agent-join/quickstart', {
        body: { code: localJoin.code, label: 'local-bot' },
      }),
      201
    );
    expect(localQs.plaintextToken).toMatch(/^ci_agt_/);

    // 2. Non-local / non-bypass without TOKEN_PEPPER strictly fails with 503
    env.LOCAL_DEV_AUTH_BYPASS = 'false';
    const prodRes = await request('/api/agent-join/quickstart', {
      body: { code: localJoin.code, label: 'prod-bot' },
    });
    expect(prodRes.status).toBe(503);
  } finally {
    env.LOCAL_DEV_AUTH_BYPASS = prevBypass;
    env.TOKEN_PEPPER = prevPepper;
    env.APP_ORIGIN = prevOrigin;
  }
}, 15000);

it('supports dual-mode Chat relay restricted to entry classes, deduplication, auto Agent follow-up tasks, and independent verification', async () => {
  const author = await login();
  const verifier1 = await login();
  const verifier2 = await login();
  const agVerifier = await agent(verifier2);

  // 1. Advanced execution classes (forger / tactician / pioneer) are blocked in Chat mode
  const blockedClass = await request('/api/challenges/grandmaster/context-pack?classId=forger');
  expect(blockedClass.status).toBe(403);

  // Agent-only task is also blocked in Chat context-pack
  const blockedTask = await request('/api/challenges/grandmaster/context-pack?classId=scout&taskId=TASK-GM-03');
  expect(blockedTask.status).toBe(403);

  // 2. Entry-tier Scout context pack succeeds and returns a bounded self-contained prompt
  const pack = await ok(
    request('/api/challenges/grandmaster/context-pack?classId=scout&budgetTier=S&taskId=TASK-GM-02')
  );
  expect(pack.classId).toBe('scout');
  expect(pack.prompt).toContain('Common Intelligence');
  expect(pack.prompt).toContain('NEVER claim you executed code');
  expect(pack.promptCharCount).toBeLessThanOrEqual(11500);

  // 3. Submitting with an advanced class via Chat fails with 403
  const badClassSubmit = await request('/api/challenges/grandmaster/chat-submit', {
    headers: author.headers,
    body: {
      classId: 'forger',
      outputSchemaKind: 'failure_analysis',
      rawResponse: '{}',
    },
  });
  expect(badClassSubmit.status).toBe(403);

  // 4. Valid Scout failure analysis wrapped in prose + forbidden self-eval keys is sanitized, marked Proposed, and spawns an Agent follow-up task
  const replyPayload = `Sure! Here is the root cause:\n\`\`\`json\n${JSON.stringify({
    schemaVersion: 1,
    kind: 'failure_analysis',
    title: 'Quiescence search misses discovered checks on king rank',
    rootCause: 'Stand-pat pruning returns early when tactical discovered checks are still pending in the node.',
    evidenceSummary: 'Observed recurring tactical losses in shallow depth horizons during move ordering analysis.',
    suggestedDirection: 'Extend quiescence search by 1 ply for checking moves before applying stand-pat cutoff.',
    verified: true,
    measuredElo: 3800,
    selfReportedModel: 'claude-web',
  })}\n\`\`\``;

  const submitted = await ok(
    request('/api/challenges/grandmaster/chat-submit', {
      headers: author.headers,
      body: {
        classId: 'scout',
        taskId: 'TASK-GM-02',
        outputSchemaKind: 'failure_analysis',
        rawResponse: replyPayload,
      },
    }),
    201
  );
  expect(submitted.outcomeType).toBe('artifact_pending_verification');
  expect(submitted.artifact.status).toBe('Proposed');
  expect(submitted.artifact.submissionChannel).toBe('chat');
  expect(submitted.warnings.some((w) => w.includes('Stripped unverified self-evaluation'))).toBe(true);
  expect(submitted.followUpTask).toBeTruthy();
  expect(submitted.followUpTask.supportedModes).toEqual(['agent']);

  // 5. Duplicate submission is rejected with 409 CONFLICT
  const dup = await request('/api/challenges/grandmaster/chat-submit', {
    headers: verifier1.headers,
    body: {
      classId: 'scout',
      outputSchemaKind: 'failure_analysis',
      rawResponse: replyPayload,
    },
  });
  expect(dup.status).toBe(409);

  // 6. Agent brief surfaces pending Chat artifact & spawned follow-up task for cross-mode handoff
  const brief = await ok(request('/api/challenges/grandmaster/brief?class=forger&budget=M'));
  expect(brief.pendingChatArtifacts.some((a) => a.id === submitted.artifact.id)).toBe(true);

  // 7. Strict anti-self-verification: author cannot verify own Chat artifact
  const selfVerify = await request(`/api/artifacts/${submitted.artifact.id}/verify`, {
    headers: author.headers,
    body: { verdict: 'confirm', evidenceSummary: 'Trying to approve my own artifact.' },
  });
  expect(selfVerify.status).toBe(403);

  // Two distinct independent verifiers promote Proposed -> Verified
  const v1 = await ok(
    request(`/api/artifacts/${submitted.artifact.id}/verify`, {
      headers: verifier1.headers,
      body: { verdict: 'confirm', evidenceSummary: 'Independently checked qsearch source and confirmed check omission.' },
    })
  );
  expect(v1.artifactStatus).toBe('Proposed');
  expect(v1.confirmCount).toBe(1);

  const v2 = await ok(
    request(`/api/artifacts/${submitted.artifact.id}/verify`, {
      headers: agVerifier.headers,
      body: {
        verdict: 'confirm',
        agentId: agVerifier.id,
        evidenceSummary: 'Reproduced tactical horizon drop on 3 test positions with local engine run.',
      },
    })
  );
  expect(v2.artifactStatus).toBe('Verified');
  expect(v2.confirmCount).toBe(2);

  // 8. Playground deterministic Chat submission paints directly onto shared-canvas
  const canvasPaint = await ok(
    request('/api/challenges/shared-canvas/chat-submit', {
      headers: author.headers,
      body: {
        classId: 'scout',
        taskId: 'TASK-CANVAS-01',
        outputSchemaKind: 'canvas_pixels',
        rawResponse: JSON.stringify({
          schemaVersion: 1,
          kind: 'canvas_pixels',
          pixels: [
            { x: 3, y: 4, color: '#10b981' },
            { x: 4, y: 4, color: '#34d399' },
          ],
          note: 'Chat-relayed emerald star!',
          selfReportedModel: 'gemini-web',
        }),
      },
    }),
    201
  );
  expect(canvasPaint.outcomeType).toBe('playground_applied');
  expect(canvasPaint.playgroundResult.paintedCount).toBe(2);
}, 25000);
