import { getDb } from '../core/db.js';
import { callAnthropic, isApiKeyConfigured } from '../extraction/anthropic.js';
import { isEmbeddingsConfigured, getQueryEmbedding, cosineSimilarity } from '../extraction/embeddings.js';

export async function query(question: string) {
  const db = getDb();

  // Extract likely entity names/keywords from the question
  const keywords = question.toLowerCase()
    .replace(/[?.,!]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2 && !['who', 'what', 'where', 'when', 'how', 'why', 'are', 'the', 'and', 'for', 'with', 'does', 'did', 'have', 'has', 'this', 'that', 'from'].includes(w));

  // Search entities by keywords
  const entityResults: Array<{ id: string; name: string; types: string; summary: string | null }> = [];
  for (const kw of keywords) {
    const matches = db.prepare(
      'SELECT id, name, types, summary FROM entity WHERE LOWER(name) LIKE ?'
    ).all(`%${kw}%`) as Array<{ id: string; name: string; types: string; summary: string | null }>;
    for (const m of matches) {
      if (!entityResults.find(e => e.id === m.id)) {
        entityResults.push(m);
      }
    }
  }

  // Also search relation summaries (keyword-based)
  let relationResults = db.prepare(`
    SELECT r.id, r.type, r.summary, r.confidence, r.verified,
           s.name as source_name, s.types as source_types,
           t.name as target_name, t.types as target_types
    FROM relation r
    JOIN entity s ON r.source_id = s.id
    JOIN entity t ON r.target_id = t.id
    WHERE r.valid_until IS NULL
    AND (LOWER(r.summary) LIKE ? OR LOWER(s.name) LIKE ? OR LOWER(t.name) LIKE ?)
    ORDER BY r.verified DESC, r.confidence DESC
    LIMIT 20
  `).all(...keywords.slice(0, 1).flatMap(kw => [`%${kw}%`, `%${kw}%`, `%${kw}%`])) as Array<{
    id: string; type: string; summary: string | null; confidence: number; verified: number;
    source_name: string; source_types: string; target_name: string; target_types: string;
  }>;

  // Semantic search with Voyage AI embeddings if available and keyword search didn't find much
  if (isEmbeddingsConfigured() && relationResults.length < 5) {
    try {
      const semanticResults = await semanticSearch(db, question, 20);
      // Merge with keyword results (deduplicate by id)
      const existingIds = new Set(relationResults.map(r => r.id));
      for (const sr of semanticResults) {
        if (!existingIds.has(sr.id)) {
          relationResults.push(sr);
        }
      }
      // Re-sort by relevance
      relationResults = relationResults.slice(0, 20);
    } catch (e: any) {
      console.error(`[query] Semantic search failed: ${e.message}`);
    }
  }

  // If we have an API key, use AI to synthesize an answer
  let answer: string | undefined;
  if (isApiKeyConfigured() && relationResults.length > 0) {
    try {
      const context = relationResults.map(r =>
        `[${r.verified ? 'verified' : 'unverified'}] ${r.source_name} → ${r.type} → ${r.target_name}: ${r.summary || 'no summary'} (confidence: ${r.confidence})`
      ).join('\n');

      const responseText = await callAnthropic({
        system: 'You are a concise knowledge graph assistant. Answer questions based on the provided facts. If the facts don\'t contain enough info, say so. Be brief.',
        messages: [{
          role: 'user',
          content: `Question: ${question}\n\nKnowledge graph facts:\n${context}\n\nAnswer the question based on these facts. Be concise.`,
        }],
        maxTokens: 500,
        temperature: 0.1,
      });

      answer = responseText;
    } catch (e: any) {
      console.error(`[query] AI summary failed: ${e.message}`);
    }
  }

  return {
    ok: true as const,
    data: {
      question,
      answer: answer || (relationResults.length > 0
        ? `Found ${relationResults.length} relevant facts. Set ANTHROPIC_API_KEY for AI-generated answers.`
        : 'No matching facts found in the knowledge graph.'),
      entities: entityResults.slice(0, 10).map(e => ({ name: e.name, types: JSON.parse(e.types), summary: e.summary })),
      facts: relationResults.map(r => ({
        source: r.source_name,
        relation: r.type,
        target: r.target_name,
        summary: r.summary,
        confidence: r.confidence,
        verified: !!r.verified,
      })),
    },
  };
}

/**
 * Semantic search: embed the question, compare with all relation summaries.
 * Since we don't store embeddings in the DB yet, we compute them on-the-fly
 * for the relation summaries and rank by cosine similarity.
 */
async function semanticSearch(
  db: ReturnType<typeof getDb>,
  question: string,
  limit: number,
): Promise<Array<{
  id: string; type: string; summary: string | null; confidence: number; verified: number;
  source_name: string; source_types: string; target_name: string; target_types: string;
}>> {
  // Get all active relations with summaries
  const allRelations = db.prepare(`
    SELECT r.id, r.type, r.summary, r.confidence, r.verified,
           s.name as source_name, s.types as source_types,
           t.name as target_name, t.types as target_types
    FROM relation r
    JOIN entity s ON r.source_id = s.id
    JOIN entity t ON r.target_id = t.id
    WHERE r.valid_until IS NULL AND r.summary IS NOT NULL
    ORDER BY r.verified DESC, r.confidence DESC
    LIMIT 100
  `).all() as Array<{
    id: string; type: string; summary: string | null; confidence: number; verified: number;
    source_name: string; source_types: string; target_name: string; target_types: string;
  }>;

  if (allRelations.length === 0) return [];

  // Build text representations for embedding
  const texts = allRelations.map(r =>
    `${r.source_name} ${r.type} ${r.target_name}: ${r.summary || ''}`
  );

  // Get query embedding
  const queryEmb = await getQueryEmbedding(question);

  // Get document embeddings (batch — Voyage supports up to 128 texts per call)
  const { getEmbeddings } = await import('../extraction/embeddings.js');
  const docEmbs = await getEmbeddings(texts);

  // Score and rank
  const scored = allRelations.map((r, i) => ({
    ...r,
    score: cosineSimilarity(queryEmb, docEmbs[i]),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
