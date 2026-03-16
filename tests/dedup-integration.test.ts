import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { unlinkSync } from 'node:fs';
import { initSchema, closeDb, getDb } from '../src/core/db.js';
import { findOrCreateEntity, findEntityByName } from '../src/core/entity-ops.js';
import { findDuplicateEntity, isDuplicateRelation } from '../src/extraction/dedup.js';
import { createRelation } from '../src/core/entity-ops.js';
import { randomBytes } from 'node:crypto';

const TEST_DB_PATH = `/tmp/memd-dedup-test-${process.pid}.db`;

beforeEach(() => {
  process.env.MEMD_DB_PATH = TEST_DB_PATH;
  initSchema();
});

afterEach(() => {
  closeDb();
  try { unlinkSync(TEST_DB_PATH); } catch { /* ignore */ }
});

describe('fuzzy dedup in findOrCreateEntity', () => {
  it('merges accented variant into existing entity', () => {
    const id1 = findOrCreateEntity('Patricia', 'person');
    const id2 = findOrCreateEntity('Patrícia', 'doctor');
    expect(id1).toBe(id2); // same entity via normalized match

    const found = findEntityByName('Patricia');
    expect(found).toBeDefined();
    expect(found!.types).toContain('person');
    expect(found!.types).toContain('doctor');
  });

  it('does NOT merge very different names', () => {
    const id1 = findOrCreateEntity('Patricia', 'person');
    const id2 = findOrCreateEntity('Oleksii', 'person');
    expect(id1).not.toBe(id2);
  });

  it('resolves alias after merge', () => {
    const db = getDb();
    const id = findOrCreateEntity('Podavach', 'organization');

    // Create an alias manually (simulating post-merge state)
    db.prepare('INSERT INTO entity_alias (id, entity_id, alias) VALUES (?, ?, ?)').run(
      randomBytes(8).toString('hex'), id, 'podavach.store'
    );

    // Now findDuplicateEntity should find via alias
    const dup = findDuplicateEntity('podavach.store');
    expect(dup).not.toBeNull();
    expect(dup!.id).toBe(id);
  });
});

describe('isDuplicateRelation', () => {
  it('detects existing relation', () => {
    const s = findOrCreateEntity('Oleksii', 'person');
    const t = findOrCreateEntity('Lisbon', 'place');
    createRelation({ source_id: s, target_id: t, type: 'lives_in', provenance: 'test' });

    expect(isDuplicateRelation(s, t, 'lives_in')).toBe(true);
    expect(isDuplicateRelation(s, t, 'works_at')).toBe(false);
  });

  it('ignores superseded relations', () => {
    const s = findOrCreateEntity('Oleksii', 'person');
    const t = findOrCreateEntity('Berlin', 'place');
    createRelation({
      source_id: s, target_id: t, type: 'lives_in',
      provenance: 'test', valid_until: '2024-01-01',
    });

    expect(isDuplicateRelation(s, t, 'lives_in')).toBe(false);
  });
});
