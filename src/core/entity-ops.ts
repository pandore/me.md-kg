import { getDb } from './db.js';
import { randomBytes } from 'node:crypto';

function genId(): string {
  return randomBytes(8).toString('hex');
}

/**
 * Find entity by name (case-insensitive), or create if not found.
 * If found, merges the new type into the existing types array.
 * Returns entity ID.
 */
export function findOrCreateEntity(name: string, type: string, summary?: string): string {
  const db = getDb();

  const existing = db.prepare(
    'SELECT id, types FROM entity WHERE LOWER(name) = LOWER(?)'
  ).get(name) as { id: string; types: string } | undefined;

  if (existing) {
    // Merge type into existing types array
    const currentTypes: string[] = JSON.parse(existing.types);
    if (!currentTypes.includes(type)) {
      currentTypes.push(type);
      db.prepare(
        "UPDATE entity SET types = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(JSON.stringify(currentTypes), existing.id);
    }
    return existing.id;
  }

  const id = genId();
  db.prepare(
    'INSERT INTO entity (id, name, types, summary) VALUES (?, ?, ?, ?)'
  ).run(id, name, JSON.stringify([type]), summary || null);

  return id;
}

/**
 * Find entity by name (case-insensitive, any type).
 */
export function findEntityByName(name: string): { id: string; name: string; types: string[]; summary: string | null } | undefined {
  const db = getDb();
  const row = db.prepare(
    'SELECT id, name, types, summary FROM entity WHERE LOWER(name) = LOWER(?)'
  ).get(name) as { id: string; name: string; types: string; summary: string | null } | undefined;

  if (!row) return undefined;
  return { ...row, types: JSON.parse(row.types) };
}

/**
 * Create a relation between two entities.
 * Returns relation ID.
 */
export function createRelation(opts: {
  source_id: string;
  target_id: string;
  type: string;
  summary?: string;
  confidence?: number;
  provenance?: string;
  valid_from?: string;
  valid_until?: string;
  verified?: boolean;
  access_tags?: string[];
}): string {
  const db = getDb();
  const id = genId();

  db.prepare(`
    INSERT INTO relation (id, source_id, target_id, type, summary, confidence, provenance, valid_from, valid_until, verified, access_tags)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    opts.source_id,
    opts.target_id,
    opts.type,
    opts.summary || null,
    opts.confidence ?? 0.5,
    opts.provenance || 'unknown',
    opts.valid_from || null,
    opts.valid_until || null,
    opts.verified ? 1 : 0,
    JSON.stringify(opts.access_tags || ['all']),
  );

  return id;
}

/**
 * Create an episode (provenance record).
 */
export function createEpisode(opts: {
  relation_id: string;
  source_type: string;
  source_ref?: string;
  content?: string;
}): string {
  const db = getDb();
  const id = genId();

  db.prepare(`
    INSERT INTO episode (id, relation_id, source_type, source_ref, content)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, opts.relation_id, opts.source_type, opts.source_ref || null, opts.content || null);

  return id;
}

/**
 * Supersede a relation by setting its valid_until to now.
 */
export function supersedeRelation(relationId: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE relation SET valid_until = datetime('now') WHERE id = ?"
  ).run(relationId);
}

/**
 * Update entity summary.
 */
export function updateEntitySummary(entityId: string, summary: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE entity SET summary = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(summary, entityId);
}
