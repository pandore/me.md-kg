import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { unlinkSync } from 'node:fs';
import { getDb, initSchema, closeDb } from '../src/core/db.js';
import { findOrCreateEntity, createRelation, createEpisode, findEntityByName, supersedeRelation } from '../src/core/entity-ops.js';
import { stats } from '../src/commands/stats.js';
import { browse } from '../src/commands/browse.js';
import { verify } from '../src/commands/verify.js';
import { classifyInterval, calculateReVerifyAt } from '../src/core/reverify.js';
import { markVerified, markRejected, editAndVerify, getUnverifiedBatch } from '../src/core/verification.js';

// Use temp file for tests
const TEST_DB_PATH = `/tmp/memd-test-${process.pid}.db`;

beforeEach(() => {
  process.env.MEMD_DB_PATH = TEST_DB_PATH;
  initSchema();
});

afterEach(() => {
  closeDb();
  try {
    unlinkSync(TEST_DB_PATH);
  } catch { /* ignore */ }
});

describe('entity-ops', () => {
  it('creates and finds entities', () => {
    const id1 = findOrCreateEntity('Oleksii', 'person');
    const id2 = findOrCreateEntity('Oleksii', 'person');
    expect(id1).toBe(id2); // same entity

    const id3 = findOrCreateEntity('Podavach', 'organization');
    expect(id3).not.toBe(id1);

    const found = findEntityByName('Oleksii');
    expect(found).toBeDefined();
    expect(found!.name).toBe('Oleksii');
    expect(found!.types).toContain('person');
  });

  it('merges types when entity already exists', () => {
    const id1 = findOrCreateEntity('Patricia', 'person');
    const id2 = findOrCreateEntity('Patricia', 'doctor');
    expect(id1).toBe(id2); // same entity

    const found = findEntityByName('Patricia');
    expect(found).toBeDefined();
    expect(found!.types).toContain('person');
    expect(found!.types).toContain('doctor');
  });

  it('creates relations and episodes', () => {
    const source = findOrCreateEntity('Oleksii', 'person');
    const target = findOrCreateEntity('Podavach', 'organization');

    const relId = createRelation({
      source_id: source,
      target_id: target,
      type: 'works_at',
      summary: 'Founder of Podavach',
      confidence: 0.9,
      provenance: 'test',
    });
    expect(relId).toBeDefined();

    const epId = createEpisode({
      relation_id: relId,
      source_type: 'manual',
      content: 'test episode',
    });
    expect(epId).toBeDefined();
  });

  it('supersedes relations', () => {
    const source = findOrCreateEntity('Oleksii', 'person');
    const target = findOrCreateEntity('Lisbon', 'place');
    const relId = createRelation({
      source_id: source,
      target_id: target,
      type: 'lives_in',
      provenance: 'test',
    });

    supersedeRelation(relId);

    const db = getDb();
    const rel = db.prepare('SELECT valid_until FROM relation WHERE id = ?').get(relId) as { valid_until: string };
    expect(rel.valid_until).not.toBeNull();
  });
});

describe('stats', () => {
  it('returns counts', () => {
    findOrCreateEntity('Oleksii', 'person');
    findOrCreateEntity('Podavach', 'organization');

    const result = stats();
    expect(result.ok).toBe(true);
    expect(result.data.entities.total).toBe(2);
  });
});

describe('browse', () => {
  it('finds entity and its relations', () => {
    const source = findOrCreateEntity('Oleksii', 'person');
    const target = findOrCreateEntity('Podavach', 'organization');
    createRelation({
      source_id: source,
      target_id: target,
      type: 'works_at',
      summary: 'Founder',
      confidence: 0.9,
      provenance: 'test',
    });

    const result = browse('Oleksii');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.entity.name).toBe('Oleksii');
      expect(result.data.relations).toHaveLength(1);
      expect(result.data.relations[0].type).toBe('works_at');
      expect(result.data.relations[0].related_entity.name).toBe('Podavach');
    }
  });

  it('returns error for missing entity', () => {
    const result = browse('NonExistent');
    expect(result.ok).toBe(false);
  });

  it('supports partial name matching', () => {
    findOrCreateEntity('Oleksii Nikitin', 'person');
    const result = browse('Nikitin');
    expect(result.ok).toBe(true);
  });
});

describe('verification', () => {
  it('shows unverified batch', () => {
    const source = findOrCreateEntity('Oleksii', 'person');
    const target = findOrCreateEntity('Lisbon', 'place');
    createRelation({
      source_id: source,
      target_id: target,
      type: 'lives_in',
      summary: 'Lives in Lisbon',
      confidence: 0.8,
      provenance: 'test',
    });

    const result = verify({});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.facts).toHaveLength(1);
      expect(result.data.facts[0].fact).toContain('lives_in');
    }
  });

  it('confirms and rejects facts', () => {
    const source = findOrCreateEntity('Oleksii', 'person');
    const t1 = findOrCreateEntity('Lisbon', 'place');
    const t2 = findOrCreateEntity('Berlin', 'place');

    const rel1 = createRelation({ source_id: source, target_id: t1, type: 'lives_in', summary: 'Lives in Lisbon', provenance: 'test' });
    const rel2 = createRelation({ source_id: source, target_id: t2, type: 'lives_in', summary: 'Lives in Berlin', provenance: 'test' });

    markVerified(rel1);
    markRejected(rel2);

    const db = getDb();
    const r1 = db.prepare('SELECT verified FROM relation WHERE id = ?').get(rel1) as { verified: number };
    const r2 = db.prepare('SELECT valid_until FROM relation WHERE id = ?').get(rel2) as { valid_until: string };

    expect(r1.verified).toBe(1);
    expect(r2.valid_until).not.toBeNull();
  });

  it('edits and verifies facts', () => {
    const source = findOrCreateEntity('Oleksii', 'person');
    const target = findOrCreateEntity('Patricia', 'doctor');
    const relId = createRelation({ source_id: source, target_id: target, type: 'has_doctor', summary: 'Osteopath', provenance: 'test' });

    editAndVerify(relId, 'Physiotherapist');

    const db = getDb();
    const rel = db.prepare('SELECT summary, verified, confidence FROM relation WHERE id = ?').get(relId) as { summary: string; verified: number; confidence: number };
    expect(rel.summary).toBe('Physiotherapist');
    expect(rel.verified).toBe(1);
    expect(rel.confidence).toBe(0.95);
  });
});

describe('reverify', () => {
  it('classifies situational facts as weekly', () => {
    expect(classifyInterval('Currently working on a project', 0.8)).toBe('weekly');
    expect(classifyInterval('Right now feeling good', 0.5)).toBe('weekly');
  });

  it('classifies core traits as biannual', () => {
    expect(classifyInterval('I always value honesty', 0.85)).toBe('biannual');
    expect(classifyInterval('My core principle is integrity', 0.8)).toBe('biannual');
  });

  it('classifies preferences as quarterly', () => {
    expect(classifyInterval('I prefer working alone', 0.6)).toBe('quarterly');
    expect(classifyInterval('I enjoy cooking', 0.5)).toBe('quarterly');
  });

  it('defaults to monthly for low confidence', () => {
    expect(classifyInterval('Some random fact', 0.5)).toBe('monthly');
  });

  it('calculates re-verify dates', () => {
    const weekly = new Date(calculateReVerifyAt('weekly'));
    const monthly = new Date(calculateReVerifyAt('monthly'));
    const now = new Date();

    expect(weekly.getTime()).toBeGreaterThan(now.getTime());
    expect(monthly.getTime()).toBeGreaterThan(weekly.getTime());
  });
});
