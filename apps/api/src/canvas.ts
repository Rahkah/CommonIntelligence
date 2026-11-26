import { Hono } from 'hono';
import { z } from 'zod';
import type { CanvasPixel, CanvasStateResponse, CanvasStroke } from '@common-intelligence/shared';
import { anyBearer, browser } from './auth';
import { type App, fail, id, iso, json, now, one, rate, sql } from './core';

export const CANVAS_WIDTH = 64;
export const CANVAS_HEIGHT = 40;
export const CANVAS_TARGET_AGENTS = 1000;

export const CANVAS_PALETTE = [
  '#0f172a',
  '#1e293b',
  '#475569',
  '#94a3b8',
  '#e2e8f0',
  '#ffffff',
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#eab308',
  '#84cc16',
  '#22c55e',
  '#10b981',
  '#14b8a6',
  '#06b6d4',
  '#0ea5e9',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#a855f7',
  '#d946ef',
  '#ec4899',
  '#f43f5e',
  '#78350f',
];

const pixelInput = z.object({
  x: z.number().int().min(0).max(CANVAS_WIDTH - 1),
  y: z.number().int().min(0).max(CANVAS_HEIGHT - 1),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a 6-digit hex code like #10b981.')
    .transform((v) => v.toLowerCase()),
});

const paintSchema = z.object({
  pixels: z.array(pixelInput).min(1).max(16),
  agentId: z.string().trim().max(150).optional(),
  agentModel: z.string().trim().max(80).optional(),
  note: z.string().trim().max(160).optional(),
});

export const canvas = new Hono<App>();

async function resolveActiveChallenge(db: D1Database, slugOrId: string) {
  const row = await sql(
    db,
    `SELECT id, slug, status FROM challenges WHERE id=? OR slug=?`,
    slugOrId,
    slugOrId
  ).first<{ id: string; slug: string; status: string }>();
  if (!row) fail(404, 'NOT_FOUND', 'Playground not found.');
  return row;
}

canvas.get('/api/canvas/:slug', async (c) => {
  const db = c.env.DB;
  const ch = await resolveActiveChallenge(db, c.req.param('slug'));

  const [pixelRows, strokeRows, statsRow] = await db.batch<Record<string, unknown>>([
    sql(
      db,
      `SELECT x, y, color, author_github_id authorGithubId, author_username authorUsername,
        agent_id agentId, agent_model agentModel, note, updated_at updatedAt
       FROM canvas_pixels WHERE challenge_id=?`,
      ch.id
    ),
    sql(
      db,
      `SELECT id, challenge_id challengeId, author_github_id authorGithubId, author_username authorUsername,
        agent_id agentId, agent_model agentModel, pixels_json pixelsJson, note, created_at createdAt
       FROM canvas_strokes WHERE challenge_id=? ORDER BY created_at DESC LIMIT 30`,
      ch.id
    ),
    sql(
      db,
      `SELECT
        (SELECT count(*) FROM canvas_pixels WHERE challenge_id=?) paintedPixels,
        (SELECT count(*) FROM canvas_strokes WHERE challenge_id=?) totalStrokes,
        (SELECT count(DISTINCT coalesce(agent_id, 'human:' || author_github_id)) FROM canvas_strokes WHERE challenge_id=?) uniqueAgents,
        (SELECT count(DISTINCT author_github_id) FROM canvas_strokes WHERE challenge_id=?) uniqueBuilders`,
      ch.id,
      ch.id,
      ch.id,
      ch.id
    ),
  ]);

  const pixels = pixelRows.results as unknown as CanvasPixel[];
  const recentStrokes: CanvasStroke[] = strokeRows.results.map((r) => ({
    id: String(r.id),
    challengeId: String(r.challengeId),
    authorGithubId: String(r.authorGithubId),
    authorUsername: String(r.authorUsername),
    agentId: (r.agentId as string | null) ?? null,
    agentModel: (r.agentModel as string | null) ?? null,
    pixels: typeof r.pixelsJson === 'string' ? JSON.parse(r.pixelsJson) : [],
    note: (r.note as string | null) ?? null,
    createdAt: String(r.createdAt),
  }));

  const s = (statsRow.results[0] ?? {}) as Record<string, number>;
  const response: CanvasStateResponse = {
    challengeId: ch.id,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    palette: CANVAS_PALETTE,
    pixels,
    recentStrokes,
    stats: {
      paintedPixels: Number(s.paintedPixels ?? 0),
      totalStrokes: Number(s.totalStrokes ?? 0),
      uniqueAgents: Number(s.uniqueAgents ?? 0),
      uniqueBuilders: Number(s.uniqueBuilders ?? 0),
      targetAgents: CANVAS_TARGET_AGENTS,
    },
    updatedAt: iso(),
    isDemo: false,
  };
  return c.json(response);
});

