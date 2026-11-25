import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { z } from 'zod';
import type {
  AgentRecord,
  AgentToken,
  AgentTokenScope,
  UserProfileSummary,
} from '@common-intelligence/shared';
import { agents, users, tokens } from './selects';
import {
  type App,
  type Ctx,
  sql,
  one,
  page,
  fail,
  required,
  equal,
  random,
  digest,
  field,
  scopes,
  iso,
  now,
  id,
  json,
  rate,
  event,
  guard,
} from './core';

type Session = { id: string; github_id: string; csrf_token: string; role: string };
export type Principal = { owner: string; token: string | null; role: string };
export async function session(c: Ctx) {
  const value = getCookie(c, 'ci_session');
  if (!value) return null;
  return sql(
    c.env.DB,
    `SELECT s.id,s.github_id,s.csrf_token,u.role FROM sessions s JOIN users u ON u.github_id=s.github_id
    WHERE session_token_hash=? AND revoked_at IS NULL AND expires_at>${now}`,
    await digest(value + required(c.env.SESSION_SECRET))
  ).first<Session>();
}
export async function browser(c: Ctx, mutation = true): Promise<Principal> {
  if (c.req.header('Authorization')) fail(403, 'FORBIDDEN');
  const s = await session(c);
  if (!s) fail(401, 'UNAUTHORIZED');
  if (mutation) {
    let origin = c.req.header('Origin');
    if (!origin && c.req.header('Referer')) {
      try {
        origin = new URL(c.req.header('Referer')!).origin;
      } catch {
        fail(403, 'FORBIDDEN');
      }
    }
    if (origin !== c.env.APP_ORIGIN || !(await equal(s.csrf_token, c.req.header('X-CSRF-Token') ?? '')))
      fail(403, 'FORBIDDEN');
  }
  return { owner: s.github_id, token: null, role: s.role };
}
export async function maintainer(c: Ctx) {
  const p = await browser(c);
  if (p.role !== 'maintainer' && p.role !== 'admin') fail(403, 'FORBIDDEN');
  return p;
}
export async function bearer(c: Ctx, scope: AgentTokenScope): Promise<Principal> {
  const token = c.req.header('Authorization')?.match(/^Bearer (ci_agt_[0-9a-f]{64})$/i)?.[1];
  if (!token) fail(401, 'UNAUTHORIZED');
  const row = await sql(
    c.env.DB,
    `UPDATE agent_tokens SET last_used_at=${now} WHERE token_hash=? AND revoked_at IS NULL AND expires_at>${now}
    RETURNING id,owner_github_id,scopes_json`,
    await digest(token + required(c.env.TOKEN_PEPPER))
  ).first<{ id: string; owner_github_id: string; scopes_json: string }>();
  if (!row) fail(401, 'UNAUTHORIZED');
  if (!JSON.parse(row.scopes_json).includes(scope)) fail(403, 'FORBIDDEN');
  return { owner: row.owner_github_id, token: row.id, role: 'agent' };
}
const cookie = { httpOnly: true, secure: true, sameSite: 'Lax' } as const;
const statePath = '/auth/github/callback';
export const auth = new Hono<App>();
auth.get('/auth/github', (c) => {
  const state = random();
  const url = new URL('https://github.com/login/oauth/authorize');
  url.search = new URLSearchParams({
    client_id: required(c.env.GITHUB_CLIENT_ID),
    scope: 'read:user',
    state,
    redirect_uri: c.env.APP_ORIGIN + statePath,
  }).toString();
  setCookie(c, 'ci_oauth_state', state, { ...cookie, path: statePath, maxAge: 600 });
  return c.redirect(url.toString());
});
auth.get(statePath, async (c) => {
  const expected = getCookie(c, 'ci_oauth_state');
  deleteCookie(c, 'ci_oauth_state', { ...cookie, path: statePath });
  const code = c.req.query('code');
  if (!expected || !code || !(await equal(expected, c.req.query('state') ?? '')))
    fail(400, 'VALIDATION_ERROR', 'Invalid OAuth state or code.');
  const exchange = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: new URLSearchParams({
      client_id: required(c.env.GITHUB_CLIENT_ID),
      client_secret: required(c.env.GITHUB_CLIENT_SECRET),
      code,
      redirect_uri: c.env.APP_ORIGIN + statePath,
    }),
  });
  const result = z
    .object({ access_token: field(2048) })
    .safeParse(exchange.ok ? await exchange.json() : null);
  if (!result.success) fail(401, 'UNAUTHORIZED', 'GitHub declined the login.');
  const response = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: 'Bearer ' + result.data.access_token,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'CommonIntelligence',
    },
  });
  const profile = z
    .object({
      id: z.number().int().positive(),
      login: field(80),
      name: z.string().nullable(),
      avatar_url: z.url(),
      html_url: z.url(),
    })
    .safeParse(response.ok ? await response.json() : null);
  if (!profile.success) fail(401, 'UNAUTHORIZED', 'GitHub profile unavailable.');
  const gh = profile.data,
    user = String(gh.id),
    secret = random(),
    csrf = random();
  await c.env.DB.batch([
    sql(
      c.env.DB,
      `INSERT INTO users(github_id,username,display_name,avatar_url,profile_url) VALUES(?,?,?,?,?)
    ON CONFLICT(github_id) DO UPDATE SET username=excluded.username,display_name=excluded.display_name,avatar_url=excluded.avatar_url,
    profile_url=excluded.profile_url,updated_at=${now}`,
      user,
      gh.login,
      gh.name || gh.login,
      gh.avatar_url,
      gh.html_url
    ),
    sql(
      c.env.DB,
      'INSERT INTO sessions(id,github_id,session_token_hash,csrf_token,expires_at) VALUES(?,?,?,?,?)',
      id('session'),
      user,
      await digest(secret + required(c.env.SESSION_SECRET)),
      csrf,
      iso(7 * 86400000)
    ),
  ]);
  setCookie(c, 'ci_session', secret, { ...cookie, path: '/', maxAge: 604800 });
  return c.redirect(c.env.APP_ORIGIN + '/');
});
auth.post('/auth/logout', async (c) => {
  await browser(c);
  await sql(
    c.env.DB,
    `UPDATE sessions SET revoked_at=${now} WHERE session_token_hash=?`,
    await digest(getCookie(c, 'ci_session') + required(c.env.SESSION_SECRET))
  ).run();
  deleteCookie(c, 'ci_session', { ...cookie, path: '/' });
  return c.body(null, 204);
});
auth.get('/api/me', async (c) => {
  const s = await session(c);
  const user = s
    ? await one<UserProfileSummary>(c.env.DB, users + ' WHERE u.github_id=?', s.github_id)
    : null;
  return c.json({ authenticated: !!user, mode: 'live', user, csrfToken: s?.csrf_token });
});
auth.get('/api/agent-tokens', async (c) => {
  const p = await browser(c, false);
  return c.json(
    await page<AgentToken>(c, tokens + ' WHERE owner_github_id=?', '1', [p.owner], 'createdAt DESC,id')
  );
});
auth.post('/api/agent-tokens', async (c) => {
  const p = await browser(c);
  const b = await json(
    c,
    z
      .object({
        name: field(100),
        expiresInDays: z.number().int().min(1).max(90),
        maxConcurrentTasks: z.number().int().min(1).max(5),
        maxTotalTasks: z.number().int().min(1).max(100),
        budgetNote: z.string().max(500).optional(),
        scopes: z.array(z.enum(scopes)).min(1).max(scopes.length),
      })
      .strict()
  );
  const token = 'ci_agt_' + random(),
    tid = id('tok');
  await sql(
    c.env.DB,
    `INSERT INTO agent_tokens(id,owner_github_id,name,token_prefix,token_hash,scopes_json,max_concurrent_tasks,max_total_tasks,budget_note,expires_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`,
    tid,
    p.owner,
    b.name,
    token.slice(0, 14),
    await digest(token + required(c.env.TOKEN_PEPPER)),
    JSON.stringify([...new Set(b.scopes)]),
    b.maxConcurrentTasks,
    b.maxTotalTasks,
    b.budgetNote ?? null,
    iso(b.expiresInDays * 86400000)
  ).run();
  return c.json(
    { token: await one<AgentToken>(c.env.DB, tokens + ' WHERE id=?', tid), plaintextToken: token },
    201
  );
});
auth.delete('/api/agent-tokens/:id', async (c) => {
  const p = await browser(c);
  const r = await sql(
    c.env.DB,
    `UPDATE agent_tokens SET revoked_at=coalesce(revoked_at,${now}) WHERE id=? AND owner_github_id=? RETURNING id`,
    c.req.param('id'),
    p.owner
  ).first();
  if (!r) fail(404, 'NOT_FOUND');
  return c.body(null, 204);
});
auth.post('/api/agents/register', async (c) => {
  const p = await bearer(c, 'agent:register');
  await rate(c, p.token + ':register', 3600, 10);
  const b = await json(
    c,
    z
      .object({
        label: field(80),
        selfReportedModel: field(80),
        selfReportedClient: field(80),
        challengeId: field(150).optional(),
      })
      .strict()
  );
  const aid = id('agt'),
    db = c.env.DB;
  const writes = [
    sql(
      db,
      'INSERT INTO agents(id,owner_github_id,token_id,label,self_reported_model,self_reported_client) VALUES(?,?,?,?,?,?)',
      aid,
      p.owner,
      p.token,
      b.label,
      b.selfReportedModel,
      b.selfReportedClient
    ),
  ];
  if (b.challengeId)
    writes.push(
      guard(db, 'NOT_FOUND', 'EXISTS(SELECT 1 FROM challenges WHERE id=?)', b.challengeId),
      event(db, 'agent_registered', b.challengeId, p.owner, 'Registered ' + b.label, null, aid)
    );
  await db.batch(writes);
  return c.json(await one<AgentRecord>(db, agents + ' WHERE a.id=?', aid), 201);
});
auth.get('/api/agents/:id', async (c) =>
  c.json(await one<AgentRecord>(c.env.DB, agents + ' WHERE a.id=?', c.req.param('id')))
);
