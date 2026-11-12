declare module 'word-extractor' {
  interface ExtractedDocument {
    getBody(): string;
    getFootnotes(): string;
    getHeaders(): string;
    getAnnotations(): string;
  }

  export default class WordExtractor {
    extract(buffer: Buffer): Promise<ExtractedDocument>;
  }
}

declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PDFData {
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: unknown;
    text: string;
    version: string;
  }
  export default function pdf(dataBuffer: Buffer, options?: Record<string, unknown>): Promise<PDFData>;
}
