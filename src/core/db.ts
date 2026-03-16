/**
 * better-sqlite3 connection manager for me.md-kg
 *
 * The database file lives at ~/.memd/kg.db by default.
 * Override with MEMD_DB_PATH env var (legacy: SURREAL_DB_PATH).
 */

import Database from 'better-sqlite3';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db: Database.Database | null = null;

const SCHEMA_VERSION = 2;

export function getDb(): Database.Database {
  if (db) return db;

  let dbPath: string;
  if (process.env.MEMD_DB_PATH) {
    dbPath = process.env.MEMD_DB_PATH;
  } else if (process.env.SURREAL_DB_PATH) {
    console.error('[me.md-kg] SURREAL_DB_PATH is deprecated, use MEMD_DB_PATH instead');
    dbPath = process.env.SURREAL_DB_PATH;
  } else {
    dbPath = resolve(process.env.HOME || '~', '.memd', 'kg.db');
  }

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

  if (currentVersion < 1) {
    // Fresh install — apply full schema
    const schemaPath = resolve(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    conn.exec(schema);
    conn.prepare('INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)').run('schema_version', String(SCHEMA_VERSION));
  } else if (currentVersion < 2) {
    // Migrate v1 → v2: entity.type (TEXT) → entity.types (JSON array)
    conn.exec('BEGIN TRANSACTION');
    try {
      conn.exec(`
        CREATE TABLE entity_new (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          types TEXT NOT NULL DEFAULT '["concept"]',
          summary TEXT,
          properties TEXT,
          access_tags TEXT NOT NULL DEFAULT '["all"]',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO entity_new (id, name, types, summary, properties, access_tags, created_at, updated_at)
          SELECT id, name, '["' || type || '"]', summary, properties, access_tags, created_at, updated_at FROM entity;
        DROP TABLE entity;
        ALTER TABLE entity_new RENAME TO entity;
        CREATE INDEX IF NOT EXISTS idx_entity_name ON entity(name);
        CREATE TABLE IF NOT EXISTS entity_alias (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
          entity_id TEXT NOT NULL REFERENCES entity(id) ON DELETE CASCADE,
          alias TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_entity_alias_entity ON entity_alias(entity_id);
        CREATE INDEX IF NOT EXISTS idx_entity_alias_name ON entity_alias(alias);
      `);
      conn.prepare('INSERT OR REPLACE INTO _meta (key, value) VALUES (?, ?)').run('schema_version', '2');
      conn.exec('COMMIT');
    } catch (e) {
      conn.exec('ROLLBACK');
      throw e;
    }
  }
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
