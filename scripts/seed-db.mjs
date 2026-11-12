// ============================================================================
// Database bootstrap + seed script
//   1. loads environment configuration (.env and .env.local)
//   2. creates the schema/seed data when the database is empty
//   3. provisions admin and standard user accounts with scrypt password hashing
//   4. backfills 384-dimensional vector embeddings for document chunks
// Usage: npm run db:seed
// ============================================================================

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { generateEmbedding } from '../lib/embeddings.ts';
import { hashPassword } from '../lib/auth.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

try {
  process.loadEnvFile(join(root, '.env'));
} catch {}
try {
  process.loadEnvFile(join(root, '.env.local'));
} catch {}

// Two primary system accounts (no demo personas or predefined nicknames)
const SYSTEM_USERS = [
  {
    id: 1,
    username: 'admin',
    name: 'Administrator',
    email: 'admin@astrorag.local',
    department: 'Administration',
    passwordEnv: 'ADMIN_PASSWORD',
  },
  {
    id: 2,
    username: 'user',
    name: 'User',
    email: 'user@astrorag.local',
    department: 'Engineering',
    passwordEnv: 'USER_PASSWORD',
  },
];

async function applyMigrations(client) {
  await client.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`
  );
  const dir = join(root, 'database', 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const applied = await client.query(`SELECT 1 FROM schema_migrations WHERE name = $1`, [file]);
    if (applied.rowCount > 0) continue;
    await client.query(readFileSync(join(dir, file), 'utf8'));
    await client.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [file]);
    console.log(`· Applied migration ${file}`);
  }
}

function connectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const { PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE } = process.env;
  if (!PGHOST || !PGUSER || !PGDATABASE) {
    throw new Error('Set DATABASE_URL (or PGHOST/PGUSER/PGDATABASE) in .env or .env.local first.');
  }
  return `postgresql://${PGUSER}:${encodeURIComponent(PGPASSWORD || '')}@${PGHOST}:${
    PGPORT || 5432
  }/${PGDATABASE}`;
}

const client = new Client({ connectionString: connectionString() });

async function main() {
  await client.connect();

  const existing = await client.query(
    `SELECT to_regclass('public.users') AS users_table`
  );

  if (!existing.rows[0].users_table) {
    const tables = await client.query(`SELECT COUNT(*) AS n FROM pg_tables WHERE schemaname = 'public'`);
    if (Number(tables.rows[0].n) > 0) {
      throw new Error('The public schema is not empty. Refusing to apply destructive schema.sql.');
    }
    console.log('· Empty database detected — applying schema.sql and seed.sql');
    await client.query(readFileSync(join(root, 'database', 'schema.sql'), 'utf8'));
    await client.query(readFileSync(join(root, 'database', 'seed.sql'), 'utf8'));
  } else {
    console.log('· Schema already present — verifying migrations');
    await applyMigrations(client);
  }

  // Update foreign references to point to system accounts (1 or 2) before cleaning legacy demo users
  await client.query(`UPDATE subsystems SET lead_engineer_id = 1 WHERE lead_engineer_id NOT IN (1, 2)`);
  await client.query(`UPDATE engineering_documents SET uploaded_by = 1 WHERE uploaded_by NOT IN (1, 2)`);
  await client.query(`UPDATE anomalies_incidents SET reported_by = 1 WHERE reported_by NOT IN (1, 2)`);
  await client.query(`UPDATE anomalies_incidents SET resolved_by = 1 WHERE resolved_by IS NOT NULL AND resolved_by NOT IN (1, 2)`);
  await client.query(`UPDATE audit_logs SET user_id = 1 WHERE user_id NOT IN (1, 2)`);

  // Remove any obsolete demo accounts
  await client.query(`DELETE FROM users WHERE username NOT IN ('admin', 'user')`);

  // Provision admin and user with dynamic scrypt password hashing
  for (const u of SYSTEM_USERS) {
    let plainPassword = process.env[u.passwordEnv];
    if (!plainPassword) {
      plainPassword = randomBytes(12).toString('base64url');
      console.log(`· No ${u.passwordEnv} specified in environment. Generated secure password for ${u.username}: ${plainPassword}`);
    }

    // Hash dynamically using scrypt + 16-byte random salt (never store plain-text)
    const hash = hashPassword(plainPassword);

    await client.query(
      `INSERT INTO users (user_id, username, full_name, email, department, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id) DO UPDATE
         SET username = EXCLUDED.username,
             full_name = EXCLUDED.full_name,
             email = EXCLUDED.email,
             department = EXCLUDED.department,
             password_hash = EXCLUDED.password_hash,
             is_active = TRUE`,
      [u.id, u.username, u.name, u.email, u.department, hash]
    );
  }

  await client.query(`SELECT setval('users_user_id_seq', (SELECT MAX(user_id) FROM users))`);
  console.log('· Successfully configured system accounts: admin (Administrator) & user (User)');

  // Backfill 384-dimensional unit-normalized embeddings for any unindexed chunks
  const pending = await client.query(
    `SELECT chunk_id, chunk_text FROM document_chunks WHERE embedding IS NULL`
  );
  for (const row of pending.rows) {
    const literal = `[${generateEmbedding(row.chunk_text).join(',')}]`;
    await client.query(`UPDATE document_chunks SET embedding = $1::vector WHERE chunk_id = $2`, [
      literal,
      row.chunk_id,
    ]);
  }
  if (pending.rowCount > 0) {
    console.log(`· Backfilled ${pending.rowCount} chunk embeddings (384-dim, unit-normalized)`);
  }

  const summary = await client.query(
    `SELECT (SELECT COUNT(*) FROM users) AS users,
            (SELECT COUNT(*) FROM engineering_documents) AS docs,
            (SELECT COUNT(*) FROM document_chunks WHERE embedding IS NOT NULL) AS vectors,
            (SELECT COUNT(*) FROM anomalies_incidents) AS anomalies`
  );
  console.log('· Database state:', summary.rows[0]);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => client.end());
