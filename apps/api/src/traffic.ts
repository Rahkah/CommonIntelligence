import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import { isPublicVisitPath, type SiteTrafficOverview } from '@common-intelligence/shared';
import { session } from './auth';
import { after, fail, id, json, now, rate, sql, type App } from './core';

const onlineMinutes = 5;
const visitorLifetimeSeconds = 86400;
const visitorCookie = 'ci_visitor';
const visitorId = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const input = z.object({
  path: z.string().refine(isPublicVisitPath, 'Expected a public page path.').optional(),
}).strict();

function isLoopback(origin: string) {
  return /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(origin);
}

export const traffic = new Hono<App>();
traffic.post('/api/site-traffic', async (c) => {
  const origin = c.req.header('Origin') ?? '';
  if (origin !== c.env.APP_ORIGIN && !(isLoopback(c.env.APP_ORIGIN) && isLoopback(origin)))
    fail(403, 'FORBIDDEN');
  const { path } = await json(c, input);
  await rate(c, 'traffic:' + (c.req.header('CF-Connecting-IP') ?? 'local'), 60, 300);
  const browser = getCookie(c, visitorCookie) ?? '';
  const visitor = visitorId.test(browser) ? browser : crypto.randomUUID();
  const signedIn = await session(c);
  const db = c.env.DB;
  const writes = [
    sql(
      db,
      `INSERT INTO site_presence(visitor_id,github_id,last_seen_at) VALUES(?,?,${now})
       ON CONFLICT(visitor_id) DO UPDATE SET github_id=excluded.github_id,last_seen_at=excluded.last_seen_at`,
      visitor,
      signedIn?.github_id ?? null
    ),
  ];
  if (path !== undefined) {
    writes.push(sql(db,
      `INSERT INTO site_page_views(id,path,signed_in,visited_at) VALUES(?,?,?,${now})`,
      id('visit'), path, Number(!!signedIn)
    ));
  }
  await db.batch(writes);
  if (visitor !== browser) {
    setCookie(c, visitorCookie, visitor, {
      path: '/api/site-traffic',
      sameSite: 'Lax',
      secure: c.env.APP_ORIGIN.startsWith('https://'),
      httpOnly: true,
      maxAge: visitorLifetimeSeconds,
    });
  }
  return c.body(null, 204);
});

export async function siteTrafficOverview(db: D1Database): Promise<SiteTrafficOverview> {
  const [counts, visits] = await db.batch<{
    registeredUsers: number;
    onlineRegistered: number;
    onlineAnonymous: number;
    totalViews: number;
    recentViews: number;
    id: string;
    path: string;
    signedIn: number;
    visitedAt: string;
  }>([
    sql(db, `SELECT
      (SELECT count(*) FROM users) registeredUsers,
      count(DISTINCT github_id) onlineRegistered,
      count(*)-count(github_id) onlineAnonymous,
      (SELECT coalesce(sum(page_views),0) FROM site_daily_traffic) totalViews,
      (SELECT count(*) FROM site_page_views WHERE visited_at>${after('-24 hours')}) recentViews
      FROM site_presence WHERE last_seen_at>${after(`-${onlineMinutes} minutes`)}`),
    sql(db, `SELECT id,path,signed_in signedIn,visited_at visitedAt
      FROM site_page_views ORDER BY visited_at DESC,id DESC LIMIT 50`),
  ]);
  const metrics = counts.results[0];
  return {
    registeredUsers: metrics.registeredUsers,
    online: {
      total: metrics.onlineRegistered + metrics.onlineAnonymous,
      registered: metrics.onlineRegistered,
      anonymous: metrics.onlineAnonymous,
      minutes: onlineMinutes,
    },
    pageViews: { total: metrics.totalViews, last24Hours: metrics.recentViews },
    recentVisits: visits.results.map(({ id, path, signedIn, visitedAt }) =>
      ({ id, path, signedIn: signedIn === 1, visitedAt })),
  };
}
