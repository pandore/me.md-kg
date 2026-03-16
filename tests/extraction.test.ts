import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { unlinkSync } from 'node:fs';
import { initSchema, closeDb, getDb } from '../src/core/db.js';
import { insertFacts } from '../src/extraction/extract.js';
import type { ExtractedFact } from '../src/core/types.js';

const TEST_DB_PATH = `/tmp/memd-extract-test-${process.pid}.db`;

beforeEach(() => {
  process.env.MEMD_DB_PATH = TEST_DB_PATH;
  initSchema();
});

afterEach(() => {
  closeDb();
  try { unlinkSync(TEST_DB_PATH); } catch { /* ignore */ }
});

describe('insertFacts', () => {
  const sampleFacts: ExtractedFact[] = [
    {
      source_entity: { name: 'User', type: 'person' },
      relation_type: 'lives_in',
      target_entity: { name: 'Lisbon', type: 'place' },
      summary: 'User lives in Lisbon',
      confidence: 0.9,
    },
    {
      source_entity: { name: 'User', type: 'person' },
      relation_type: 'works_at',
      target_entity: { name: 'Acme', type: 'organization' },
      summary: 'User works at Acme',
      confidence: 0.85,
    },
  ];

  it('inserts facts and creates entities', () => {
    const { inserted, deduplicated } = insertFacts(sampleFacts, 'test');
    expect(inserted).toBe(2);
    expect(deduplicated).toBe(0);

    const db = getDb();
    const entityCount = (db.prepare('SELECT COUNT(*) as c FROM entity').get() as { c: number }).c;
    expect(entityCount).toBe(3); // User, Lisbon, Acme
  });

  it('deduplicates on second insert', () => {
    insertFacts(sampleFacts, 'test');
    const { inserted, deduplicated } = insertFacts(sampleFacts, 'test');
    expect(inserted).toBe(0);
    expect(deduplicated).toBe(2);
  });

  it('creates episodes with correct source_type', () => {
    insertFacts(sampleFacts, 'test', 'lcm_message');

    const db = getDb();
    const episodes = db.prepare('SELECT source_type FROM episode').all() as Array<{ source_type: string }>;
    expect(episodes.every(e => e.source_type === 'lcm_message')).toBe(true);
  });

  it('uses manual source_type by default', () => {
    insertFacts(sampleFacts, 'test');

    const db = getDb();
    const episodes = db.prepare('SELECT source_type FROM episode').all() as Array<{ source_type: string }>;
    expect(episodes.every(e => e.source_type === 'manual')).toBe(true);
  });
});
