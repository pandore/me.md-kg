-- me.md-kg SQLite Schema
-- Personal Knowledge Graph with temporal validity, verification, and access control

CREATE TABLE IF NOT EXISTS entity (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  name TEXT NOT NULL,
  types TEXT NOT NULL DEFAULT '["concept"]', -- JSON array of entity types
  summary TEXT,
  properties TEXT, -- JSON object
  access_tags TEXT NOT NULL DEFAULT '["all"]', -- JSON array
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_entity_name ON entity(name);

CREATE TABLE IF NOT EXISTS relation (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  source_id TEXT NOT NULL REFERENCES entity(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES entity(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  summary TEXT,
  properties TEXT, -- JSON object

  -- Temporal validity
  valid_from TEXT,
  valid_until TEXT, -- NULL = currently valid

  -- Verification
  verified INTEGER NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 0.5,
  verified_at TEXT,
  verified_by TEXT, -- 'user' or 'auto'

  -- Provenance
  provenance TEXT NOT NULL DEFAULT 'unknown',

  -- Access control
  access_tags TEXT NOT NULL DEFAULT '["all"]', -- JSON array

  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_relation_type ON relation(type);
CREATE INDEX IF NOT EXISTS idx_relation_source ON relation(source_id);
CREATE INDEX IF NOT EXISTS idx_relation_target ON relation(target_id);
CREATE INDEX IF NOT EXISTS idx_relation_verified ON relation(verified);

CREATE TABLE IF NOT EXISTS episode (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  relation_id TEXT NOT NULL REFERENCES relation(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK(source_type IN (
    'lcm_message', 'lcm_summary', 'manual', 'memory_md', 'user_md',
    'interview', 'import', 'assessment'
  )),
  source_ref TEXT,
  content TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_episode_relation ON episode(relation_id);
CREATE INDEX IF NOT EXISTS idx_episode_type ON episode(source_type);

CREATE TABLE IF NOT EXISTS assessment (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  type TEXT NOT NULL CHECK(type IN (
    'big_five', 'pvq_40', 'pvq_21', 'culture_map', 'culture_map_short'
  )),
  version TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  raw_scores TEXT NOT NULL, -- JSON object
  centered_scores TEXT, -- JSON object
  labels TEXT, -- JSON object
  validity TEXT, -- JSON object
  metadata TEXT, -- JSON object
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_assessment_type ON assessment(type);

CREATE TABLE IF NOT EXISTS entity_alias (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  entity_id TEXT NOT NULL REFERENCES entity(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_entity_alias_entity ON entity_alias(entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_alias_name ON entity_alias(alias);
