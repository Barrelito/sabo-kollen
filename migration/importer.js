const TABLES = {
  boenden: ['id', 'created_at', 'namn'],
  rapporter: ['id', 'created_at', 'boende', 'prio', 'atgard', 'mapp_status', 'brister', 'fritext']
};

function decodeCopyField(field) {
  if (field === '\\N') return null;
  return field.replace(/\\([0-7]{1,3}|x[0-9a-fA-F]{2}|.)/g, (_, escape) => {
    if (/^[0-7]/.test(escape)) return String.fromCharCode(Number.parseInt(escape, 8));
    if (escape.startsWith('x')) return String.fromCharCode(Number.parseInt(escape.slice(1), 16));
    return ({ b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', '\\': '\\' })[escape] ?? escape;
  });
}

export function parseBackup(sqlText) {
  const parsed = Object.fromEntries(Object.entries(TABLES).map(([table, columns]) => [table, { columns, rows: [] }]));
  parsed.sequenceValues = {};
  const lines = String(sqlText).split(/\r?\n/);
  let active = null;
  const seen = new Set();
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!active) {
      const sequence = line.match(/^SELECT pg_catalog\.setval\('public\.(boenden_id_seq|rapporter_id_seq)', ([0-9]+), (true|false)\);$/);
      if (sequence) {
        parsed.sequenceValues[sequence[1]] = { value: Number(sequence[2]), isCalled: sequence[3] === 'true' };
        continue;
      }
      const match = line.match(/^COPY public\.([a-z_]+) \(([^)]+)\) FROM stdin;$/);
      if (match) {
        const table = match[1];
        const columns = match[2].split(',').map(value => value.trim());
        if (TABLES[table] && columns.join(',') !== TABLES[table].join(',')) throw new Error(`Oväntade kolumner för public.${table}.`);
        if (TABLES[table] && seen.has(table)) throw new Error(`Dubblerat COPY-block för public.${table}.`);
        if (TABLES[table]) seen.add(table);
        active = TABLES[table] ? table : '__ignored__';
      }
      continue;
    }
    if (line === '\\.') { active = null; continue; }
    if (index === lines.length - 1 && line === '') break;
    if (active === '__ignored__') continue;
    const values = line.split('\t').map(decodeCopyField);
    if (values.length !== TABLES[active].length) throw new Error(`Fel antal kolumner i public.${active}.`);
    parsed[active].rows.push(values);
  }
  if (active) throw new Error('Backupen innehåller ett avbrutet COPY-block.');
  const missing = Object.keys(TABLES).filter(table => !seen.has(table));
  if (missing.length) throw new Error(`Backupen saknar COPY-data för: ${missing.join(', ')}.`);
  return parsed;
}

export function backupMetadata(parsed) {
  const tableMetadata = {};
  for (const table of Object.keys(TABLES)) {
    const data = parsed[table];
    const ids = data.rows.map(row => Number(row[0]));
    const dates = data.rows.map(row => new Date(row[1])).filter(date => !Number.isNaN(date.getTime()));
    tableMetadata[table] = {
      columns: [...data.columns],
      rows: data.rows.length,
      minId: ids.length ? Math.min(...ids) : null,
      maxId: ids.length ? Math.max(...ids) : null,
      firstTimestamp: dates.length ? new Date(Math.min(...dates)).toISOString() : null,
      lastTimestamp: dates.length ? new Date(Math.max(...dates)).toISOString() : null
    };
  }
  return { tables: tableMetadata, sequences: { ...parsed.sequenceValues } };
}

async function transaction(db, work) {
  if (typeof db.transaction === 'function') return db.transaction(work);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function verifyTable(db, table, data) {
  const count = await db.query(`SELECT count(*)::int AS count FROM ${table}`);
  if (Number(count.rows[0].count) !== data.rows.length) throw new Error(`Verifiering misslyckades för ${table}: fel radantal.`);
  const conditions = data.columns.map((column, index) => `${column} IS NOT DISTINCT FROM $${index + 1}`).join(' AND ');
  for (const expected of data.rows) {
    const found = await db.query(`SELECT 1 FROM ${table} WHERE ${conditions}`, expected);
    if (found.rows.length !== 1) throw new Error(`Verifiering misslyckades för ${table} vid id ${expected[0]}.`);
  }
}

export async function importBackup(db, parsed, { schemaSql } = {}) {
  return transaction(db, async tx => {
    if (schemaSql) {
      if (typeof tx.exec === 'function') await tx.exec(schemaSql);
      else await tx.query(schemaSql);
    }
    const counts = await tx.query(`
      SELECT (SELECT count(*)::int FROM boenden) AS boenden,
             (SELECT count(*)::int FROM rapporter) AS rapporter
    `);
    if (Number(counts.rows[0].boenden) || Number(counts.rows[0].rapporter)) {
      throw new Error('Måldatabasen är inte tom; importen avbröts.');
    }
    for (const table of Object.keys(TABLES)) {
      const data = parsed[table];
      const placeholders = data.columns.map((_, index) => `$${index + 1}`).join(', ');
      const sql = `INSERT INTO ${table} (${data.columns.join(', ')}) VALUES (${placeholders})`;
      for (const row of data.rows) await tx.query(sql, row);
    }
    for (const table of Object.keys(TABLES)) {
      const sequenceName = `${table}_id_seq`;
      const restored = parsed.sequenceValues?.[sequenceName];
      const maxId = parsed[table].rows.reduce((max, row) => Math.max(max, Number(row[0])), 0);
      const value = Math.max(maxId, restored?.value || 0, 1);
      const isCalled = maxId > 0 || restored?.isCalled === true;
      await tx.query(`SELECT setval(pg_get_serial_sequence('${table}','id'), $1, $2)`, [value, isCalled]);
    }
    await verifyTable(tx, 'boenden', parsed.boenden);
    await verifyTable(tx, 'rapporter', parsed.rapporter);
    return { boenden: parsed.boenden.rows.length, rapporter: parsed.rapporter.rows.length };
  });
}
