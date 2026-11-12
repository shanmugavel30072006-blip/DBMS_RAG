import { NextResponse } from 'next/server';
import { getAllDocuments, getDocumentChunks, getStats, getSqlLog } from '@/lib/db';
import { getSessionUser } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const docs = await getAllDocuments(user, 15);
    const stats = await getStats(user);

    const docsWithChunks = await Promise.all(
      docs.map(async (d) => ({
        ...d,
        chunks: await getDocumentChunks(d.document_id),
      }))
    );

    return NextResponse.json({
      documents: docsWithChunks,
      stats,
      sqlLog: getSqlLog().slice(0, 15),
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}