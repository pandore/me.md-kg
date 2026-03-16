import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { unlinkSync } from 'node:fs';
import { initSchema, closeDb, getDb } from '../src/core/db.js';
import { findOrCreateEntity, createRelation } from '../src/core/entity-ops.js';
import { merge } from '../src/commands/merge.js';

const TEST_DB_PATH = `/tmp/memd-merge-test-${process.pid}.db`;

beforeEach(() => {
  process.env.MEMD_DB_PATH = TEST_DB_PATH;
  initSchema();
});

afterEach(() => {
  closeDb();
  try { unlinkSync(TEST_DB_PATH); } catch { /* ignore */ }
});

describe('merge command', () => {
  it('merges two entities into canonical', () => {
    // Use db directly to create entities that bypass fuzzy dedup
    const db = getDb();
    const { randomBytes } = require('node:crypto');
    const id1 = randomBytes(8).toString('hex');
    const id2 = randomBytes(8).toString('hex');
    const userId = findOrCreateEntity('Oleksii', 'person');

    db.prepare('INSERT INTO entity (id, name, types) VALUES (?, ?, ?)').run(id1, 'Podavach', '["organization"]');
    db.prepare('INSERT INTO entity (id, name, types) VALUES (?, ?, ?)').run(id2, 'podavach.store', '["organization"]');

    // Create relation to the duplicate
    createRelation({ source_id: userId, target_id: id2, type: 'works_at', provenance: 'test' });

    const result = merge(['Podavach', 'podavach.store']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.merged).toBe(1);
      expect(result.data.aliases).toContain('podavach.store');
    }

    // Relation should now point to canonical entity
    const rel = db.prepare('SELECT target_id FROM relation WHERE type = ?').get('works_at') as { target_id: string };
    expect(rel.target_id).toBe(id1);

    // Duplicate should be deleted
    const count = (db.prepare('SELECT COUNT(*) as c FROM entity').get() as { c: number }).c;
    expect(count).toBe(2); // Oleksii + Podavach (podavach.store deleted)

    // Alias should exist
    const alias = db.prepare('SELECT alias FROM entity_alias WHERE entity_id = ?').get(id1) as { alias: string };
    expect(alias.alias).toBe('podavach.store');
  });

  it('unions types from merged entities', () => {
    // Insert directly to avoid fuzzy dedup merging them
    const db = getDb();
    const { randomBytes } = require('node:crypto');
    const id1 = randomBytes(8).toString('hex');
    const id2 = randomBytes(8).toString('hex');

    db.prepare('INSERT INTO entity (id, name, types) VALUES (?, ?, ?)').run(id1, 'Patricia', '["person"]');
    db.prepare('INSERT INTO entity (id, name, types) VALUES (?, ?, ?)').run(id2, 'Dr. Patricia', '["doctor"]');

    const result = merge(['Patricia', 'Dr. Patricia']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.canonical.types).toContain('person');
      expect(result.data.canonical.types).toContain('doctor');
    }
  });

  it('returns error for missing canonical', () => {
    const result = merge(['NonExistent', 'Also']);
    expect(result.ok).toBe(false);
  });

  it('requires at least 2 names', () => {
    const result = merge(['OnlyOne']);
    expect(result.ok).toBe(false);
  });

  it('skips entities that are not found', () => {
    findOrCreateEntity('Podavach', 'organization');
    const result = merge(['Podavach', 'NonExistent']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.merged).toBe(0);
    }
  });
});
