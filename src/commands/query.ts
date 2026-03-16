import { getDb } from '../core/db.js';
import { callAnthropic, isApiKeyConfigured } from '../extraction/anthropic.js';

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

  // Also search relation summaries
  const relationResults = db.prepare(`
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
