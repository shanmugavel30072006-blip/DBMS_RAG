// ============================================================================
// Default Chunking for RAG — Extractive Vector Synthesis Engine
// Allows grounded RAG answers directly from PostgreSQL pgvector chunks
// without requiring an external Google Gemini API key or third-party service.
// ============================================================================

import type { SearchResult } from './db';

/**
 * Cleanly extracts the most relevant sentences from chunk text based on query terms.
 */
function extractSalientPassages(chunkText: string, queryTokens: string[]): string[] {
  const sentences = chunkText
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);

  if (sentences.length === 0) return [chunkText.slice(0, 300)];

  // Score sentences by matching query tokens
  const scored = sentences.map((sentence) => {
    const lower = sentence.toLowerCase();
    let score = 0;
    for (const token of queryTokens) {
      if (lower.includes(token)) score += 1;
    }
    return { sentence, score };
  });

  // Pick top sentences that have query matches, or first 2 sentences as fallback
  const matches = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  if (matches.length > 0) {
    return matches.slice(0, 3).map((m) => m.sentence);
  }
  return sentences.slice(0, 2);
}

/**
 * Synthesizes a structured, grounded RAG answer directly from retrieved vector chunks.
 */
export function synthesizeDefaultChunkAnswer(query: string, results: SearchResult[]): string {
  if (!results || results.length === 0) {
    return 'I could not find relevant material in the documents available to your account. Try another question or upload a document.';
  }

  // Tokenize query for extractive matching
  const queryTokens = (query.toLowerCase().match(/[a-z0-9_-]{3,}/g) || []).filter(
    (w) => !['what', 'when', 'where', 'which', 'who', 'whom', 'this', 'that', 'with', 'from', 'have', 'does', 'your', 'tell', 'show', 'summarize'].includes(w)
  );

  const topResult = results[0];
  const lines: string[] = [];

  lines.push(`### Grounded Analysis: ${query.trim()}`);
  lines.push('');

  // Executive overview from the highest similarity chunk
  const primaryPassages = extractSalientPassages(topResult.text, queryTokens);
  lines.push(`Based on **${topResult.document_title}** (Chunk ${topResult.chunk_index}, ${topResult.mission} / ${topResult.subsystem}, ${(topResult.similarity * 100).toFixed(0)}% similarity match) [Source 1]:`);
  lines.push('');
  for (const p of primaryPassages) {
    lines.push(`> "${p}"`);
  }
  lines.push('');

  // Key findings from all retrieved chunks
  lines.push('### Key Technical Findings');
  results.forEach((r, idx) => {
    const salient = extractSalientPassages(r.text, queryTokens);
    const keyDetail = salient[0] || r.text.slice(0, 160);
    lines.push(`- **${r.document_title}** (Chunk ${r.chunk_index}) [Source ${idx + 1}]: ${keyDetail}`);
  });
  lines.push('');

  // Synthesized conclusion
  lines.push('### Reference Summary');
  lines.push(`Retrieved **${results.length} relevant chunks** across ${new Set(results.map((r) => r.document_title)).size} document(s). Verify operational limits and technical procedures against the cited sources.`);
  lines.push('');
  lines.push('*Generated via AstroRAG Default Chunk Retrieval Engine (pgvector similarity search).*');

  return lines.join('\n');
}
