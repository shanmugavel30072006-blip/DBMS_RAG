import { NextResponse } from 'next/server';
import { authorizeAction, getSqlLog, resolveAnomaly } from '@/lib/db';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

    const check = await authorizeAction(user, 'RESOLVE_ANOMALY');
    if (!check.allowed) return NextResponse.json({ error: check.reason }, { status: 403 });

    const body = (await request.json()) as { anomaly_id?: number };
    if (!body.anomaly_id) {
      return NextResponse.json({ error: 'anomaly_id is required.' }, { status: 400 });
    }

    const updated = await resolveAnomaly(Number(body.anomaly_id), user);
    return NextResponse.json({
      success: updated,
      sqlLog: getSqlLog().slice(0, 8),
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
