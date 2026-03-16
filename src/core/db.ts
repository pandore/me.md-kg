/**
 * better-sqlite3 connection manager for me.md-kg
 *
 * The database file lives at ~/.memd/kg.db by default.
 * Override with SURREAL_DB_PATH env var.
 */

import Database from 'better-sqlite3';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db: Database.Database | null = null;

const SCHEMA_VERSION = 1;

export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = process.env.SURREAL_DB_PATH
    || resolve(process.env.HOME || '~', '.memd', 'kg.db');

  // Ensure directory exists
  mkdirSync(dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  return db;
}

export function initSchema(): void {
  const conn = getDb();

  // Check schema version
  conn.exec(`CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value TEXT)`);
  const row = conn.prepare('SELECT value FROM _meta WHERE key = ?').get('schema_version') as { value: string } | undefined;
  const currentVersion = row ? parseInt(row.value, 10) : 0;

  if (currentVersion < SCHEMA_VERSION) {
    const schemaPath = resolve(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    conn.exec(schema);
    conn.prepare('INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)').run('schema_version', String(SCHEMA_VERSION));
  }
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
