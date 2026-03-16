import { getDb } from '../core/db.js';

interface BrowseEntity {
  id: string;
  name: string;
  type: string;
  summary: string | null;
}

interface BrowseRelation {
  direction: 'outgoing' | 'incoming';
  type: string;
  summary: string | null;
  confidence: number;
  verified: boolean;
  valid_from: string | null;
  valid_until: string | null;
  related_entity: BrowseEntity;
}

export function browse(name: string, depth: number = 1) {
  const db = getDb();

  // Find entity by name (case-insensitive)
  const entity = db.prepare(`
    SELECT id, name, type, summary FROM entity WHERE LOWER(name) = LOWER(?)
  `).get(name) as BrowseEntity | undefined;

  if (!entity) {
    // Try partial match
    const partial = db.prepare(`
      SELECT id, name, type, summary FROM entity WHERE LOWER(name) LIKE LOWER(?)
    `).all(`%${name}%`) as BrowseEntity[];

    if (partial.length === 0) {
      return { ok: false as const, error: `Entity "${name}" not found` };
    }
    if (partial.length > 1) {
      return {
        ok: true as const,
        data: {
          message: `Multiple entities match "${name}". Be more specific.`,
          matches: partial.map(e => ({ name: e.name, type: e.type })),
        },
      };
    }
    // Exactly one partial match
    return browseEntity(db, partial[0], depth);
  }

  return browseEntity(db, entity, depth);
}

function browseEntity(db: ReturnType<typeof getDb>, entity: BrowseEntity, depth: number) {
  const visited = new Set<string>([entity.id]);
  const relations: BrowseRelation[] = [];

  let currentIds = [entity.id];

  for (let hop = 0; hop < depth; hop++) {
    if (currentIds.length === 0) break;
    const placeholders = currentIds.map(() => '?').join(',');
    const nextIds: string[] = [];

    // Outgoing relations
    const outgoing = db.prepare(`
      SELECT r.type, r.summary, r.confidence, r.verified, r.valid_from, r.valid_until,
             e.id as eid, e.name as ename, e.type as etype, e.summary as esummary
      FROM relation r
      JOIN entity e ON r.target_id = e.id
      WHERE r.source_id IN (${placeholders})
    `).all(...currentIds) as Array<{
      type: string; summary: string | null; confidence: number; verified: number;
      valid_from: string | null; valid_until: string | null;
      eid: string; ename: string; etype: string; esummary: string | null;
    }>;

    for (const row of outgoing) {
      relations.push({
        direction: 'outgoing',
        type: row.type,
        summary: row.summary,
        confidence: row.confidence,
        verified: !!row.verified,
        valid_from: row.valid_from,
        valid_until: row.valid_until,
        related_entity: { id: row.eid, name: row.ename, type: row.etype, summary: row.esummary },
      });
      if (!visited.has(row.eid)) {
        visited.add(row.eid);
        nextIds.push(row.eid);
      }
    }

    // Incoming relations
    const incoming = db.prepare(`
      SELECT r.type, r.summary, r.confidence, r.verified, r.valid_from, r.valid_until,
             e.id as eid, e.name as ename, e.type as etype, e.summary as esummary
      FROM relation r
      JOIN entity e ON r.source_id = e.id
      WHERE r.target_id IN (${placeholders})
    `).all(...currentIds) as Array<{
      type: string; summary: string | null; confidence: number; verified: number;
      valid_from: string | null; valid_until: string | null;
      eid: string; ename: string; etype: string; esummary: string | null;
    }>;

    for (const row of incoming) {
      relations.push({
        direction: 'incoming',
        type: row.type,
        summary: row.summary,
        confidence: row.confidence,
        verified: !!row.verified,
        valid_from: row.valid_from,
        valid_until: row.valid_until,
        related_entity: { id: row.eid, name: row.ename, type: row.etype, summary: row.esummary },
      });
      if (!visited.has(row.eid)) {
        visited.add(row.eid);
        nextIds.push(row.eid);
      }
    }

    currentIds = nextIds;
  }

  return {
    ok: true as const,
    data: {
      entity: {
        id: entity.id,
        name: entity.name,
        type: entity.type,
        summary: entity.summary,
      },
      relations,
    },
  };
}
