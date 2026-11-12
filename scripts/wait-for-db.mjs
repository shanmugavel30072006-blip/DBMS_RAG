// ============================================================================
// Database connectivity wait script
// Usage: node scripts/wait-for-db.mjs
// Polls PostgreSQL until it is accepting queries or the timeout expires.
// ============================================================================

import { Client } from 'pg';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

try {
  process.loadEnvFile(join(root, '.env.local'));
} catch {
  // Optional, variables can come from process environment
}

function connectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const { PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE } = process.env;
  if (!PGHOST || !PGUSER || !PGDATABASE) {
    return null;
  }
  return `postgresql://${PGUSER}:${encodeURIComponent(PGPASSWORD || '')}@${PGHOST}:${
    PGPORT || 5432
  }/${PGDATABASE}`;
}

const conn = connectionString();
if (!conn) {
  console.log('[wait-for-db] No DATABASE_URL or PG* variables found; skipping DB readiness check.');
  process.exit(0);
}

const maxRetries = parseInt(process.env.DB_WAIT_RETRIES || '30', 10);
const retryIntervalMs = parseInt(process.env.DB_WAIT_INTERVAL_MS || '1500', 10);

const maskedConn = conn.replace(/:[^:@]+@/, ':****@');
console.log(`[wait-for-db] Waiting for PostgreSQL at ${maskedConn}...`);

for (let attempt = 1; attempt <= maxRetries; attempt++) {
  const client = new Client({ connectionString: conn });
  try {
    await client.connect();
    await client.query('SELECT 1');
    await client.end();
    console.log('[wait-for-db] Database is ready and accepting queries!');
    process.exit(0);
  } catch (err) {
    try {
      await client.end();
    } catch {}
    if (attempt === maxRetries) {
      console.error(`[wait-for-db] Error: Database not reachable after ${maxRetries} attempts: ${err.message}`);
      process.exit(1);
    }
    console.log(`[wait-for-db] Attempt ${attempt}/${maxRetries} failed: ${err.message}. Retrying in ${retryIntervalMs}ms...`);
    await new Promise((resolve) => setTimeout(resolve, retryIntervalMs));
  }
}

