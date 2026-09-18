import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import { createApi } from './app.js';

neonConfig.webSocketConstructor = ws;
let runtime;

export function getRuntime() {
  if (runtime) return runtime;
  const { DATABASE_URL, SESSION_SECRET, ADMIN_PASSWORD_HASH } = process.env;
  if (!DATABASE_URL || !SESSION_SECRET || !ADMIN_PASSWORD_HASH) throw new Error('Serverkonfiguration saknas.');
  runtime = createApi({ db: new Pool({ connectionString: DATABASE_URL }), sessionSecret: SESSION_SECRET, adminPasswordHash: ADMIN_PASSWORD_HASH });
  return runtime;
}
