import { callAnthropic, isApiKeyConfigured } from './anthropic.js';
import { chunkContent } from './chunk.js';
import { buildExtractionSystemPrompt, buildExtractionUserPrompt } from './prompt.js';
import { isDuplicateRelation } from './dedup.js';
import { findOrCreateEntity, createRelation, createEpisode } from '../core/entity-ops.js';
import type { EntityType, ExtractedFact } from '../core/types.js';

/**
 * Extract facts from text using AI and insert into the knowledge graph.
 * Returns the extracted and inserted facts.
 */
export async function extractAndInsert(text: string): Promise<{
  facts: ExtractedFact[];
  inserted: number;
  deduplicated: number;
}> {
  const facts = await extractFacts(text);
  const { inserted, deduplicated } = insertFacts(facts, 'manual');
  return { facts, inserted, deduplicated };
}

/**
 * Extract facts from text using AI.
 */
export async function extractFacts(text: string): Promise<ExtractedFact[]> {
  if (!isApiKeyConfigured()) {
    console.error('[extract] No API key configured, using fallback extraction');
    return fallbackExtract(text);
  }

  const chunks = chunkContent(text);
  const allFacts: ExtractedFact[] = [];

  for (const chunk of chunks) {
    try {
      const systemPrompt = buildExtractionSystemPrompt();
      const userPrompt = buildExtractionUserPrompt(chunk);

      const responseText = await callAnthropic({
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        maxTokens: 4096,
      });

      const parsed = parseExtractionResponse(responseText);
      allFacts.push(...parsed);
    } catch (e: any) {
      console.error(`[extract] AI extraction failed for chunk: ${e.message}`);
      allFacts.push(...fallbackExtract(chunk));
    }
  }

  return allFacts;
}

function parseExtractionResponse(responseText: string): ExtractedFact[] {
  let cleaned = responseText.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) return [];

  const validTypes = new Set<string>([
    'person', 'organization', 'place', 'concept', 'service',
    'product', 'event', 'skill', 'value', 'trait', 'preference',
    'doctor', 'contact',
  ]);

  return parsed
    .filter((item: any) => {
      return item.source_entity?.name && item.source_entity?.type
        && item.target_entity?.name && item.target_entity?.type
        && item.relation_type
        && typeof item.confidence === 'number';
    })
    .map((item: any) => ({
      source_entity: {
        name: String(item.source_entity.name),
        type: (validTypes.has(item.source_entity.type) ? item.source_entity.type : 'concept') as EntityType,
      },
      relation_type: String(item.relation_type),
      target_entity: {
        name: String(item.target_entity.name),
        type: (validTypes.has(item.target_entity.type) ? item.target_entity.type : 'concept') as EntityType,
      },
      summary: String(item.summary || ''),
      confidence: Math.min(Math.max(item.confidence, 0), 1),
      valid_from: item.valid_from || undefined,
      valid_until: item.valid_until || undefined,
    })) as ExtractedFact[];
}

/**
 * Insert extracted facts into the database.
 */
export function insertFacts(facts: ExtractedFact[], provenance: string): { inserted: number; deduplicated: number } {
  let inserted = 0;
  let deduplicated = 0;

  for (const fact of facts) {
    const sourceId = findOrCreateEntity(
      fact.source_entity.name,
      fact.source_entity.type,
    );
    const targetId = findOrCreateEntity(
      fact.target_entity.name,
      fact.target_entity.type,
    );

    // Check for duplicate relation
    if (isDuplicateRelation(sourceId, targetId, fact.relation_type)) {
      deduplicated++;
      continue;
    }

    const relationId = createRelation({
      source_id: sourceId,
      target_id: targetId,
      type: fact.relation_type,
      summary: fact.summary,
      confidence: fact.confidence,
      provenance,
      valid_from: fact.valid_from,
      valid_until: fact.valid_until,
    });

    createEpisode({
      relation_id: relationId,
      source_type: 'manual',
      content: fact.summary,
    });

    inserted++;
  }

  return { inserted, deduplicated };
}

/**
 * Fallback extraction when AI is not available.
 * Simple rule-based parsing.
 */
function fallbackExtract(text: string): ExtractedFact[] {
  const facts: ExtractedFact[] = [];
  const sentences = text.split(/[.!?\n]+/).map(s => s.trim()).filter(s => s.length > 15);

  for (const sentence of sentences) {
    // Detect person mentions
    if (/\b(my\s+doctor|my\s+therapist|my\s+(?:physio|osteo))\b/i.test(sentence)) {
      const nameMatch = sentence.match(/(?:is|named?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
      if (nameMatch) {
        facts.push({
          source_entity: { name: 'User', type: 'person' },
          relation_type: 'has_doctor',
          target_entity: { name: nameMatch[1], type: 'doctor' },
          summary: sentence,
          confidence: 0.7,
        });
        continue;
      }
    }

    if (/\b(work|works|working)\s+(at|for|with)\b/i.test(sentence)) {
      const orgMatch = sentence.match(/(?:work(?:s|ing)?)\s+(?:at|for|with)\s+([A-Z][a-zA-Z\s]+)/);
      if (orgMatch) {
        facts.push({
          source_entity: { name: 'User', type: 'person' },
          relation_type: 'works_at',
          target_entity: { name: orgMatch[1].trim(), type: 'organization' },
          summary: sentence,
          confidence: 0.65,
        });
        continue;
      }
    }

    if (/\b(live|lives|living|based|moved)\s+(in|to)\b/i.test(sentence)) {
      const placeMatch = sentence.match(/(?:live[sd]?|living|based|moved)\s+(?:in|to)\s+([A-Z][a-zA-Z\s,]+)/);
      if (placeMatch) {
        facts.push({
          source_entity: { name: 'User', type: 'person' },
          relation_type: 'lives_in',
          target_entity: { name: placeMatch[1].trim(), type: 'place' },
          summary: sentence,
          confidence: 0.65,
        });
        continue;
      }
    }

    // Generic fact
    if (sentence.length > 20) {
      facts.push({
        source_entity: { name: 'User', type: 'person' },
        relation_type: 'has_fact',
        target_entity: { name: sentence.substring(0, 80), type: 'concept' },
        summary: sentence,
        confidence: 0.5,
      });
    }
  }

  return facts;
}
