import mammoth from 'mammoth';
import WordExtractor from 'word-extractor';

/**
 * Extracts raw textual content from uploaded documents (.pdf, .docx, .doc, .txt, .md).
 * Supports documents up to 100 MB.
 */
export async function parseDocumentText(filename: string, buffer: Buffer): Promise<string> {
  const dotIndex = filename.lastIndexOf('.');
  const ext = dotIndex !== -1 ? filename.slice(dotIndex).toLowerCase() : '';

  if (ext === '.pdf') {
    // Import pdf-parse core directly to run in-process without worker or debug dependencies
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
    const data = await pdfParse(buffer);
    return (data.text || '').trim();
  }

  if (ext === '.docx') {
    const res = await mammoth.extractRawText({ buffer });
    return (res.value || '').trim();
  }

  if (ext === '.doc') {
    const extractor = new WordExtractor();
    const extracted = await extractor.extract(buffer);
    return (extracted.getBody() || '').trim();
  }

  // Plain text formats (.txt, .md, .markdown, etc.)
  return buffer.toString('utf-8').trim();
}
