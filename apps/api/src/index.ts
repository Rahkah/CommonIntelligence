import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import { type App, type Bindings, Fault, fail, iso, now, rate, sql } from './core';
import { auth, bearer } from './auth';
import { catalog } from './public';
import { work, expire, replenish } from './tasks';
import { hooks, reconcile } from './verification';

export const app = new Hono<App>();
app.use('*', async (c, next) => {
  if (
    c.req.method !== 'GET' ||
    c.req.path.startsWith('/auth/') ||
    ['/api/me', '/api/agent-tokens'].includes(c.req.path)
  )
    c.header('Cache-Control', 'no-store');
  await next();
});
app.use('/api/*', async (c, next) => {
  if (c.req.method === 'GET') {
    let bucket = 'ip:' + (c.req.header('CF-Connecting-IP') ?? 'local');
    if (
      c.req.header('Authorization') &&
      (c.req.path.startsWith('/api/tasks') || c.req.path === '/api/knowledge')
    ) {
      const p = await bearer(c, c.req.path === '/api/knowledge' ? 'knowledge:read' : 'tasks:read');
      bucket = 'token:' + p.token;
    }
    await rate(c, 'read:' + bucket, 900, 300);
  }
  await next();
});
app.use(
  '/api/*',
  bodyLimit({ maxSize: 65536, onError: () => fail(400, 'VALIDATION_ERROR', 'Request exceeds 64 KiB.') })
);
app.use(
  '/webhooks/*',
  bodyLimit({ maxSize: 1048576, onError: () => fail(400, 'VALIDATION_ERROR', 'Webhook exceeds 1 MiB.') })
);
app.route('/', auth);
app.route('/', work);
app.route('/', catalog);
app.route('/', hooks);
app.get('/health', async (c) => {
  await c.env.DB.prepare('SELECT 1').first();
  return c.json({ status: 'ok', d1: 'connected', timestamp: iso() });
});
app.all('/api/*', () => fail(404, 'NOT_FOUND'));
app.all('/auth/*', () => fail(404, 'NOT_FOUND'));
app.all('/webhooks/*', () => fail(404, 'NOT_FOUND'));
app.get('*', (c) => c.env.ASSETS.fetch(c.req.raw));
app.notFound(() => fail(404, 'NOT_FOUND'));
app.onError((err, c) => {
  let problem = err instanceof Fault ? err : null;
  if (err instanceof z.ZodError)
    problem = new Fault(
      400,
      'VALIDATION_ERROR',
      err.issues
        .map((i) => i.path.join('.') + ' ' + i.message)
        .join(', ')
        .slice(0, 800)
    );
  const msg = String(err);
  const guarded = msg.match(
    /guard_(FORBIDDEN|UNAUTHORIZED|CONFLICT|LEASE_CONFLICT|INVALID_LEASE_TOKEN|LEASE_EXPIRED|NOT_FOUND|VALIDATION_ERROR)/
  )?.[1];
  if (guarded) {
    const codes = {
      FORBIDDEN: 403,
      UNAUTHORIZED: 401,
      CONFLICT: 409,
      LEASE_CONFLICT: 409,
      INVALID_LEASE_TOKEN: 409,
      LEASE_EXPIRED: 409,
      NOT_FOUND: 404,
      VALIDATION_ERROR: 400,
    } as const;
    const code = guarded as keyof typeof codes;
    problem = new Fault(codes[code], code);
  }
  if (!problem && msg.includes('UNIQUE constraint failed')) problem = new Fault(409, 'CONFLICT');
  const requestId = crypto.randomUUID();
  if (!problem) console.error({ requestId, error: err.name, path: c.req.routePath });
  problem ??= new Fault(500, 'INTERNAL_ERROR');
  return c.json({ code: problem.code, message: problem.message, requestId }, problem.status);
});
export async function sweep(db: D1Database) {
  await db.batch([
    expire(db),
    replenish(db),
    sql(db, `DELETE FROM idempotency_keys WHERE expires_at<=${now}`),
    sql(db, `DELETE FROM rate_limit_buckets WHERE expires_at<=${now}`),
    sql(db, `DELETE FROM sessions WHERE expires_at<=${now} OR revoked_at IS NOT NULL`),
  ]);
  // Recover an interrupted webhook, or a contribution whose parents were accepted later.
  const rows = await sql(
    db,
    `SELECT task_id FROM eligible_contributions UNION SELECT p.task_id FROM pull_requests p
    JOIN challenges h ON h.id=p.challenge_id JOIN check_evidence e ON e.repo=p.repo_full_name AND e.head=p.head_sha AND e.name=h.trusted_workflow_name
    WHERE NOT EXISTS(SELECT 1 FROM verification_runs v WHERE v.github_check_run_id=CAST(e.run_id AS TEXT))
    LIMIT 20`
  ).all<{ task_id: string }>();
  for (const row of rows.results) await reconcile(db, row.task_id);
}
export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Bindings) {
    await sweep(env.DB);
  },
};
