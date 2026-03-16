import { getDb } from '../core/db.js';

export function exportAsJson(tags?: string[]) {
  const db = getDb();

  const entities = db.prepare('SELECT * FROM entity').all();
  const allRelations = db.prepare(`
    SELECT r.*, s.name as source_name, t.name as target_name
    FROM relation r
    JOIN entity s ON r.source_id = s.id
    JOIN entity t ON r.target_id = t.id
    WHERE r.valid_until IS NULL
    ORDER BY r.verified DESC, r.confidence DESC
  `).all() as Array<any>;

  // Filter by tags
  const relations = tags && tags.length > 0
    ? allRelations.filter(r => {
        const factTags = JSON.parse(r.access_tags || '["all"]') as string[];
        return factTags.includes('all') || factTags.some((t: string) => tags!.includes(t));
      })
    : allRelations;

  const episodes = db.prepare('SELECT * FROM episode').all();

  const totalEntities = (db.prepare('SELECT COUNT(*) as c FROM entity').get() as { c: number }).c;
  const verifiedCount = (db.prepare('SELECT COUNT(*) as c FROM relation WHERE verified = 1').get() as { c: number }).c;

  return {
    exportVersion: '1.0',
    exportedAt: new Date().toISOString(),
    source: 'me.md-kg',
    metadata: {
      totalEntities,
      totalRelations: relations.length,
      verifiedRelations: verifiedCount,
      totalEpisodes: episodes.length,
    },
    entities,
    relations,
    episodes,
  };
}
