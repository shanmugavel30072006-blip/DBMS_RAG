import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/session';
import { dbQuery } from '@/lib/pg';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    if (!await getSessionUser()) return NextResponse.json({error:'Authentication required.'},{status:401});
    const [missions, subsystems] = await Promise.all([
      dbQuery<{mission_code:string;mission_name:string}>('SELECT mission_code, mission_name FROM spacecraft_missions ORDER BY mission_code'),
      dbQuery<{code:string;name:string}>('SELECT code, name FROM subsystems ORDER BY code')
    ]);
    return NextResponse.json({missions:missions.rows,subsystems:subsystems.rows});
  } catch { return NextResponse.json({error:'Could not load mission catalog.'},{status:500}); }
}