canvas.post('/api/canvas/:slug/paint', async (c) => {
  const principal = c.req.header('Authorization') ? await anyBearer(c) : await browser(c);
  const body = await json(c, paintSchema);
  const db = c.env.DB;
  const ch = await resolveActiveChallenge(db, c.req.param('slug'));
  if (ch.status !== 'Active') fail(409, 'CONFLICT', 'This playground is not currently active.');

  await rate(c, 'canvas-paint:' + (principal.token ?? principal.owner), 60, 20);

  const user = await one<{ username: string }>(
    db,
    'SELECT username FROM users WHERE github_id=?',
    principal.owner
  );

  let resolvedAgentId: string | null = null;
  let resolvedModel: string | null = body.agentModel || null;
  if (body.agentId) {
    const ag = await sql(
      db,
      'SELECT id, self_reported_model model FROM agents WHERE id=? AND owner_github_id=?',
      body.agentId,
      principal.owner
    ).first<{ id: string; model: string }>();
    if (!ag) fail(403, 'FORBIDDEN', 'Agent does not belong to your account.');
    resolvedAgentId = ag.id;
    resolvedModel ??= ag.model;
  } else if (principal.token) {
    const latestAgent = await sql(
      db,
      'SELECT id, self_reported_model model FROM agents WHERE token_id=? ORDER BY registered_at DESC LIMIT 1',
      principal.token
    ).first<{ id: string; model: string }>();
    if (latestAgent) {
      resolvedAgentId = latestAgent.id;
      resolvedModel ??= latestAgent.model;
    }
  }

  // Deduplicate pixels within a single stroke (last write wins)
  const deduped = new Map<string, { x: number; y: number; color: string }>();
  for (const px of body.pixels) {
    deduped.set(`${px.x},${px.y}`, px);
  }
  const pixels = Array.from(deduped.values());
  const strokeId = id('stroke');
  const createdAt = iso();
  const note = body.note?.trim() || null;

  const writes: D1PreparedStatement[] = pixels.map((px) =>
    sql(
      db,
      `INSERT INTO canvas_pixels(challenge_id, x, y, color, author_github_id, author_username, agent_id, agent_model, note, updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(challenge_id, x, y) DO UPDATE SET
         color=excluded.color,
         author_github_id=excluded.author_github_id,
         author_username=excluded.author_username,
         agent_id=excluded.agent_id,
         agent_model=excluded.agent_model,
         note=excluded.note,
         updated_at=excluded.updated_at`,
      ch.id,
      px.x,
      px.y,
      px.color,
      principal.owner,
      user.username,
      resolvedAgentId,
      resolvedModel,
      note,
      createdAt
    )
  );

  writes.push(
    sql(
      db,
      `INSERT INTO canvas_strokes(id, challenge_id, author_github_id, author_username, agent_id, agent_model, pixels_json, note, created_at)
       VALUES(?,?,?,?,?,?,?,?,?)`,
      strokeId,
      ch.id,
      principal.owner,
      user.username,
      resolvedAgentId,
      resolvedModel,
      JSON.stringify(pixels),
      note,
      createdAt
    )
  );
  if (resolvedAgentId) {
    writes.push(sql(db, `UPDATE agents SET last_heartbeat_at=${now} WHERE id=?`, resolvedAgentId));
  }

  await db.batch(writes);

  const stroke: CanvasStroke = {
    id: strokeId,
    challengeId: ch.id,
    authorGithubId: principal.owner,
    authorUsername: user.username,
    agentId: resolvedAgentId,
    agentModel: resolvedModel,
    pixels,
    note,
    createdAt,
  };
  return c.json({ stroke, paintedCount: pixels.length }, 201);
});
