import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { parseBackup, importBackup } from '../migration/importer.js';

const schema = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
let db;

beforeEach(async () => { db = new PGlite(); await db.exec(schema); });
afterEach(async () => db.close());

const synthetic = `
COPY public.boenden (id, created_at, namn) FROM stdin;
7\t2026-09-08 06:00:00+00\tSol\\tbacke
8\t2026-09-08 07:00:00+00\t\\N
\\.
COPY public.rapporter (id, created_at, boende, prio, atgard, mapp_status, brister, fritext) FROM stdin;
12\t2026-09-08 06:10:00.123456+00\tSol\\tbacke\t1\tTill Akut\tNEJ\tID-band\\nLäkemedel\tBackslash: \\\\ and CR\\r
\\.
COPY auth.users (id, email) FROM stdin;
secret\tprivate@example.test
\\.
SELECT pg_catalog.setval('public.boenden_id_seq', 23, true);
SELECT pg_catalog.setval('public.rapporter_id_seq', 76, true);
`;

describe('backup parser', () => {
  test('parses only whitelisted COPY data and PostgreSQL escapes exactly', () => {
    const parsed = parseBackup(synthetic);
    assert.deepEqual(parsed.boenden.rows, [['7', '2026-09-08 06:00:00+00', 'Sol\tbacke'], ['8', '2026-09-08 07:00:00+00', null]]);
    assert.deepEqual(parsed.rapporter.rows[0], ['12', '2026-09-08 06:10:00.123456+00', 'Sol\tbacke', '1', 'Till Akut', 'NEJ', 'ID-band\nLäkemedel', 'Backslash: \\ and CR\r']);
    assert.equal(JSON.stringify(parsed).includes('private@example.test'), false);
  });

  test('rejects changed columns for an allowed table', () => {
    assert.throws(() => parseBackup('COPY public.boenden (id, namn) FROM stdin;\n1\tA\n\\.\n'), /kolumner/);
  });

  test('rejects a backup missing either required table', () => {
    assert.throws(() => parseBackup('COPY public.boenden (id, created_at, namn) FROM stdin;\n1\t2026-01-01 00:00:00+00\tA\n\\.\n'), /saknar.*rapporter/i);
  });

  test('rejects a truncated COPY section', () => {
    assert.throws(() => parseBackup('COPY public.boenden (id, created_at, namn) FROM stdin;\n1\t2026-01-01 00:00:00+00\tA\n'), /avbrutet COPY/i);
  });
});

describe('transactional import', () => {
  test('preserves ids, nulls and timestamps, then advances sequences', async () => {
    const result = await importBackup(db, parseBackup(synthetic));
    assert.deepEqual(result, { boenden: 2, rapporter: 1 });
    const homes = await db.query('SELECT id, created_at, namn FROM boenden ORDER BY id');
    assert.equal(homes.rows[0].id, 7);
    assert.equal(homes.rows[0].created_at.toISOString(), '2026-09-08T06:00:00.000Z');
    assert.equal(homes.rows[1].namn, null);
    const next = await db.query("SELECT nextval(pg_get_serial_sequence('boenden','id')) AS id");
    assert.equal(Number(next.rows[0].id), 24);
  });

  test('refuses a nonempty target', async () => {
    await db.query("INSERT INTO boenden (namn) VALUES ('existing')");
    await assert.rejects(importBackup(db, parseBackup(synthetic)), /inte tom/);
  });

  test('rolls back every insert when one imported row is invalid', async () => {
    const parsed = parseBackup(synthetic);
    parsed.rapporter.rows[0][3] = null;
    await assert.rejects(importBackup(db, parsed));
    assert.equal((await db.query('SELECT count(*)::int AS count FROM boenden')).rows[0].count, 0);
    assert.equal((await db.query('SELECT count(*)::int AS count FROM rapporter')).rows[0].count, 0);
  });
});
