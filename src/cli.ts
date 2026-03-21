#!/usr/bin/env tsx
import { initSchema, closeDb } from './core/db.js';

// CLI output contract: every command outputs { ok: boolean, data?: any, error?: string } to stdout
// Logs go to stderr

type CommandResult = { ok: true; data?: unknown } | { ok: false; error: string };

function log(...args: unknown[]) {
  console.error('[me.md-kg]', ...args);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(JSON.stringify({
      ok: true,
      data: {
        commands: ['seed', 'stats', 'browse', 'add', 'verify', 'query', 'export', 'merge', 'ingest', 'watch', 'onboard'],
        usage: 'tsx src/cli.ts <command> [args]',
      },
    }));
    return;
  }

  // Initialize schema
  try {
    initSchema();
  } catch (e: any) {
    console.log(JSON.stringify({ ok: false, error: `Schema init failed: ${e.message}` }));
    process.exit(1);
  }

  const dryRun = args.includes('--dry-run');
  let result: CommandResult;

  try {
    switch (command) {
      case 'seed': {
        const { seed } = await import('./seed/seed.js');
        const workspacePath = getFlag(args, '--workspace') || process.env.OPENCLAW_WORKSPACE;
        const seedUser = getFlag(args, '--user');
        result = await seed(workspacePath, seedUser, dryRun);
        break;
      }
      case 'stats': {
        const { stats } = await import('./commands/stats.js');
        result = stats();
        break;
      }
      case 'browse': {
        const { browse } = await import('./commands/browse.js');
        const name = args[1];
        const depth = parseInt(getFlag(args, '--depth') || '1', 10);
        if (!name) {
          result = { ok: false, error: 'Usage: browse <entity-name> [--depth N]' };
        } else {
          result = browse(name, depth);
        }
        break;
      }
      case 'add': {
        const { add } = await import('./commands/add.js');
        const addText = args.filter(a => a !== '--dry-run').slice(1).join(' ');
        if (!addText) {
          result = { ok: false, error: 'Usage: add <text> [--dry-run]' };
        } else {
          result = await add(addText, dryRun);
        }
        break;
      }
      case 'verify': {
        const { verify } = await import('./commands/verify.js');
        const confirmIds = getFlag(args, '--confirm');
        const rejectIds = getFlag(args, '--reject');
        const editId = getFlag(args, '--edit');
        const editText = editId ? args[args.indexOf('--edit') + 2] : undefined;
        const all = args.includes('--all');
        result = verify({ confirmIds, rejectIds, editId, editText, all });
        break;
      }
      case 'query': {
        const { query } = await import('./commands/query.js');
        const question = args.slice(1).join(' ');
        if (!question) {
          result = { ok: false, error: 'Usage: query <question>' };
        } else {
          result = await query(question);
        }
        break;
      }
      case 'export': {
        const { exportKg } = await import('./commands/export.js');
        const format = getFlag(args, '--format') || 'md';
        const tags = getFlag(args, '--tags');
        result = exportKg(format, tags);
        break;
      }
      case 'ingest': {
        const { ingest } = await import('./commands/ingest.js');
        const ingestType = getFlag(args, '--type') as 'lcm_message' | 'lcm_summary' | undefined;
        const flagsToStrip = new Set(['--type', '--dry-run']);
        const ingestText = args.filter((a, i) => !flagsToStrip.has(a) && !flagsToStrip.has(args[i - 1]) && i > 0).join(' ');
        if (!ingestText || !ingestType) {
          result = { ok: false, error: 'Usage: ingest --type <lcm_message|lcm_summary> <text>' };
        } else if (ingestType !== 'lcm_message' && ingestType !== 'lcm_summary') {
          result = { ok: false, error: 'Type must be lcm_message or lcm_summary' };
        } else {
          result = await ingest(ingestText, ingestType);
        }
        break;
      }
      case 'merge': {
        const { merge } = await import('./commands/merge.js');
        const mergeNames = args.slice(1);
        if (mergeNames.length < 2) {
          result = { ok: false, error: 'Usage: merge <canonical-name> <name2> [name3 ...]' };
        } else {
          result = merge(mergeNames);
        }
        break;
      }
      case 'watch': {
        const { watchDir } = await import('./commands/watch.js');
        const watchPath = getFlag(args, '--dir') || args[1];
        const watchType = (getFlag(args, '--type') || 'lcm_message') as 'lcm_message' | 'lcm_summary';
        if (!watchPath) {
          result = { ok: false, error: 'Usage: watch <dir> [--type lcm_message|lcm_summary]' };
        } else {
          result = await watchDir(watchPath, watchType);
        }
        break;
      }
      case 'onboard': {
        if (args.includes('--interactive')) {
          const { onboardInteractive } = await import('./commands/onboard.js');
          result = await onboardInteractive() as CommandResult;
          break;
        }
        const { onboard } = await import('./commands/onboard.js');
        const userMessage = args.filter(a => a !== '--interactive').slice(1).join(' ');
        result = await onboard(userMessage);
        break;
      }
      default:
        result = { ok: false, error: `Unknown command: ${command}` };
    }
  } catch (e: any) {
    result = { ok: false, error: e.message };
  }

  console.log(JSON.stringify(result, null, 2));
  closeDb();
}

function getFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

main().catch(e => {
  console.log(JSON.stringify({ ok: false, error: e.message }));
  process.exit(1);
});
