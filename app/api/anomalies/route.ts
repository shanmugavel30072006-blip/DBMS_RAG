import { NextResponse } from 'next/server';
import { authorizeAction, createAnomaly, getAnomalies, getSqlLog } from '@/lib/db';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  return NextResponse.json({ anomalies: await getAnomalies() });
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

    const check = await authorizeAction(user, 'UPLOAD_DOCUMENT');
    if (!check.allowed) {
      return NextResponse.json({ error: check.reason }, { status: 403 });
    }

    const body = (await request.json()) as {
      anomaly_code?: string;
      title?: string;
      severity?: 'LOW' | 'MODERATE' | 'SEVERE' | 'CATASTROPHIC';
      mission?: string;
      subsystem?: string;
      root_cause?: string;
      mitigation_action?: string;
    };

    if (!body.anomaly_code || !body.title || !body.severity) {
      return NextResponse.json(
        { error: 'anomaly_code, title and severity are required.' },
        { status: 400 }
      );
    }

    const anomaly = await createAnomaly(
      {
        anomalyCode: body.anomaly_code,
        title: body.title,
        severity: body.severity,
        missionCode: body.mission || 'ARTEMIS-III',
        subsystemCode: body.subsystem || 'PROPULSION',
        rootCause: body.root_cause,
        mitigationAction: body.mitigation_action,
      },
      user
    );

    return NextResponse.json({ success: true, anomaly, sqlLog: getSqlLog().slice(0, 8) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
