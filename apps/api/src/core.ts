import type { Context } from 'hono';
import type { ApiErrorCode } from '@common-intelligence/shared';
import { z } from 'zod';

export type Bindings = Omit<Env, 'APP_ORIGIN'> & {
  APP_ORIGIN: string;
  LOCAL_DEV_AUTH_BYPASS?: string;
  ADMIN_IP_ALLOWLIST?: string;
  SESSION_SECRET?: string;
  TOKEN_PEPPER?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GITHUB_WEBHOOK_SECRET?: string;
};
export type App = { Bindings: Bindings };
export type Ctx = Context<App>;
export const now = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
export const after = (modifier: string) => "strftime('%Y-%m-%dT%H:%M:%fZ','now','" + modifier + "')";
export const iso = (ms = 0) => new Date(Date.now() + ms).toISOString();
export const id = (prefix: string) => prefix + '_' + crypto.randomUUID();
export const localized = (s: string) => ({ en: s, zh: s });
export const statuses = [
  'Proposed',
  'Pending',
  'Available',
  'Leased',
  'Submitted',
  'Verifying',
  'Accepted',
  'Rejected',
  'Blocked',
  'Cancelled',
] as const;
export const scopes = [
  'agent:register',
  'tasks:read',
  'tasks:claim',
  'tasks:propose',
  'knowledge:read',
] as const;
export const field = (max: number) => z.string().trim().min(1).max(max);
export const key = field(150);
export class Fault extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 429 | 500 | 503,
    readonly code: ApiErrorCode,
    message: string = code
  ) {
    super(message);
  }
}
export function fail(status: Fault['status'], code: ApiErrorCode, msg?: string): never {
  throw new Fault(status, code, msg);
}
export function required(value: string | undefined) {
  return value || fail(503, 'INTERNAL_ERROR', 'Service configuration is incomplete.');
}
export function hex(buf: ArrayBuffer | Uint8Array) {
  return Array.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf), (n) =>
    n.toString(16).padStart(2, '0')
  ).join('');
}
export const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export const utf8 = (s: string) => new TextEncoder().encode(s);
export const digest = async (s: string) => hex(await crypto.subtle.digest('SHA-256', utf8(s)));
export async function equal(a: string, b: string) {
  const [left, right] = await Promise.all([a, b].map((v) => crypto.subtle.digest('SHA-256', utf8(v))));
  let diff = 0;
  const x = new Uint8Array(left),
    y = new Uint8Array(right);
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
export function sql(db: D1Database, query: string, ...args: unknown[]) {
  const s = db.prepare(query);
  return args.length ? s.bind(...args) : s;
}
export function guard(db: D1Database, code: ApiErrorCode, condition: string, ...args: unknown[]) {
  return sql(db, `INSERT INTO mutation_guards(error) SELECT ? WHERE NOT (${condition})`, code, ...args);
}
export async function json<T>(c: Ctx, schema: z.ZodType<T>) {
  let value: unknown;
  try {
    value = await c.req.json();
  } catch {
    fail(400, 'VALIDATION_ERROR', 'Expected a JSON object.');
  }
  return schema.parse(value);
}
export function unpack<T>(row: Record<string, unknown>): T {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k.endsWith('Json')) result[k.slice(0, -4)] = typeof v === 'string' ? JSON.parse(v) : v;
    else result[k] = v;
  }
  return result as T;
}
export async function one<T>(db: D1Database, query: string, ...args: unknown[]) {
  const row = await sql(db, query, ...args).first();
  if (!row) fail(404, 'NOT_FOUND');
  return unpack<T>(row);
}
export async function page<T>(c: Ctx, source: string, where: string, args: unknown[], order: string) {
  const limit = z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .parse(c.req.query('limit') ?? 50);
  const offset = z.coerce
    .number()
    .int()
    .min(0)
    .max(2147483647)
    .parse(c.req.query('offset') ?? 0);
  const from = ` FROM (${source}) WHERE ${where}`;
  const [count, rows] = await c.env.DB.batch<Record<string, unknown>>([
    sql(c.env.DB, 'SELECT count(*) AS n' + from, ...args),
    sql(c.env.DB, 'SELECT *' + from + ' ORDER BY ' + order + ' LIMIT ? OFFSET ?', ...args, limit, offset),
  ]);
  return { items: rows.results.map((r) => unpack<T>(r)), total: Number(count.results[0].n), limit, offset };
}
export async function rate(c: Ctx, bucket: string, seconds: number, limit: number) {
  const time = Math.floor(Date.now() / 1000);
  const end = time - (time % seconds) + seconds;
  const result = await sql(
    c.env.DB,
    `INSERT INTO rate_limit_buckets(bucket_key,count,expires_at) VALUES(?,1,?)
    ON CONFLICT(bucket_key) DO UPDATE SET count=count+1 WHERE count<? RETURNING count`,
    bucket + ':' + end,
    new Date(end * 1000).toISOString(),
    limit
  ).first();
  if (!result) {
    c.header('Retry-After', String(end - time));
    fail(429, 'RATE_LIMITED');
  }
}
export function event(
  db: D1Database,
  type: string,
  challenge: string,
  user: string,
  summary: string,
  task: string | null = null,
  agent: string | null = null,
  pr: string | null = null
) {
  return sql(
    db,
    `INSERT INTO activity_events(id,event_type,challenge_id,actor_github_id,summary_json,task_id,agent_id,pull_request_id)
    VALUES(?,?,?,?,?,?,?,?)`,
    id('evt'),
    type,
    challenge,
    user,
    JSON.stringify(localized(summary)),
    task,
    agent,
    pr
  );
}
