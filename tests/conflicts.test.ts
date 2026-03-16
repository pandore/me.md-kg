import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { unlinkSync } from 'node:fs';
import { initSchema, closeDb, getDb } from '../src/core/db.js';
import { findOrCreateEntity, createRelation } from '../src/core/entity-ops.js';
import { detectConflict, resolveConflictSupersede } from '../src/extraction/conflicts.js';
import { insertFacts } from '../src/extraction/extract.js';
import type { ExtractedFact } from '../src/core/types.js';

const TEST_DB_PATH = `/tmp/memd-conflict-test-${process.pid}.db`;

beforeEach(() => {
  process.env.MEMD_DB_PATH = TEST_DB_PATH;
  initSchema();
});

afterEach(() => {
  closeDb();
  try { unlinkSync(TEST_DB_PATH); } catch { /* ignore */ }
});

describe('conflict detection', () => {
  it('detects conflicting lives_in relations', () => {
    const user = findOrCreateEntity('User', 'person');
    const lisbon = findOrCreateEntity('Lisbon', 'place');
    const berlin = findOrCreateEntity('Berlin', 'place');

    createRelation({ source_id: user, target_id: lisbon, type: 'lives_in', provenance: 'test' });

    const conflict = detectConflict(user, berlin, 'lives_in');
    expect(conflict).not.toBeNull();
    expect(conflict!.existingTarget).toBe('Lisbon');
    expect(conflict!.newTarget).toBe('Berlin');
  });

  it('does not flag non-singular relation types', () => {
    const user = findOrCreateEntity('User', 'person');
    const ts = findOrCreateEntity('TypeScript', 'skill');
    const rust = findOrCreateEntity('Rust', 'skill');

    createRelation({ source_id: user, target_id: ts, type: 'has_skill', provenance: 'test' });

    const conflict = detectConflict(user, rust, 'has_skill');
    expect(conflict).toBeNull();
  });

  it('does not flag if existing is already superseded', () => {
    const user = findOrCreateEntity('User', 'person');
    const lisbon = findOrCreateEntity('Lisbon', 'place');
    const berlin = findOrCreateEntity('Berlin', 'place');

    const relId = createRelation({ source_id: user, target_id: lisbon, type: 'lives_in', provenance: 'test' });
    resolveConflictSupersede(relId);

    const conflict = detectConflict(user, berlin, 'lives_in');
    expect(conflict).toBeNull();
  });

  it('resolves conflict by superseding old relation', () => {
    const user = findOrCreateEntity('User', 'person');
    const lisbon = findOrCreateEntity('Lisbon', 'place');

    const relId = createRelation({ source_id: user, target_id: lisbon, type: 'lives_in', provenance: 'test' });
    resolveConflictSupersede(relId);

    const db = getDb();
    const rel = db.prepare('SELECT valid_until FROM relation WHERE id = ?').get(relId) as { valid_until: string };
    expect(rel.valid_until).not.toBeNull();
  });
});

describe('insertFacts with conflicts', () => {
  it('reports conflicts when inserting contradicting facts', () => {
    // Pre-create user living in Lisbon
    const userId = findOrCreateEntity('User', 'person');
    const lisbonId = findOrCreateEntity('Lisbon', 'place');
    createRelation({ source_id: userId, target_id: lisbonId, type: 'lives_in', provenance: 'seed' });

    // Now insert "User lives in Berlin"
    const facts: ExtractedFact[] = [{
      source_entity: { name: 'User', type: 'person' },
      relation_type: 'lives_in',
      target_entity: { name: 'Berlin', type: 'place' },
      summary: 'User moved to Berlin',
      confidence: 0.9,
    }];

    const { inserted, conflicts } = insertFacts(facts, 'test');
    expect(inserted).toBe(1);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].existingTarget).toBe('Lisbon');
    expect(conflicts[0].newTarget).toBe('Berlin');

    // Old relation should be superseded
    const db = getDb();
    const activeRelations = db.prepare(
      "SELECT t.name as target FROM relation r JOIN entity t ON r.target_id = t.id WHERE r.source_id = ? AND r.type = 'lives_in' AND r.valid_until IS NULL"
    ).all(userId) as Array<{ target: string }>;
    expect(activeRelations).toHaveLength(1);
    expect(activeRelations[0].target).toBe('Berlin');
  });
});
