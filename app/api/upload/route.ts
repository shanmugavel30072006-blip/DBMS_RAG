import { NextResponse } from 'next/server';
import { ingestDocument, getSqlLog, authorizeAction } from '@/lib/db';
import { getSessionUser } from '@/lib/session';
import { parseDocumentText } from '@/lib/document-parser';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

function chunkContent(content: string): string[] {
  const text = content.replace(/\r\n/g, '\n').trim();
  const chunks: string[] = [];
  // Bounded overlapping windows avoid unbounded paragraphs and retain context.
  const size = 1400, overlap = 200;
  for (let start = 0; start < text.length; start += size - overlap) {
    const chunk = text.slice(start, start + size).trim();
    if (chunk) chunks.push(chunk);
    if (start + size >= text.length) break;
  }
  return chunks;
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required. Please sign in.' },
        { status: 401 }
      );
    }

    const authCheck = await authorizeAction(user, 'UPLOAD_DOCUMENT');
    if (!authCheck.allowed) {
      return NextResponse.json({ error: authCheck.reason }, { status: 403 });
    }

    const contentType = request.headers.get('content-type') || '';
    let title = '';
    let fileName = '';
    let docType = 'STANDARD_PROCEDURE';
    let mission: string | null = null;
    let subsystem: string | null = null;
    let rawContent = '';
    let fileSizeKb = 1;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      title = ((formData.get('title') as string) || '').trim();
      docType = ((formData.get('doc_type') as string) || 'STANDARD_PROCEDURE').trim();
      mission = (formData.get('mission') as string) || null;
      subsystem = (formData.get('subsystem') as string) || null;

      if (file && typeof file === 'object' && file.size > 0) {
        if (file.size > MAX_FILE_SIZE_BYTES) {
          return NextResponse.json(
            { error: `File size (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds the 100 MB limit.` },
            { status: 400 }
          );
        }
        fileName = file.name;
        if (!title) {
          title = file.name.replace(/\.[^/.]+$/, '').replace(/[_.-]+/g, ' ');
        }
        fileSizeKb = Math.max(1, Math.round(file.size / 1024));
        const buffer = Buffer.from(await file.arrayBuffer());
        rawContent = await parseDocumentText(fileName, buffer);
      } else {
        rawContent = ((formData.get('content') as string) || '').trim();
        fileName = ((formData.get('file_name') as string) || `${title}.txt`).trim();
        fileSizeKb = Math.max(1, Math.round(Buffer.byteLength(rawContent, 'utf8') / 1024));
      }
    } else {
      const body = (await request.json()) as {
        title?: string;
        file_name?: string;
        doc_type?: string;
        mission?: string;
        subsystem?: string;
        content?: string;
      };
      title = (body.title || '').trim();
      fileName = (body.file_name || `${title}.txt`).trim();
      docType = (body.doc_type || 'STANDARD_PROCEDURE').trim();
      mission = body.mission || null;
      subsystem = body.subsystem || null;
      rawContent = (body.content || '').trim();
      fileSizeKb = Math.max(1, Math.round(Buffer.byteLength(rawContent, 'utf8') / 1024));
    }

    if (!title) {
      return NextResponse.json({ error: 'Document title is required.' }, { status: 400 });
    }

    if (!rawContent || !rawContent.trim()) {
      return NextResponse.json(
        { error: 'No readable text content found in the uploaded file or content field.' },
        { status: 400 }
      );
    }

    if (title.length > 255 || fileName.length > 255) {
      return NextResponse.json({ error: 'Title or filename exceeds 255 characters.' }, { status: 400 });
    }

    const textChunks = chunkContent(rawContent);
    if (textChunks.length === 0) {
      return NextResponse.json({ error: 'No text chunks could be extracted.' }, { status: 400 });
    }

    const doc = await ingestDocument(
      {
        title,
        fileName: fileName || `${title.toLowerCase().replace(/[^a-z0-9]/g, '_')}.txt`,
        docType: docType || 'STANDARD_PROCEDURE',
        mission,
        subsystem,
        textChunks,
        fileSizeKb,
      },
      user
    );

    return NextResponse.json({
      success: true,
      document: doc,
      chunks_created: textChunks.length,
      uploader: { full_name: user.full_name },
      sqlLog: getSqlLog().slice(0, 12),
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
