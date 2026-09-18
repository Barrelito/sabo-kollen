import { createHash } from 'node:crypto';
import { clearSessionCookie, createSessionCookie, readSession } from './session.js';
import { verifyPassword } from './password.js';
import { stockholmRange } from './dates.js';

const ALLOWED_ACTIONS = ['Kvar hemma', 'Till Geriatrik', 'Till Akut', 'Till Närakut'];
const PAGE_SIZE = 50;

function response(status, body, headers = {}) {
  return { status, body, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } };
}

function header(request, name) {
  const entries = request.headers || {};
  return entries[name] ?? entries[name.toLowerCase()] ?? entries[name.toUpperCase()];
}

function requireSameOriginJson(request) {
  if (!String(header(request, 'content-type') || '').toLowerCase().startsWith('application/json')) {
    return response(415, { error: 'Begäran måste skickas som JSON.' });
  }
  const url = new URL(request.url, 'https://localhost');
  const origin = header(request, 'origin');
  const fetchSite = header(request, 'sec-fetch-site');
  if ((origin && origin !== url.origin) || (fetchSite && !['same-origin', 'none'].includes(fetchSite))) {
    return response(403, { error: 'Begäran kom från en annan webbplats.' });
  }
  return null;
}

function bodyOf(request) {
  return request.body && typeof request.body === 'object' ? request.body : {};
}

function clientKey(request) {
  const ip = String(header(request, 'x-forwarded-for') || header(request, 'x-real-ip') || 'unknown').split(',')[0].trim();
  return createHash('sha256').update(ip).digest('hex');
}

function serializeReport(row) {
  return { ...row, id: Number(row.id), created_at: new Date(row.created_at).toISOString() };
}

function reportValidation(payload) {
  if (!payload.boende || typeof payload.boende !== 'string' || payload.boende.length > 200) return 'Välj ett giltigt boende.';
  if (!['1', '2', '3'].includes(String(payload.prio))) return 'Välj en giltig prioritet.';
  if (!ALLOWED_ACTIONS.includes(payload.atgard)) return 'Välj en giltig åtgärd.';
  if (!['JA', 'NEJ'].includes(payload.mapp_status)) return 'Ange om Röda Mappen var komplett.';
  if (payload.mapp_status === 'JA' && payload.brister) return 'En komplett mapp kan inte ha registrerade brister.';
  if (String(payload.brister || '').length > 2000 || String(payload.fritext || '').length > 5000) return 'Texten är för lång.';
  return null;
}

async function reserveLoginAttempt(db, key, now) {
  const resetBefore = new Date(now.getTime() - 15 * 60 * 1000);
  const blockedUntil = new Date(now.getTime() + 15 * 60 * 1000);
  const result = await db.query(`
    INSERT INTO admin_login_throttles (client_key, window_started, failures, blocked_until)
    VALUES ($1, $2, 1, NULL)
    ON CONFLICT (client_key) DO UPDATE SET
      failures = CASE
        WHEN admin_login_throttles.blocked_until > $2::timestamptz THEN admin_login_throttles.failures
        WHEN admin_login_throttles.window_started <= $3::timestamptz THEN 1
        ELSE admin_login_throttles.failures + 1
      END,
      window_started = CASE
        WHEN admin_login_throttles.blocked_until > $2::timestamptz THEN admin_login_throttles.window_started
        WHEN admin_login_throttles.window_started <= $3::timestamptz THEN $2
        ELSE admin_login_throttles.window_started
      END,
      blocked_until = CASE
        WHEN admin_login_throttles.blocked_until > $2::timestamptz THEN admin_login_throttles.blocked_until
        WHEN admin_login_throttles.window_started <= $3::timestamptz THEN NULL
        WHEN admin_login_throttles.failures + 1 > 5 THEN $4::timestamptz
        ELSE NULL
      END
    RETURNING window_started, failures, blocked_until
  `, [key, now, resetBefore, blockedUntil]);
  const reservation = result.rows[0];
  return { reservation, blocked: reservation.blocked_until && new Date(reservation.blocked_until) > now };
}

async function clearSuccessfulReservation(db, key, reservation) {
  await db.query(`
    DELETE FROM admin_login_throttles
    WHERE client_key = $1
      AND window_started IS NOT DISTINCT FROM $2
      AND failures = $3
      AND blocked_until IS NOT DISTINCT FROM $4
  `, [key, reservation.window_started, reservation.failures, reservation.blocked_until]);
}

function authenticated(request, secret, now) {
  return readSession(header(request, 'cookie'), secret, now);
}

