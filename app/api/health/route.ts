import { NextResponse } from 'next/server';
import { dbQueryOne } from '@/lib/pg';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const row = await dbQueryOne<{ version: string; vectors: string }>(
      `SELECT version() AS version,
              (SELECT extversion FROM pg_extension WHERE extname = 'vector') AS vectors`,
      [],
      'HEALTH: verify PostgreSQL + pgvector connectivity'
    );
    return NextResponse.json({
      status: 'ok',
      postgres: row?.version?.split(' ').slice(0, 2).join(' '),
      pgvector: row?.vectors,
    });
  } catch (err) {
    return NextResponse.json(
      { status: 'error', error: (err as Error).message },
      { status: 503 }
    );
  }
}
