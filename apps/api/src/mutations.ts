import { z } from 'zod';
import { type Ctx, digest, required, fail, hex, utf8, iso, now, sql } from './core';
import type { Principal } from './auth';

type Change = { writes: D1PreparedStatement[]; result: object; status?: 200 | 201 };
type Cached = { request_hash: string; response_body: string; response_status: 200 | 201 };
function bytes(s: string) {
  return Uint8Array.from(s.match(/../g) ?? [], (v) => parseInt(v, 16));
}

// A claim response includes a lease secret. Keep only authenticated ciphertext in the replay cache.
async function cacheKey(c: Ctx) {
  return crypto.subtle.importKey(
    'raw',
    await crypto.subtle.digest('SHA-256', utf8('response-cache:' + required(c.env.TOKEN_PEPPER))),
    'AES-GCM',
    false,
    ['encrypt', 'decrypt']
  );
}
export async function mutate(c: Ctx, p: Principal, build: () => Promise<Change>) {
  const key = c.req.header('Idempotency-Key');
  if (!key) {
    const change = await build();
    await c.env.DB.batch(change.writes);
    return c.json(change.result, change.status ?? 200);
  }
  z.uuidv4().parse(key);
  const scope = (p.token ?? 'user:' + p.owner) + ':' + c.req.method + ':' + c.req.path;
  const hash = await digest(await c.req.text());
  const encryption = await cacheKey(c),
    aad = utf8(scope + ':' + key);
  async function replay() {
    const row = await sql(
      c.env.DB,
      `SELECT * FROM idempotency_keys WHERE key=? AND scope_key=? AND expires_at>${now}`,
      key,
      scope
    ).first<Cached>();
    if (!row) return null;
    if (row.request_hash !== hash) fail(409, 'IDEMPOTENCY_CONFLICT');
    const [iv, body] = row.response_body.split('.');
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes(iv), additionalData: aad },
      encryption,
      bytes(body)
    );
    return c.json(JSON.parse(new TextDecoder().decode(plain)), row.response_status);
  }
  const cached = await replay();
  if (cached) return cached;
  try {
    const change = await build(),
      iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData: aad },
      encryption,
      utf8(JSON.stringify(change.result))
    );
    await c.env.DB.batch([
      sql(
        c.env.DB,
        `DELETE FROM idempotency_keys WHERE key=? AND scope_key=? AND expires_at<=${now}`,
        key,
        scope
      ),
      sql(
        c.env.DB,
        'INSERT INTO idempotency_keys(key,scope_key,request_hash,response_status,response_body,expires_at) VALUES(?,?,?,?,?,?)',
        key,
        scope,
        hash,
        change.status ?? 200,
        hex(iv) + '.' + hex(cipher),
        iso(86400000)
      ),
      ...change.writes,
    ]);
    return c.json(change.result, change.status ?? 200);
  } catch (err) {
    const duplicate = await replay();
    if (duplicate) return duplicate;
    throw err;
  }
}
