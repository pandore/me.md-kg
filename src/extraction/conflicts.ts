import { getDb } from '../core/db.js';

/**
 * Relation types where only one active target makes sense per source entity.
 * e.g., a person can only live in one place "now", work at one primary company, etc.
 */
const SINGULAR_RELATION_TYPES = new Set([
  'lives_in',
  'works_at',
  'has_role',
  'has_name',
]);

export interface ConflictResult {
  existingRelationId: string;
  existingTarget: string;
  newTarget: string;
  relationType: string;
}

/**
 * Check if inserting a new relation would conflict with an existing one.
 * A conflict exists when:
 * - Same source entity + same relation type
 * - The relation type is "singular" (only one active value expected)
 * - Both are currently valid (valid_until IS NULL)
 * - Different target
 *
 * Returns the conflict if found, or null.
 */
export function detectConflict(
  sourceId: string,
  targetId: string,
  relationType: string,
): ConflictResult | null {
  if (!SINGULAR_RELATION_TYPES.has(relationType)) return null;

  const db = getDb();

  const existing = db.prepare(`
    SELECT r.id, t.name as target_name
    FROM relation r
    JOIN entity t ON r.target_id = t.id
    WHERE r.source_id = ? AND r.type = ? AND r.valid_until IS NULL AND r.target_id != ?
    ORDER BY r.confidence DESC
    LIMIT 1
  `).get(sourceId, relationType, targetId) as { id: string; target_name: string } | undefined;

  if (!existing) return null;

  const newTarget = db.prepare('SELECT name FROM entity WHERE id = ?').get(targetId) as { name: string } | undefined;

  return {
    existingRelationId: existing.id,
    existingTarget: existing.target_name,
    newTarget: newTarget?.name || targetId,
    relationType,
  };
}

/**
 * Resolve a conflict by superseding the old relation (set valid_until).
 */
export function resolveConflictSupersede(existingRelationId: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE relation SET valid_until = datetime('now') WHERE id = ?"
  ).run(existingRelationId);
}
