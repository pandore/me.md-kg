import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { getDb } from '../core/db.js';
import { parseMarkdownFile, type ParsedFact } from './parse-markdown.js';
import { findOrCreateEntity, createRelation, createEpisode } from '../core/entity-ops.js';
import { isDuplicateRelation } from '../extraction/dedup.js';

/**
 * Scan a file for a Name: key-value line and return the value.
 */
function detectUserName(filePath: string): string | undefined {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const match = content.match(/^[-*]?\s*\**Name\**\s*:\s*(.+)/im);
    return match ? match[1].trim() : undefined;
  } catch {
    return undefined;
  }
}

export async function seed(workspacePath?: string, userName?: string, dryRun: boolean = false) {
  const db = getDb();
  const allFacts: ParsedFact[] = [];
  const userNameFromCli = !!userName; // true if --user flag was provided

  if (workspacePath) {
    const wsPath = resolve(workspacePath);
    if (!existsSync(wsPath)) {
      return { ok: false as const, error: `Workspace not found: ${wsPath}` };
    }

    // Look for MEMORY.md, USER.md, and any .md files in the workspace
    const memoryPath = join(wsPath, 'MEMORY.md');
    const userPath = join(wsPath, 'USER.md');

    // Detect userName from USER.md if not provided via --user
    if (!userName && existsSync(userPath)) {
      userName = detectUserName(userPath);
    }
    if (!userName && existsSync(memoryPath)) {
      userName = detectUserName(memoryPath);
    }
    userName = userName || 'User';

    if (existsSync(memoryPath)) {
      console.error('[seed] Parsing MEMORY.md...');
      allFacts.push(...parseMarkdownFile(memoryPath, 'seed:memory_md', userName, userNameFromCli));
    }

    if (existsSync(userPath)) {
      console.error('[seed] Parsing USER.md...');
      allFacts.push(...parseMarkdownFile(userPath, 'seed:user_md', userName, userNameFromCli));
    }

    // Also check for memory/ subdirectory (Claude-style memory files)
    const memoryDir = join(wsPath, 'memory');
    if (existsSync(memoryDir)) {
      console.error('[seed] Parsing memory/ directory...');
      const files = readdirSync(memoryDir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        const filePath = join(memoryDir, file);
        allFacts.push(...parseMarkdownFile(filePath, `seed:memory/${file}`, userName, userNameFromCli));
      }
    }
  } else {
    // If no workspace, look for default OpenClaw workspace
    const defaultPaths = [
      resolve(process.env.HOME || '~', '.openclaw', 'workspace'),
      resolve(process.env.HOME || '~', '.openclaw', 'workspaces', 'main'),
      resolve(process.env.HOME || '~', '.openclaw', 'workspaces', 'default'),
    ];

    for (const p of defaultPaths) {
      if (existsSync(p)) {
        console.error(`[seed] Found workspace at ${p}`);
        return seed(p, userName, dryRun);
      }
    }

    return { ok: false as const, error: 'No workspace path provided and no default workspace found. Use --workspace <path>' };
  }

  if (allFacts.length === 0) {
    return { ok: true as const, data: { message: 'No facts found to seed', entities: 0, relations_new: 0, relations_skipped: 0 } };
  }

  if (dryRun) {
    return {
      ok: true as const,
      data: {
        message: `[DRY RUN] Would insert ${allFacts.length} facts (nothing written)`,
        dry_run: true,
        facts_parsed: allFacts.length,
        facts: allFacts.map(f => ({
          source: f.source.name,
          relation: f.relation,
          target: f.target.name,
          confidence: f.confidence,
        })),
      },
    };
  }

  // Insert facts (idempotent — skip duplicate relations)
  console.error(`[seed] Inserting ${allFacts.length} facts...`);
  let relationsNew = 0;
  let relationsSkipped = 0;

  const insertMany = db.transaction(() => {
    for (const fact of allFacts) {
      const sourceId = findOrCreateEntity(fact.source.name, fact.source.type);
      const targetId = findOrCreateEntity(fact.target.name, fact.target.type);

      if (isDuplicateRelation(sourceId, targetId, fact.relation)) {
        relationsSkipped++;
        continue;
      }

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

      relationsNew++;
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
      relations_new: relationsNew,
      relations_skipped: relationsSkipped,
    },
  };
}
