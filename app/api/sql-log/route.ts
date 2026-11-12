import { NextResponse } from 'next/server';
import { getSqlLog } from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { isAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
  return NextResponse.json({ sqlLog: getSqlLog() });
}
