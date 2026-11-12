// ============================================================================
// Spacecraft Vector Embeddings & Similarity Search Engine
// Supports 384-dimensional dense vectors (compatible with all-MiniLM-L6-v2)
// ============================================================================

export const EMBEDDING_DIMENSION = 384;

/**
 * Deterministic semantic-hash embedding generator for aerospace engineering texts.
 * Generates unit-normalized 384-dimensional vector embeddings based on semantic tokens,
 * technical keywords (propulsion, cryogenics, avionics, star tracker, etc.), and character n-grams.
 */
export function generateEmbedding(text: string): number[] {
  const vector = new Array(EMBEDDING_DIMENSION).fill(0);
  const normalized = text.toLowerCase().trim();
  const tokens = normalized.match(/\b[a-z0-9_-]{2,}\b/g) || [];

  // Domain vocabulary weighting for aerospace engineering
  const domainWeights: Record<string, number> = {
    cryogenic: 2.8,
    propulsion: 2.5,
    tvs: 3.0,
    lox: 2.8,
    lh2: 2.8,
    boiloff: 2.7,
    pressure: 2.2,
    valve: 2.0,
    venting: 2.4,
    star: 2.5,
    tracker: 2.6,
    gnc: 2.8,
    attitude: 2.4,
    gyroscope: 2.7,
    avionics: 2.5,
    seu: 3.0,
    radiation: 2.5,
    tmr: 2.9,
    sunshield: 2.7,
    thermal: 2.3,
    kapton: 2.8,
    chaste: 3.0,
    regolith: 2.6,
    anomaly: 2.4,
    skycrane: 3.0,
    retrorocket: 2.8,
    telemetry: 2.2,
    subsystem: 2.0,
    artemis: 2.5,
    jwst: 2.5,
    perseverance: 2.5,
    chandrayaan: 2.5,
    orion: 2.5
  };

  // Seed vectors using token hashes and word weights
  tokens.forEach((token, tokenIdx) => {
    const weight = domainWeights[token] || 1.0;
    
    // Hash word into multiple vector dimensions
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      hash = (hash << 5) - hash + token.charCodeAt(i);
      hash |= 0;
    }

    for (let offset = 0; offset < 4; offset++) {
      const idx = Math.abs((hash + offset * 97) % EMBEDDING_DIMENSION);
      const sign = (hash + offset) % 2 === 0 ? 1 : -1;
      vector[idx] += sign * weight * (1.0 / Math.sqrt(tokenIdx + 1));
    }
  });

  // Add character 3-gram signals for subword robustness
  for (let i = 0; i < normalized.length - 2; i++) {
    const gram = normalized.substring(i, i + 3);
    let gramHash = 0;
    for (let j = 0; j < gram.length; j++) {
      gramHash = (gramHash * 31 + gram.charCodeAt(j)) | 0;
    }
    const idx = Math.abs(gramHash % EMBEDDING_DIMENSION);
    vector[idx] += 0.15;
  }

  // Unit vector L2 normalization (sum of squares = 1)
  let norm = 0;
  for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
    norm += vector[i] * vector[i];
  }
  norm = Math.sqrt(norm);

  if (norm > 0) {
    for (let i = 0; i < EMBEDDING_DIMENSION; i++) {
      vector[i] = Number((vector[i] / norm).toFixed(6));
    }
  } else {
    vector[0] = 1.0;
  }

  return vector;
}

/**
 * Calculates Cosine Similarity between two unit-normalized embedding vectors
 * Formula: dot_product(A, B) / (||A|| * ||B||)
 * Since vectors are normalized, dot_product equals cosine similarity.
 */
export function calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
  }
  return Math.max(0, Math.min(1, dotProduct));
}

