import { getDb } from './db.js';
import { createEpisode } from './entity-ops.js';
import { classifyInterval, calculateReVerifyAt } from './reverify.js';

/**
 * Mark a relation as verified by the user.
 */
export function markVerified(relationId: string): void {
  const db = getDb();
  const relation = db.prepare('SELECT summary, confidence FROM relation WHERE id = ?').get(relationId) as { summary: string; confidence: number } | undefined;
  if (!relation) throw new Error(`Relation ${relationId} not found`);

  const interval = classifyInterval(relation.summary || '', relation.confidence);
  const reVerifyAt = calculateReVerifyAt(interval);

  db.prepare(`
    UPDATE relation SET verified = 1, verified_at = datetime('now'), verified_by = 'user',
    properties = json_set(COALESCE(properties, '{}'), '$.re_verify_at', ?, '$.re_verify_interval', ?)
    WHERE id = ?
  `).run(reVerifyAt, interval, relationId);

  createEpisode({
    relation_id: relationId,
    source_type: 'manual',
    source_ref: 'verification:confirmed',
    content: `Verified by user`,
  });
}

/**
 * Mark a relation as rejected.
 */
export function markRejected(relationId: string): void {
  const db = getDb();

  db.prepare(`
    UPDATE relation SET valid_until = datetime('now'),
    properties = json_set(COALESCE(properties, '{}'), '$.rejected', true)
    WHERE id = ?
  `).run(relationId);

  createEpisode({
    relation_id: relationId,
    source_type: 'manual',
    source_ref: 'verification:rejected',
    content: 'Rejected by user',
  });
}

/**
 * Edit a relation's summary and mark as verified.
 */
export function editAndVerify(relationId: string, newSummary: string): void {
  const db = getDb();

  const interval = classifyInterval(newSummary, 0.85);
  const reVerifyAt = calculateReVerifyAt(interval);

  db.prepare(`
    UPDATE relation SET summary = ?, verified = 1, verified_at = datetime('now'), verified_by = 'user',
    confidence = 0.95,
    properties = json_set(COALESCE(properties, '{}'), '$.re_verify_at', ?, '$.re_verify_interval', ?, '$.edited', true)
    WHERE id = ?
  `).run(newSummary, reVerifyAt, interval, relationId);

  createEpisode({
    relation_id: relationId,
    source_type: 'manual',
    source_ref: 'verification:edited',
    content: `Edited and verified: ${newSummary}`,
  });
}

/**
 * Get unverified relations as a batch for review.
 */
export function getUnverifiedBatch(limit: number = 5, all: boolean = false): Array<{
  id: string;
  source_name: string;
  relation_type: string;
  target_name: string;
  summary: string | null;
  confidence: number;
}> {
  const db = getDb();

  const query = `
    SELECT r.id, s.name as source_name, r.type as relation_type, t.name as target_name,
           r.summary, r.confidence
    FROM relation r
    JOIN entity s ON r.source_id = s.id
    JOIN entity t ON r.target_id = t.id
    WHERE r.verified = 0 AND r.valid_until IS NULL
    ORDER BY r.confidence DESC
    ${all ? '' : 'LIMIT ?'}
  `;

  if (all) {
    return db.prepare(query).all() as Array<{
      id: string; source_name: string; relation_type: string;
      target_name: string; summary: string | null; confidence: number;
    }>;
  }

  return db.prepare(query).all(limit) as Array<{
    id: string; source_name: string; relation_type: string;
    target_name: string; summary: string | null; confidence: number;
  }>;
}
