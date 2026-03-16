/**
 * Voyage AI embeddings for semantic entity/relation search.
 * Uses VOYAGE_API_KEY from env. Falls back to keyword search if unavailable.
 */

const VOYAGE_API_URL = 'https://api.voyageai.com/v1/embeddings';
const EMBEDDING_MODEL = 'voyage-3-lite';

export function isEmbeddingsConfigured(): boolean {
  return !!process.env.VOYAGE_API_KEY;
}

/**
 * Get embeddings for one or more texts via Voyage AI.
 */
export async function getEmbeddings(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error('VOYAGE_API_KEY not set');

  const response = await fetch(VOYAGE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
      input_type: 'document',
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Voyage API error (${response.status}): ${body}`);
  }

  const data = await response.json() as {
    data: Array<{ embedding: number[] }>;
  };

  return data.data.map(d => d.embedding);
}

/**
 * Get embedding for a single query text.
 */
export async function getQueryEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error('VOYAGE_API_KEY not set');

  const response = await fetch(VOYAGE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: [text],
      input_type: 'query',
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Voyage API error (${response.status}): ${body}`);
  }

  const data = await response.json() as {
    data: Array<{ embedding: number[] }>;
  };

  return data.data[0].embedding;
}

/**
 * Cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
}
