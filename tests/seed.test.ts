import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { unlinkSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { initSchema, closeDb, getDb } from '../src/core/db.js';
import { seed } from '../src/seed/seed.js';
import { parseMarkdown } from '../src/seed/parse-markdown.js';

const TEST_DB_PATH = `/tmp/memd-seed-test-${process.pid}.db`;
const TEST_WS_PATH = `/tmp/memd-seed-ws-${process.pid}`;

beforeEach(() => {
  process.env.MEMD_DB_PATH = TEST_DB_PATH;
  initSchema();
  mkdirSync(TEST_WS_PATH, { recursive: true });
});

afterEach(() => {
  closeDb();
  try { unlinkSync(TEST_DB_PATH); } catch { /* ignore */ }
  try { rmSync(TEST_WS_PATH, { recursive: true }); } catch { /* ignore */ }
});

describe('parseMarkdown', () => {
  it('extracts key-value pairs', () => {
    const facts = parseMarkdown('Name: Oleksii\nLocation: Lisbon', 'test');
    expect(facts.length).toBeGreaterThanOrEqual(2);
    const names = facts.map(f => f.relation);
    expect(names).toContain('has_name');
    expect(names).toContain('lives_in');
  });

  it('uses provided userName instead of hardcoded', () => {
    const facts = parseMarkdown('Location: Lisbon', 'test', 'TestUser');
    expect(facts[0].source.name).toBe('TestUser');
  });

  it('overrides userName when Name: found', () => {
    const facts = parseMarkdown('Name: Oleksii\nLocation: Lisbon', 'test', 'Default');
    // After Name: Oleksii, the userName should be Oleksii for subsequent facts
    const livesIn = facts.find(f => f.relation === 'lives_in');
    expect(livesIn!.source.name).toBe('Oleksii');
  });

  it('extracts Ukrainian patterns', () => {
    const facts = parseMarkdown('- працює в Podavach\n- живе в Лісабоні', 'test');
    const relations = facts.map(f => f.relation);
    expect(relations).toContain('works_at');
    expect(relations).toContain('lives_in');
  });

  it('extracts Portuguese patterns', () => {
    const facts = parseMarkdown('- trabalha em Google\n- mora em Lisboa', 'test');
    const relations = facts.map(f => f.relation);
    expect(relations).toContain('works_at');
    expect(relations).toContain('lives_in');
  });
});

describe('seed', () => {
  it('seeds from workspace with USER.md', async () => {
    writeFileSync(join(TEST_WS_PATH, 'USER.md'), 'Name: TestUser\nLocation: Lisbon\nCompany: Acme');
    const result = await seed(TEST_WS_PATH);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.facts_parsed).toBeGreaterThan(0);
      expect(result.data.relations_new).toBeGreaterThan(0);
    }
  });

  it('is idempotent — second run skips duplicates', async () => {
    writeFileSync(join(TEST_WS_PATH, 'USER.md'), 'Name: TestUser\nLocation: Lisbon');

    const run1 = await seed(TEST_WS_PATH);
    const run2 = await seed(TEST_WS_PATH);

    expect(run1.ok).toBe(true);
    expect(run2.ok).toBe(true);
    if (run1.ok && run2.ok) {
      expect(run1.data.relations_new).toBeGreaterThan(0);
      expect(run2.data.relations_new).toBe(0);
      expect(run2.data.relations_skipped).toBeGreaterThan(0);
    }
  });

  it('dry-run does not insert', async () => {
    writeFileSync(join(TEST_WS_PATH, 'USER.md'), 'Name: TestUser\nLocation: Lisbon');
    const result = await seed(TEST_WS_PATH, undefined, true);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.dry_run).toBe(true);
      expect(result.data.facts_parsed).toBeGreaterThan(0);
    }

    // DB should be empty
    const db = getDb();
    const count = (db.prepare('SELECT COUNT(*) as c FROM entity').get() as { c: number }).c;
    expect(count).toBe(0);
  });

  it('detects userName from USER.md', async () => {
    writeFileSync(join(TEST_WS_PATH, 'USER.md'), 'Name: AutoDetected\nLocation: Berlin');
    const result = await seed(TEST_WS_PATH);

    expect(result.ok).toBe(true);
    const db = getDb();
    const user = db.prepare("SELECT name FROM entity WHERE LOWER(name) = 'autodetected'").get() as { name: string } | undefined;
    expect(user).toBeDefined();
  });

  it('uses --user override', async () => {
    writeFileSync(join(TEST_WS_PATH, 'USER.md'), 'Name: FromFile\nLocation: Berlin');
    const result = await seed(TEST_WS_PATH, 'OverrideName');

    expect(result.ok).toBe(true);
    const db = getDb();
    const user = db.prepare("SELECT name FROM entity WHERE LOWER(name) = 'overridename'").get() as { name: string } | undefined;
    expect(user).toBeDefined();
  });

  it('returns error for missing workspace', async () => {
    const result = await seed('/tmp/nonexistent-ws-12345');
    expect(result.ok).toBe(false);
  });
});
