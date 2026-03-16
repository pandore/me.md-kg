/**
 * Core types for me.md-kg knowledge graph
 */

// Entity types that can exist in the graph
export type EntityType =
  | 'person'
  | 'organization'
  | 'place'
  | 'concept'
  | 'service'
  | 'product'
  | 'event'
  | 'skill'
  | 'value'
  | 'trait'
  | 'preference'
  | 'doctor'
  | 'contact';

export const VALID_ENTITY_TYPES: ReadonlySet<string> = new Set<EntityType>([
  'person', 'organization', 'place', 'concept', 'service',
  'product', 'event', 'skill', 'value', 'trait', 'preference',
  'doctor', 'contact',
]);

// Core entity record
export interface Entity {
  id: string;
  name: string;
  types: EntityType[];
  summary?: string;
  properties?: Record<string, unknown>;
  access_tags: string[];
  embedding?: number[];
  created_at: string;
  updated_at: string;
}

// Relation between two entities with temporal validity
export interface Relation {
  id: string;
  source: string; // entity record ID
  target: string; // entity record ID
  type: string;
  summary?: string;
  properties?: Record<string, unknown>;

  // Temporal validity (Graphiti pattern)
  valid_from?: string;
  valid_until?: string; // null = currently valid

  // Verification
  verified: boolean;
  confidence: number; // 0-1
  verified_at?: string;
  verified_by?: 'user' | 'auto';

  // Provenance
  provenance: string;

  // Access control
  access_tags: string[];

  embedding?: number[];
  created_at: string;
}

// Episode — provenance record
export interface Episode {
  id: string;
  relation: string; // relation record ID
  source_type: 'lcm_message' | 'lcm_summary' | 'manual' | 'memory_md' | 'user_md' | 'interview' | 'import' | 'assessment';
  source_ref?: string;
  content?: string;
  created_at: string;
}

// Assessment result
export interface Assessment {
  id: string;
  type: 'big_five' | 'pvq_40' | 'pvq_21' | 'culture_map' | 'culture_map_short';
  version: string;
  completed_at: string;
  raw_scores: Record<string, number>;
  centered_scores?: Record<string, number>;
  labels?: Record<string, string>;
  validity?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  created_at: string;
}

// Extracted fact triple from LLM
export interface ExtractedFact {
  source_entity: { name: string; type: EntityType };
  relation_type: string;
  target_entity: { name: string; type: EntityType };
  summary: string;
  confidence: number;
  valid_from?: string;
  valid_until?: string;
}

// Query result for kg_browse
export interface BrowseResult {
  entity: Entity;
  relations: Array<{
    direction: 'outgoing' | 'incoming';
    type: string;
    related_entity: Entity;
    relation: Relation;
  }>;
}

// Query result for kg_query
export interface QueryResult {
  entities: Entity[];
  relations: Relation[];
  answer?: string; // LLM-generated natural language answer
}

// Verification batch item
export interface VerificationItem {
  relation: Relation;
  source_entity: Entity;
  target_entity: Entity;
  episode?: Episode;
}
