import { getDb } from '../core/db.js';
import { randomBytes } from 'node:crypto';

function genId(): string {
  return randomBytes(8).toString('hex');
}

/**
 * Merge multiple entities into a canonical entity.
 * First name is canonical; rest are merged into it.
 * - Redirects all relations from merged entities to canonical
 * - Unions types arrays
 * - Creates alias records for merged names
 * - Deletes merged entities
 */
export function merge(names: string[]) {
  if (names.length < 2) {
    return { ok: false as const, error: 'Need at least 2 entity names. First is canonical, rest are merged into it.' };
  }

  const db = getDb();
  const canonicalName = names[0];
  const mergeNames = names.slice(1);

  // Find canonical entity
  const canonical = db.prepare(
    'SELECT id, name, types FROM entity WHERE LOWER(name) = LOWER(?)'
  ).get(canonicalName) as { id: string; name: string; types: string } | undefined;

  if (!canonical) {
    return { ok: false as const, error: `Canonical entity "${canonicalName}" not found` };
  }

  const canonicalTypes: string[] = JSON.parse(canonical.types);
  const mergedIds: string[] = [];
  const aliasesCreated: string[] = [];

  const doMerge = db.transaction(() => {
    for (const name of mergeNames) {
      const entity = db.prepare(
        'SELECT id, name, types FROM entity WHERE LOWER(name) = LOWER(?)'
      ).get(name) as { id: string; name: string; types: string } | undefined;

      if (!entity) {
        console.error(`[merge] Entity "${name}" not found, skipping`);
        continue;
      }

      if (entity.id === canonical.id) {
        console.error(`[merge] "${name}" is the canonical entity, skipping`);
        continue;
      }

      // Union types
      const entityTypes: string[] = JSON.parse(entity.types);
      for (const t of entityTypes) {
        if (!canonicalTypes.includes(t)) {
          canonicalTypes.push(t);
        }
      }

      // Redirect relations: source
      db.prepare('UPDATE relation SET source_id = ? WHERE source_id = ?').run(canonical.id, entity.id);

      // Redirect relations: target
      db.prepare('UPDATE relation SET target_id = ? WHERE target_id = ?').run(canonical.id, entity.id);

      // Create alias
      db.prepare('INSERT INTO entity_alias (id, entity_id, alias) VALUES (?, ?, ?)').run(
        genId(), canonical.id, entity.name
      );
      aliasesCreated.push(entity.name);

      // Delete merged entity
      db.prepare('DELETE FROM entity WHERE id = ?').run(entity.id);
      mergedIds.push(entity.id);
    }

    // Update canonical entity types
    db.prepare(
      "UPDATE entity SET types = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(JSON.stringify(canonicalTypes), canonical.id);
  });

  doMerge();

  return {
    ok: true as const,
    data: {
      message: `Merged ${mergedIds.length} entities into "${canonical.name}"`,
      canonical: { id: canonical.id, name: canonical.name, types: canonicalTypes },
      merged: mergedIds.length,
      aliases: aliasesCreated,
    },
  };
}
