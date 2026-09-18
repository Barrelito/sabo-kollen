import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { backupMetadata, importBackup, parseBackup } from '../migration/importer.js';

neonConfig.webSocketConstructor = ws;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const path = args.find(arg => !arg.startsWith('--'));
if (!path || !path.endsWith('.backup.gz')) {
  console.error('Användning: npm run migrate -- [--dry-run] /sökväg/till/backup.backup.gz');
  process.exit(2);
}

const compressed = await readFile(path);
const parsed = parseBackup(gunzipSync(compressed).toString('utf8'));
console.log(JSON.stringify({ dryRun, ...backupMetadata(parsed) }, null, 2));

if (!dryRun) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL saknas.');
  const schemaSql = await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const result = await importBackup(pool, parsed, { schemaSql });
    console.log(`Import och innehållsverifiering klar: ${result.boenden} boenden, ${result.rapporter} rapporter.`);
  } finally {
    await pool.end();
  }
}
