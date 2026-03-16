#!/usr/bin/env node
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
        commands: ['seed', 'stats', 'browse', 'add', 'verify', 'query', 'export', 'onboard'],
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

  let result: CommandResult;

  try {
    switch (command) {
      case 'seed': {
        const { seed } = await import('./seed/seed.js');
        const workspacePath = getFlag(args, '--workspace') || process.env.OPENCLAW_WORKSPACE;
        result = await seed(workspacePath);
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
        const text = args.slice(1).join(' ');
        if (!text) {
          result = { ok: false, error: 'Usage: add <text>' };
        } else {
          result = await add(text);
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
      case 'onboard': {
        const { onboard } = await import('./commands/onboard.js');
        const userMessage = args.slice(1).join(' ');
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
