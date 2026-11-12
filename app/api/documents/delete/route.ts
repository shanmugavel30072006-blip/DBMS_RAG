import { NextResponse } from 'next/server';
import { authorizeAction, deleteDocument, getSqlLog } from '@/lib/db';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function DELETE(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

    const check = await authorizeAction(user, 'DELETE_DOCUMENT');
    if (!check.allowed) return NextResponse.json({ error: check.reason }, { status: 403 });

    const { document_id } = (await request.json()) as { document_id?: number };
    if (!document_id) return NextResponse.json({ error: 'document_id is required.' }, { status: 400 });

    const deleted = await deleteDocument(Number(document_id), user);
    return NextResponse.json({ success: deleted, sqlLog: getSqlLog().slice(0, 8) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
