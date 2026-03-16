import { getDb } from '../core/db.js';

/**
 * Jaro-Winkler string similarity (pure TypeScript, no deps).
 * Returns 0-1 where 1 = identical.
 */
export function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  if (!s1.length || !s2.length) return 0;

  const maxDist = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - maxDist);
    const end = Math.min(i + maxDist + 1, s2.length);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const jaro = (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3;

  // Winkler prefix bonus
  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(s1.length, s2.length)); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

/**
 * Normalize a name for dedup comparison:
 * - Strip accents (NFD decompose)
 * - Lowercase
 * - Strip common suffixes (Inc, Ltd, Company, GmbH)
 * - Strip articles (the, a, an)
 */
export function normalizeForDedup(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritical marks
    .toLowerCase()
    .replace(/\b(inc|ltd|llc|company|gmbh|co|corp|corporation|limited)\b\.?/gi, '')
    .replace(/^(the|a|an)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Find existing entity that matches by name (case-insensitive) or fuzzy match.
 * Returns the canonical name and ID if found.
 */
export function findDuplicateEntity(name: string, _type?: string): { id: string; name: string } | null {
  const db = getDb();
  const normalized = normalizeForDedup(name);

  // Exact normalized match first
  const exact = db.prepare(
    'SELECT id, name FROM entity WHERE LOWER(name) = LOWER(?)'
  ).get(name) as { id: string; name: string } | undefined;
  if (exact) return exact;

  // Try normalized match
  const allEntities = db.prepare('SELECT id, name FROM entity').all() as Array<{ id: string; name: string }>;

  for (const entity of allEntities) {
    if (normalizeForDedup(entity.name) === normalized) {
      return entity;
    }
  }

  // Also check aliases
  const alias = db.prepare(
    'SELECT ea.entity_id as id, e.name FROM entity_alias ea JOIN entity e ON ea.entity_id = e.id WHERE LOWER(ea.alias) = LOWER(?)'
  ).get(name) as { id: string; name: string } | undefined;
  if (alias) return alias;

  // Jaro-Winkler fuzzy match (threshold: 0.85)
  let bestMatch: { id: string; name: string } | null = null;
  let bestScore = 0;

  for (const entity of allEntities) {
    const score = jaroWinkler(normalized, normalizeForDedup(entity.name));
    if (score >= 0.85 && score > bestScore) {
      bestScore = score;
      bestMatch = entity;
    }
  }

  return bestMatch;
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
