import { Hono } from 'hono';
import { z } from 'zod';
import { challenges, tasks } from './selects';
import {
  type App,
  type Ctx,
  fail,
  field,
  id,
  iso,
  json,
  key,
  localized,
  now,
  sql,
  statuses,
  unpack,
} from './core';

const challengeStatuses = ['Proposed', 'Active', 'Paused', 'Completed', 'Archived'] as const;
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
const userRoles = ['contributor', 'maintainer', 'admin'] as const;

function isLocalOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}

export function parseAllowlist(raw?: string): string[] {
  return (raw ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function resolveClientIp(c: Ctx): string | null {
  // Always trust Cloudflare's edge-injected header; never trust spoofable X-Forwarded-For.
  const cfIp = c.req.header('CF-Connecting-IP')?.trim();
  if (cfIp) return cfIp;
  if (isLocalOrigin(c.env.APP_ORIGIN)) return '127.0.0.1';
  return null;
}

function assertAdminIp(c: Ctx, mutation = false): { ip: string; allowlist: string[] } {
  const allowlist = parseAllowlist(c.env.ADMIN_IP_ALLOWLIST);
  if (allowlist.length === 0) {
    fail(403, 'FORBIDDEN', 'Admin IP allowlist is not configured.');
  }
  const ip = resolveClientIp(c);
  if (!ip || !allowlist.includes(ip)) {
    fail(403, 'FORBIDDEN', 'Access restricted to allowlisted admin IP addresses.');
  }
  if (mutation) {
    let origin = c.req.header('Origin');
    if (!origin && c.req.header('Referer')) {
      try {
        origin = new URL(c.req.header('Referer')!).origin;
      } catch {
        fail(403, 'FORBIDDEN', 'Invalid request origin.');
      }
    }
    if (origin !== c.env.APP_ORIGIN) {
      fail(403, 'FORBIDDEN', 'Cross-origin admin mutations are blocked.');
    }
  }
  return { ip, allowlist };
}

export const adminConsole = new Hono<App>();

// Hard-gate direct page navigation to /admin at the Worker edge.
adminConsole.get('/admin', (c) => {
  const allowlist = parseAllowlist(c.env.ADMIN_IP_ALLOWLIST);
  const ip = resolveClientIp(c);
  c.header('Cache-Control', 'no-store');
  if (!allowlist.length || !ip || !allowlist.includes(ip)) {
    return c.text('403 Forbidden — Admin access is restricted by IP allowlist.', 403);
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

adminConsole.get('/api/admin/console/overview', async (c) => {
  const { ip, allowlist } = assertAdminIp(c, false);
  const db = c.env.DB;
  const [challengeRows, taskRows, userRows, proposalRows, agentCountRow] = await db.batch<
    Record<string, unknown>
  >([
    sql(db, challenges + ' ORDER BY CASE status WHEN \'Active\' THEN 0 ELSE 1 END, createdAt ASC, slug ASC'),
    sql(db, tasks + ' ORDER BY challengeId ASC, taskId ASC LIMIT 200'),
    sql(
      db,
      `SELECT u.github_id githubId, u.username, u.display_name displayName, u.role, u.joined_at joinedAt,
        (SELECT count(*) FROM contributions WHERE contributor_github_id=u.github_id) contributionsCount,
        (SELECT count(*) FROM agents WHERE owner_github_id=u.github_id) agentsCount
      FROM users u ORDER BY u.joined_at DESC LIMIT 100`
    ),
    sql(
      db,
      `SELECT p.id, p.proposal_json proposalJson, p.status, p.submitted_at submittedAt, c.slug challengeSlug,
        u.username authorUsername
      FROM project_proposals p
      JOIN users u ON u.github_id=p.author_github_id
      LEFT JOIN challenges c ON c.id=p.challenge_id
      ORDER BY CASE p.status WHEN 'Pending' THEN 0 ELSE 1 END, p.submitted_at DESC LIMIT 50`
    ),
    sql(db, 'SELECT count(*) n FROM agents'),
  ]);

  const challengeList = challengeRows.results.map((r) => unpack<Record<string, unknown>>(r));
  const taskList = taskRows.results.map((r) => unpack<Record<string, unknown>>(r));
  const userList = userRows.results;
  const proposalList = proposalRows.results.map((row) => {
    const parsed = typeof row.proposalJson === 'string' ? JSON.parse(row.proposalJson) : {};
    return {
      id: row.id,
      name: String(parsed.name ?? ''),
      domain: String(parsed.domain ?? ''),
      status: row.status,
      submittedAt: row.submittedAt,
      challengeSlug: row.challengeSlug ?? null,
      authorUsername: row.authorUsername,
    };
  });

  return c.json({
    clientIp: ip,
    allowlist,
    serverTime: iso(),
    origin: c.env.APP_ORIGIN,
    summary: {
      challengesTotal: challengeList.length,
      activeChallenges: challengeList.filter((ch) => ch.status === 'Active').length,
      tasksTotal: taskList.length,
      availableTasks: taskList.filter((t) => t.status === 'Available').length,
      pendingTasks: taskList.filter((t) => t.status === 'Pending').length,
      leasedTasks: taskList.filter((t) => t.status === 'Leased').length,
      proposedTasks: taskList.filter((t) => t.status === 'Proposed').length,
      acceptedTasks: taskList.filter((t) => t.status === 'Accepted').length,
      usersTotal: userList.length,
      agentsTotal: Number(agentCountRow.results[0]?.n ?? 0),
      pendingProposals: proposalList.filter((p) => p.status === 'Pending').length,
    },
    challenges: challengeList,
    tasks: taskList,
    users: userList,
    proposals: proposalList,
  });
});

adminConsole.patch('/api/admin/console/challenges/:id/status', async (c) => {
  assertAdminIp(c, true);
  const cid = key.parse(c.req.param('id'));
  const body = await json(
    c,
    z.object({ status: z.enum(challengeStatuses) }).strict()
  );
  const updated = await sql(
    c.env.DB,
    `UPDATE challenges SET status=?, updated_at=${now} WHERE id=? OR slug=? RETURNING id, slug, status`,
    body.status,
    cid,
    cid
  ).first();
  if (!updated) fail(404, 'NOT_FOUND');
  return c.json(updated);
});

adminConsole.patch('/api/admin/console/tasks/:taskId/status', async (c) => {
  assertAdminIp(c, true);
  const taskId = key.parse(c.req.param('taskId'));
  const body = await json(
    c,
    z.object({ status: z.enum(statuses) }).strict()
  );
  const updated = await sql(
    c.env.DB,
    `UPDATE tasks SET status=?, updated_at=${now} WHERE task_id=? RETURNING task_id taskId, challenge_id challengeId, status`,
    body.status,
    taskId
  ).first();
  if (!updated) fail(404, 'NOT_FOUND');
  return c.json(updated);
});

adminConsole.post('/api/admin/console/tasks', async (c) => {
  assertAdminIp(c, true);
  const body = await json(
    c,
    z
      .object({
        challengeId: key,
        taskId: z
          .string()
          .trim()
          .regex(/^[A-Za-z0-9_-]{3,80}$/)
          .optional(),
        titleZh: field(180),
        titleEn: z.string().trim().max(180).optional(),
        descriptionZh: field(4000),
        descriptionEn: z.string().trim().max(4000).optional(),
        taskType: z.enum(taskTypes),
        priority: z.enum(['Critical', 'High', 'Normal', 'Low']),
        status: z.enum(['Available', 'Pending', 'Proposed']),
        dependencies: z.array(key).max(12).default([]),
        requiredCapabilities: z.array(field(80)).max(12).default([]),
        acceptanceCriteria: z.array(field(600)).min(1).max(12),
        outputRequirements: z.string().trim().max(1000).optional(),
      })
      .strict()
  );

  const challenge = await sql(
    c.env.DB,
    'SELECT id FROM challenges WHERE id=? OR slug=?',
    body.challengeId,
    body.challengeId
  ).first<{ id: string }>();
  if (!challenge) fail(404, 'NOT_FOUND', 'Challenge not found.');

  const taskId = body.taskId || id('TASK');
  const titleJson = JSON.stringify({
    en: body.titleEn?.trim() || body.titleZh,
    zh: body.titleZh,
  });
  const descJson = JSON.stringify({
    en: body.descriptionEn?.trim() || body.descriptionZh,
    zh: body.descriptionZh,
  });
  const criteriaJson = JSON.stringify(body.acceptanceCriteria.map(localized));
  const outputJson = JSON.stringify(
    localized(body.outputRequirements?.trim() || 'Submit a reproducible Pull Request.')
  );

  const statements = [
    sql(
      c.env.DB,
      `INSERT INTO tasks(task_id, challenge_id, title_json, description_json, task_type, priority, status,
        required_capabilities_json, acceptance_criteria_json, input_artifacts_json, output_requirements_json)
      VALUES(?,?,?,?,?,?,?,?,?,'[]',?)`,
      taskId,
      challenge.id,
      titleJson,
      descJson,
      body.taskType,
      body.priority,
      body.status,
      JSON.stringify(body.requiredCapabilities),
      criteriaJson,
      outputJson
    ),
    ...body.dependencies.map((dep) =>
      sql(
        c.env.DB,
        'INSERT INTO task_dependencies(task_id, depends_on_task_id) VALUES(?,?) ON CONFLICT DO NOTHING',
        taskId,
        dep
      )
    ),
  ];

  await c.env.DB.batch(statements);
  const created = await sql(c.env.DB, tasks + ' WHERE t.task_id=?', taskId).first<
    Record<string, unknown>
  >();
  return c.json(created ? unpack(created) : { taskId }, 201);
});

adminConsole.patch('/api/admin/console/users/:githubId/role', async (c) => {
  assertAdminIp(c, true);
  const githubId = key.parse(c.req.param('githubId'));
  const body = await json(c, z.object({ role: z.enum(userRoles) }).strict());
  const updated = await sql(
    c.env.DB,
    `UPDATE users SET role=?, updated_at=${now} WHERE github_id=? RETURNING github_id githubId, username, role`,
    body.role,
    githubId
  ).first();
  if (!updated) fail(404, 'NOT_FOUND');
  return c.json(updated);
});
