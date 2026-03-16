import { existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { getDb } from '../core/db.js';
import { parseMarkdownFile, type ParsedFact } from './parse-markdown.js';
import { findOrCreateEntity, createRelation, createEpisode } from '../core/entity-ops.js';

export async function seed(workspacePath?: string) {
  const db = getDb();
  const allFacts: ParsedFact[] = [];

  if (workspacePath) {
    const wsPath = resolve(workspacePath);
    if (!existsSync(wsPath)) {
      return { ok: false as const, error: `Workspace not found: ${wsPath}` };
    }

    // Look for MEMORY.md, USER.md, and any .md files in the workspace
    const memoryPath = join(wsPath, 'MEMORY.md');
    const userPath = join(wsPath, 'USER.md');

    if (existsSync(memoryPath)) {
      console.error('[seed] Parsing MEMORY.md...');
      allFacts.push(...parseMarkdownFile(memoryPath, 'seed:memory_md'));
    }

    if (existsSync(userPath)) {
      console.error('[seed] Parsing USER.md...');
      allFacts.push(...parseMarkdownFile(userPath, 'seed:user_md'));
    }

    // Also check for memory/ subdirectory (Claude-style memory files)
    const memoryDir = join(wsPath, 'memory');
    if (existsSync(memoryDir)) {
      console.error('[seed] Parsing memory/ directory...');
      const files = readdirSync(memoryDir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        const filePath = join(memoryDir, file);
        allFacts.push(...parseMarkdownFile(filePath, `seed:memory/${file}`));
      }
    }
  } else {
    // If no workspace, look for default OpenClaw workspace
    const defaultPaths = [
      resolve(process.env.HOME || '~', '.openclaw', 'workspaces', 'main'),
      resolve(process.env.HOME || '~', '.openclaw', 'workspaces', 'default'),
    ];

    for (const p of defaultPaths) {
      if (existsSync(p)) {
        console.error(`[seed] Found workspace at ${p}`);
        return seed(p);
      }
    }

    return { ok: false as const, error: 'No workspace path provided and no default workspace found. Use --workspace <path>' };
  }

  if (allFacts.length === 0) {
    return { ok: true as const, data: { message: 'No facts found to seed', entities: 0, relations: 0 } };
  }

  // Insert facts
  console.error(`[seed] Inserting ${allFacts.length} facts...`);
  let relationsCreated = 0;

  const insertMany = db.transaction(() => {
    for (const fact of allFacts) {
      const sourceId = findOrCreateEntity(fact.source.name, fact.source.type);
      const targetId = findOrCreateEntity(fact.target.name, fact.target.type);

      const relationId = createRelation({
        source_id: sourceId,
        target_id: targetId,
        type: fact.relation,
        summary: fact.summary,
        confidence: fact.confidence,
        provenance: fact.provenance,
      });

      createEpisode({
        relation_id: relationId,
        source_type: fact.provenance.startsWith('seed:memory') ? 'memory_md' : 'user_md',
        source_ref: fact.provenance,
        content: fact.summary,
      });

      relationsCreated++;
    }
  });

  insertMany();

  // Count distinct entities created
  const entityCount = (db.prepare('SELECT COUNT(*) as count FROM entity').get() as { count: number }).count;

  return {
    ok: true as const,
    data: {
      message: `Seeded knowledge graph from workspace`,
      facts_parsed: allFacts.length,
      entities: entityCount,
      relations: relationsCreated,
    },
  };
}
