import { extractFacts, insertFacts } from '../extraction/extract.js';

type IngestSourceType = 'lcm_message' | 'lcm_summary';

/**
 * Ingest text from external sources (LCM messages, summaries) into the knowledge graph.
 * Same extraction pipeline as `add`, but sets episode source_type accordingly.
 */
export async function ingest(text: string, sourceType: IngestSourceType) {
  console.error(`[ingest] Extracting facts (source: ${sourceType}) from: "${text.substring(0, 80)}..."`);

  const facts = await extractFacts(text);
  const { inserted, deduplicated } = insertFacts(facts, sourceType, sourceType);

  return {
    ok: true as const,
    data: {
      message: `Ingested ${facts.length} facts, inserted ${inserted}, deduplicated ${deduplicated}`,
      source_type: sourceType,
      facts: facts.map(f => ({
        source: f.source_entity.name,
        relation: f.relation_type,
        target: f.target_entity.name,
        confidence: f.confidence,
      })),
    },
  };
}
