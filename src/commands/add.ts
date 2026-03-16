import { extractAndInsert } from '../extraction/extract.js';

export async function add(text: string) {
  console.error(`[add] Extracting facts from: "${text.substring(0, 80)}..."`);

  const result = await extractAndInsert(text);

  return {
    ok: true as const,
    data: {
      message: `Extracted ${result.facts.length} facts, inserted ${result.inserted}, deduplicated ${result.deduplicated}`,
      facts: result.facts.map(f => ({
        source: f.source_entity.name,
        relation: f.relation_type,
        target: f.target_entity.name,
        confidence: f.confidence,
      })),
    },
  };
}
