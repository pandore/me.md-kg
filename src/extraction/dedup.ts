import { getDb } from '../core/db.js';

/**
 * Find existing entity that matches by name (case-insensitive).
 * Returns the canonical name and ID if found.
 */
export function findDuplicateEntity(name: string, type: string): { id: string; name: string } | null {
  const db = getDb();

  // Exact match (case-insensitive)
  const exact = db.prepare(
    'SELECT id, name FROM entity WHERE LOWER(name) = LOWER(?) AND type = ?'
  ).get(name, type) as { id: string; name: string } | undefined;

  if (exact) return exact;

  // Try without common prefixes/suffixes
  const normalized = name.replace(/^(the|a|an)\s+/i, '').trim();
  if (normalized !== name) {
    const fuzzy = db.prepare(
      'SELECT id, name FROM entity WHERE LOWER(name) = LOWER(?) AND type = ?'
    ).get(normalized, type) as { id: string; name: string } | undefined;
    if (fuzzy) return fuzzy;
  }

  return null;
}

/**
 * Check if a relation already exists between two entities with the same type.
 */
export function isDuplicateRelation(sourceId: string, targetId: string, relationType: string): boolean {
  const db = getDb();
  const existing = db.prepare(
    'SELECT id FROM relation WHERE source_id = ? AND target_id = ? AND type = ? AND valid_until IS NULL'
  ).get(sourceId, targetId, relationType);
  return !!existing;
}
