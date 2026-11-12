// ============================================================================
// PostgreSQL connection pool + SQL activity log
// All credentials come from environment variables — never hard-coded.
// ============================================================================

import { Pool, type QueryResultRow } from 'pg';

export interface SqlQueryLog {
  id: number;
  sql: string;
  description: string;
  rowsAffected: number;
  timestamp: string;
  durationMs: number;
}

const sqlLog: SqlQueryLog[] = [];
let logCounter = 0;

export function logSql(
  sql: string,
  description: string,
  rowsAffected = 0,
  durationMs = 0
): void {
  logCounter += 1;
  sqlLog.unshift({
    id: logCounter,
    sql: sql.trim(),
    description,
    rowsAffected,
    timestamp: new Date().toISOString(),
    durationMs,
  });
  if (sqlLog.length > 60) sqlLog.pop();
}

export function getSqlLog(): SqlQueryLog[] {
  return [...sqlLog];
}

const globalForPool = globalThis as unknown as { __astroragPool?: Pool };

function connectionString(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const { PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE } = process.env;
  if (PGHOST && PGUSER && PGDATABASE) {
    const port = PGPORT || '5432';
    const password = PGPASSWORD ? `:${encodeURIComponent(PGPASSWORD)}` : '';
    return `postgresql://${encodeURIComponent(PGUSER)}${password}@${PGHOST}:${port}/${PGDATABASE}`;
  }

  throw new Error(
    'Database is not configured. Create a .env.local file (copy .env.example) and set DATABASE_URL, then restart the dev server.'
  );
}

export function getPool(): Pool {
  if (!globalForPool.__astroragPool) {
    const pool = new Pool({
      connectionString: connectionString(),
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    pool.on('error', (err) => {
      console.error('[pg] idle client error', err.message);
    });
    globalForPool.__astroragPool = pool;
  }
  return globalForPool.__astroragPool;
}

/**
 * Runs a parameterised query against PostgreSQL and records it in the SQL
 * activity log that the UI displays (so the demo shows real executed SQL).
 */
export async function dbQuery<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
  description = 'SELECT'
): Promise<{ rows: T[]; rowCount: number }> {
  const started = Date.now();
  try {
    const result = await getPool().query<T>(sql, params);
    logSql(sql, description, result.rowCount ?? 0, Date.now() - started);
    return { rows: result.rows, rowCount: result.rowCount ?? 0 };
  } catch (err) {
    logSql(sql, `ERROR: ${(err as Error).message}`, 0, Date.now() - started);
    throw err;
  }
}

export async function dbQueryOne<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
  description = 'SELECT'
): Promise<T | null> {
  const { rows } = await dbQuery<T>(sql, params, description);
  return rows[0] ?? null;
}

/** Runs several statements inside a single ACID transaction. */
export async function dbTransaction<T>(
  description: string,
  work: (client: {
    query: Pool['query'];
    log: (sql: string, desc: string, rows: number) => void;
  }) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  const started = Date.now();
  const statements: string[] = [];
  try {
    await client.query('BEGIN');
    statements.push('BEGIN');
    logSql('BEGIN;', `${description} — transaction started`, 0, Date.now() - started);

    const result = await work({
      query: client.query.bind(client),
      log: (sql, desc, rows) => {
        statements.push(sql);
        logSql(sql, desc, rows, Date.now() - started);
      },
    });

    await client.query('COMMIT');
    logSql('COMMIT;', `${description} — committed (${statements.length} statements)`, 0, Date.now() - started);
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    logSql('ROLLBACK;', `${description} — rolled back: ${(err as Error).message}`, 0, Date.now() - started);
    throw err;
  } finally {
    client.release();
  }
}

/** Postgres vector literal for pgvector parameters, e.g. [0.1,0.2,...] */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}