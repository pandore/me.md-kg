import { getDb } from '../core/db.js';

export function stats() {
  const db = getDb();

  const entityCounts = db.prepare(`
    SELECT type, COUNT(*) as count FROM entity GROUP BY type ORDER BY count DESC
  `).all() as Array<{ type: string; count: number }>;

  const totalEntities = db.prepare('SELECT COUNT(*) as count FROM entity').get() as { count: number };
  const totalRelations = db.prepare('SELECT COUNT(*) as count FROM relation').get() as { count: number };
  const verifiedRelations = db.prepare('SELECT COUNT(*) as count FROM relation WHERE verified = 1').get() as { count: number };
  const unverifiedRelations = db.prepare('SELECT COUNT(*) as count FROM relation WHERE verified = 0').get() as { count: number };
  const totalEpisodes = db.prepare('SELECT COUNT(*) as count FROM episode').get() as { count: number };

  const relationTypes = db.prepare(`
    SELECT type, COUNT(*) as count FROM relation GROUP BY type ORDER BY count DESC
  `).all() as Array<{ type: string; count: number }>;

  return {
    ok: true as const,
    data: {
      entities: {
        total: totalEntities.count,
        by_type: Object.fromEntries(entityCounts.map(r => [r.type, r.count])),
      },
      relations: {
        total: totalRelations.count,
        verified: verifiedRelations.count,
        unverified: unverifiedRelations.count,
        by_type: Object.fromEntries(relationTypes.map(r => [r.type, r.count])),
      },
      episodes: {
        total: totalEpisodes.count,
      },
    },
  };
}
