import { watch as fsWatch, existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { extractFacts, insertFacts } from '../extraction/extract.js';

interface WatchState {
  processedFiles: Map<string, number>; // filepath → last processed mtime
  running: boolean;
}

/**
 * Watch a directory for new/modified .md and .txt files, auto-ingest them.
 * Also processes existing files on startup.
 */
export async function watchDir(dirPath: string, sourceType: 'lcm_message' | 'lcm_summary' = 'lcm_message') {
  if (!existsSync(dirPath)) {
    return { ok: false as const, error: `Directory not found: ${dirPath}` };
  }

  const state: WatchState = {
    processedFiles: new Map(),
    running: true,
  };

  console.error(`[watch] Watching ${dirPath} for .md/.txt files (source: ${sourceType})`);

  // Process existing files first
  const initialCount = await processExisting(dirPath, sourceType, state);
  console.error(`[watch] Initial scan: processed ${initialCount} files`);

  // Start watching
  const watcher = fsWatch(dirPath, { recursive: true }, async (eventType, filename) => {
    if (!filename || !state.running) return;
    const ext = extname(filename);
    if (ext !== '.md' && ext !== '.txt') return;

    const filePath = join(dirPath, filename);
    if (!existsSync(filePath)) return;

    try {
      const mtime = statSync(filePath).mtimeMs;
      const lastProcessed = state.processedFiles.get(filePath) || 0;
      if (mtime <= lastProcessed) return;

      await processFile(filePath, sourceType, state);
    } catch (e: any) {
      console.error(`[watch] Error processing ${filename}: ${e.message}`);
    }
  });

  // Keep running until interrupted
  return new Promise<{ ok: true; data: { message: string } }>((resolve) => {
    const cleanup = () => {
      state.running = false;
      watcher.close();
      resolve({
        ok: true as const,
        data: {
          message: `Watch stopped. Processed ${state.processedFiles.size} files total.`,
        },
      });
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  });
}

async function processExisting(dirPath: string, sourceType: string, state: WatchState): Promise<number> {
  let count = 0;
  const files = readdirSync(dirPath, { recursive: true }) as string[];

  for (const file of files) {
    const ext = extname(String(file));
    if (ext !== '.md' && ext !== '.txt') continue;

    const filePath = join(dirPath, String(file));
    try {
      await processFile(filePath, sourceType as any, state);
      count++;
    } catch (e: any) {
      console.error(`[watch] Error processing ${file}: ${e.message}`);
    }
  }

  return count;
}

async function processFile(filePath: string, sourceType: 'lcm_message' | 'lcm_summary', state: WatchState): Promise<void> {
  const content = readFileSync(filePath, 'utf-8').trim();
  if (!content || content.length < 20) return;

  const mtime = statSync(filePath).mtimeMs;

  console.error(`[watch] Processing: ${filePath}`);
  const facts = await extractFacts(content);
  if (facts.length > 0) {
    const { inserted, deduplicated } = insertFacts(facts, `watch:${filePath}`, sourceType);
    console.error(`[watch] ${filePath}: ${inserted} inserted, ${deduplicated} deduped`);
  }

  state.processedFiles.set(filePath, mtime);
}