export function createApi({ db, sessionSecret, adminPasswordHash, now = () => new Date() }) {
  if (!db || !sessionSecret || sessionSecret.length < 32 || !adminPasswordHash) throw new Error('Serverkonfiguration saknas.');

  return {
    async handle(request) {
      try {
        const method = String(request.method || 'GET').toUpperCase();
        const url = new URL(request.url, 'https://localhost');
        const path = url.pathname;
        const currentTime = now();

        if (!['GET', 'HEAD'].includes(method)) {
          const csrf = requireSameOriginJson(request);
          if (csrf) return csrf;
        }

        if (method === 'GET' && path === '/api/residences') {
          const result = await db.query('SELECT id, namn FROM boenden WHERE namn IS NOT NULL ORDER BY namn ASC');
          return response(200, { residences: result.rows.map(row => ({ id: Number(row.id), name: row.namn })) });
        }

        if (method === 'POST' && path === '/api/reports') {
          const payload = bodyOf(request);
          const validation = reportValidation(payload);
          if (validation) return response(422, { error: validation });
          const residence = await db.query('SELECT 1 FROM boenden WHERE namn = $1 LIMIT 1', [payload.boende]);
          if (!residence.rows.length) return response(422, { error: 'Det valda boendet finns inte.' });
          await db.query(
            'INSERT INTO rapporter (boende, prio, atgard, mapp_status, brister, fritext) VALUES ($1,$2,$3,$4,$5,$6)',
            [payload.boende, String(payload.prio), payload.atgard, payload.mapp_status, payload.brister || '', payload.fritext || '']
          );
          return response(201, { ok: true });
        }

        if (method === 'POST' && path === '/api/admin/session') {
          const key = clientKey(request);
          const { reservation, blocked } = await reserveLoginAttempt(db, key, currentTime);
          if (blocked) return response(429, { error: 'För många försök. Vänta 15 minuter och försök igen.' });
          if (!verifyPassword(bodyOf(request).password, adminPasswordHash)) {
            return response(401, { error: 'Fel lösenord.' });
          }
          await clearSuccessfulReservation(db, key, reservation);
          return response(200, { authenticated: true }, { 'set-cookie': createSessionCookie(sessionSecret, currentTime) });
        }

        if (method === 'DELETE' && path === '/api/admin/session') {
          return response(200, { authenticated: false }, { 'set-cookie': clearSessionCookie() });
        }

        if (method === 'GET' && path === '/api/admin/session') {
          return authenticated(request, sessionSecret, currentTime)
            ? response(200, { authenticated: true })
            : response(401, { authenticated: false, error: 'Administratörssessionen har gått ut.' });
        }

        if (path.startsWith('/api/admin/') && !authenticated(request, sessionSecret, currentTime)) {
          return response(401, { error: 'Logga in som administratör.' });
        }

        if (method === 'GET' && path === '/api/admin/reports') {
          const requestedLimit = Number(url.searchParams.get('limit') || PAGE_SIZE);
          const limit = Math.min(Math.max(Number.isInteger(requestedLimit) ? requestedLimit : PAGE_SIZE, 1), 1000);
          const offset = Math.max(Number(url.searchParams.get('offset') || 0) || 0, 0);
          const boende = url.searchParams.get('boende');
          let range;
          try { range = stockholmRange(url.searchParams.get('from'), url.searchParams.get('to')); }
          catch { return response(422, { error: 'Datumfiltret är ogiltigt.' }); }
          const where = [];
          const values = [];
          if (boende) { values.push(boende); where.push(`boende = $${values.length}`); }
          if (range.from) { values.push(range.from); where.push(`created_at >= $${values.length}`); }
          if (range.toExclusive) { values.push(range.toExclusive); where.push(`created_at < $${values.length}`); }
          const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
          const count = await db.query(`SELECT count(*)::int AS count FROM rapporter${clause}`, values);
          const rows = await db.query(
            `SELECT id, created_at, boende, prio, atgard, mapp_status, brister, fritext FROM rapporter${clause} ORDER BY created_at DESC, id DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
            [...values, limit, offset]
          );
          return response(200, { reports: rows.rows.map(serializeReport), total: Number(count.rows[0].count), limit, offset });
        }

        if (method === 'GET' && path === '/api/admin/statistics') {
          const rows = await db.query('SELECT mapp_status, brister FROM rapporter');
          const total = rows.rows.length;
          const complete = rows.rows.filter(row => row.mapp_status === 'JA').length;
          const missing = {};
          for (const row of rows.rows) {
            if (row.mapp_status === 'NEJ' && row.brister) for (const item of row.brister.split(',')) {
              const clean = item.trim();
              if (clean) missing[clean] = (missing[clean] || 0) + 1;
            }
          }
          return response(200, { total, completePercent: total ? Math.round((complete / total) * 100) : 0, missing });
        }

        if (method === 'GET' && path === '/api/admin/residences') {
          const result = await db.query('SELECT id, namn FROM boenden WHERE namn IS NOT NULL ORDER BY namn ASC');
          return response(200, { residences: result.rows.map(row => ({ id: Number(row.id), name: row.namn })) });
        }

        if (method === 'POST' && path === '/api/admin/residences') {
          const name = String(bodyOf(request).name || '').trim();
          if (!name || name.length > 200) return response(422, { error: 'Ange ett giltigt namn.' });
          await db.query('INSERT INTO boenden (namn) VALUES ($1)', [name]);
          return response(201, { ok: true });
        }

        if (method === 'DELETE' && path === '/api/admin/residences') {
          const id = Number(bodyOf(request).id);
          if (!Number.isSafeInteger(id) || id < 1) return response(422, { error: 'Ogiltigt boende.' });
          await db.query('DELETE FROM boenden WHERE id = $1', [id]);
          return response(200, { ok: true });
        }

        return response(404, { error: 'Sidan finns inte.' });
      } catch (error) {
        console.error('API request failed', { name: error?.name || 'Error' });
        return response(500, { error: 'Databasen är tillfälligt otillgänglig. Försök igen senare.' });
      }
    }
  };
}
