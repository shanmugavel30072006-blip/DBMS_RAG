import { NextResponse } from 'next/server';
import {
  getAnomalies,
  getAuditTrail,
  getStats,
  getSubsystemReadiness,
  getVectorHealth,
  severityBreakdown,
} from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { isAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }
    if (!isAdmin(user)) {
      return NextResponse.json({ error: 'Forbidden: Admin access required.' }, { status: 403 });
    }

    const [readiness, anomalies, audit, severity, vectorHealth, stats] = await Promise.all([
      getSubsystemReadiness(),
      getAnomalies(),
      getAuditTrail(15),
      severityBreakdown(),
      getVectorHealth(),
      getStats(),
    ]);

    return NextResponse.json({ readiness, anomalies, audit, severity, vectorHealth, stats });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
