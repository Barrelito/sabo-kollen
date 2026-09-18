import assert from 'node:assert/strict';
import { beforeEach, afterEach, describe, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { createApi } from '../server/app.js';
import { hashPassword } from '../server/password.js';

const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
const secret = 'test-session-secret-that-is-at-least-32-bytes';
const origin = 'https://example.test';
let db;
let api;

function req(method, path, body, headers = {}) {
  return {
    method,
    url: `${origin}${path}`,
    headers: {
      host: 'example.test',
      origin,
      'content-type': 'application/json',
      ...headers
    },
    body
  };
}

async function login(password = 'correct horse battery staple', ip = '192.0.2.1') {
  const response = await api.handle(req('POST', '/api/admin/session', { password }, { 'x-forwarded-for': ip }));
  const cookie = response.headers['set-cookie']?.split(';')[0];
  return { response, cookie };
}

beforeEach(async () => {
  db = new PGlite();
  await db.exec(schema);
  api = createApi({
    db,
    sessionSecret: secret,
    adminPasswordHash: hashPassword('correct horse battery staple', Buffer.alloc(16, 7)),
    now: () => new Date('2026-03-29T00:30:00.000Z')
  });
});

afterEach(async () => db.close());

describe('administration access', () => {
  test('rejects anonymous report reads and residence changes', async () => {
    const reports = await api.handle(req('GET', '/api/admin/reports'));
    const create = await api.handle(req('POST', '/api/admin/residences', { name: 'A' }));
    assert.equal(reports.status, 401);
    assert.equal(create.status, 401);
  });

  test('accepts a valid login and rejects tampered and expired sessions', async () => {
    const { response, cookie } = await login();
    assert.equal(response.status, 200);
    assert.match(response.headers['set-cookie'], /HttpOnly; Secure; SameSite=Strict/);

    const valid = await api.handle(req('GET', '/api/admin/reports', undefined, { cookie }));
    assert.equal(valid.status, 200);

    const tampered = `${cookie.slice(0, -1)}x`;
    assert.equal((await api.handle(req('GET', '/api/admin/reports', undefined, { cookie: tampered }))).status, 401);

    const expiredApi = createApi({
      db,
      sessionSecret: secret,
      adminPasswordHash: hashPassword('correct horse battery staple', Buffer.alloc(16, 7)),
      now: () => new Date('2026-04-01T00:31:00.000Z')
    });
    assert.equal((await expiredApi.handle(req('GET', '/api/admin/reports', undefined, { cookie }))).status, 401);
  });

  test('persists login throttling in PostgreSQL across API instances', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      assert.equal((await login('wrong', '198.51.100.8')).response.status, 401);
    }
    const secondInstance = createApi({
      db,
      sessionSecret: secret,
      adminPasswordHash: hashPassword('correct horse battery staple', Buffer.alloc(16, 7)),
      now: () => new Date('2026-03-29T00:30:01.000Z')
    });
    const blocked = await secondInstance.handle(req('POST', '/api/admin/session', { password: 'correct horse battery staple' }, { 'x-forwarded-for': '198.51.100.8' }));
    assert.equal(blocked.status, 429);
  });

  test('atomically blocks concurrent password attempts sharing a client key', async () => {
    const attempts = await Promise.all(Array.from({ length: 20 }, () =>
      api.handle(req('POST', '/api/admin/session', { password: 'wrong' }, { 'x-forwarded-for': '203.0.113.9' }))
    ));
    assert.equal(attempts.filter(result => result.status === 401).length, 5);
    assert.equal(attempts.filter(result => result.status === 429).length, 15);
    const stored = await db.query('SELECT failures FROM admin_login_throttles');
    assert.equal(stored.rows[0].failures, 6);
  });

  test('allows a correct login after lockout expires despite attempts during lockout', async () => {
    let clock = new Date('2026-03-29T10:00:00.000Z');
    const timedApi = createApi({
      db,
      sessionSecret: secret,
      adminPasswordHash: hashPassword('correct horse battery staple', Buffer.alloc(16, 7)),
      now: () => clock
    });
    const attempt = password => timedApi.handle(req('POST', '/api/admin/session', { password }, { 'x-forwarded-for': '203.0.113.10' }));
    for (let index = 0; index < 5; index += 1) assert.equal((await attempt('wrong')).status, 401);
    clock = new Date('2026-03-29T10:14:00.000Z');
    assert.equal((await attempt('wrong')).status, 429);
    clock = new Date('2026-03-29T10:16:00.000Z');
    assert.equal((await attempt('wrong')).status, 429);
    clock = new Date('2026-03-29T10:29:01.000Z');
    assert.equal((await attempt('correct horse battery staple')).status, 200);
  });

  test('rejects cross-origin or non-JSON mutations', async () => {
    assert.equal((await api.handle(req('POST', '/api/reports', {}, { origin: 'https://evil.test' }))).status, 403);
    assert.equal((await api.handle(req('POST', '/api/reports', {}, { 'content-type': 'text/plain' }))).status, 415);
  });
});

describe('reports', () => {
  test('validates and persists a public report with parameter-like text as data', async () => {
    await db.query('INSERT INTO boenden (namn) VALUES ($1)', ['Solgläntan']);
    const payload = {
      boende: "Solgläntan' OR 1=1 --",
      prio: '1',
      atgard: 'Till Akut',
      mapp_status: 'JA',
      brister: '',
      fritext: "Robert'); DROP TABLE rapporter;--"
    };
    assert.equal((await api.handle(req('POST', '/api/reports', payload))).status, 422);
    payload.boende = 'Solgläntan';
    assert.equal((await api.handle(req('POST', '/api/reports', payload))).status, 201);
    const rows = await db.query('SELECT boende, fritext FROM rapporter');
    assert.deepEqual(rows.rows, [{ boende: 'Solgläntan', fritext: "Robert'); DROP TABLE rapporter;--" }]);
  });

  test('paginates by 50 and applies Europe/Stockholm calendar boundaries over DST', async () => {
    await db.query('INSERT INTO boenden (namn) VALUES ($1)', ['Solgläntan']);
    for (let i = 0; i < 52; i += 1) {
      await db.query(
        'INSERT INTO rapporter (created_at, boende, prio, atgard, mapp_status, brister, fritext) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [new Date(Date.UTC(2026, 2, 28, 23, 0, i)), 'Solgläntan', '2', 'Kvar hemma', 'JA', '', String(i)]
      );
    }
    await db.query(
      'INSERT INTO rapporter (created_at, boende, prio, atgard, mapp_status, brister, fritext) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [new Date('2026-03-29T22:00:00.000Z'), 'Solgläntan', '2', 'Kvar hemma', 'JA', '', 'next local day']
    );
    const { cookie } = await login();
    const page = await api.handle(req('GET', '/api/admin/reports?from=2026-03-29&to=2026-03-29&limit=50&offset=0', undefined, { cookie }));
    assert.equal(page.status, 200);
    assert.equal(page.body.reports.length, 50);
    assert.equal(page.body.total, 52);
    assert.equal(page.body.reports[0].created_at, '2026-03-28T23:00:51.000Z');
    const invalid = await api.handle(req('GET', '/api/admin/reports?from=2026-02-31', undefined, { cookie }));
    assert.equal(invalid.status, 422);
  });
});
