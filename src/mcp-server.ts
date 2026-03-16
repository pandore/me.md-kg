#!/usr/bin/env tsx
/**
 * me.md-kg MCP Server — stdio transport
 *
 * Exposes knowledge graph operations as MCP tools for AI agents.
 * Run: tsx src/mcp-server.ts
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { initSchema, closeDb } from './core/db.js';
import { stats } from './commands/stats.js';
import { browse } from './commands/browse.js';
import { query } from './commands/query.js';
import { add } from './commands/add.js';
import { verify } from './commands/verify.js';
import { exportKg } from './commands/export.js';
import { merge } from './commands/merge.js';
import { ingest } from './commands/ingest.js';

// Initialize database
initSchema();

const server = new McpServer({
  name: 'me.md-kg',
  version: '0.2.0',
});

// kg_stats — graph statistics
server.tool('kg_stats', 'Show knowledge graph statistics: entity counts by type, relation counts, verification status', {}, async () => {
  const result = stats();
  return { content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }] };
});

// kg_browse — explore entity neighborhood
server.tool('kg_browse', 'Explore an entity and its relationships (N-hop graph traversal)', {
  name: z.string().describe('Entity name to browse (case-insensitive, partial match supported)'),
  depth: z.number().optional().default(1).describe('Number of hops to traverse (default: 1)'),
}, async ({ name, depth }) => {
  const result = browse(name, depth);
  return { content: [{ type: 'text', text: JSON.stringify(result.ok ? result.data : { error: result.error }, null, 2) }] };
});

// kg_query — natural language search
server.tool('kg_query', 'Search the knowledge graph with a natural language question', {
  question: z.string().describe('Natural language question about the user'),
}, async ({ question }) => {
  const result = await query(question);
  return { content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }] };
});

// kg_add — add facts from text
server.tool('kg_add', 'Extract facts from text and insert into the knowledge graph', {
  text: z.string().describe('Text containing facts to extract (natural language)'),
  dry_run: z.boolean().optional().default(false).describe('If true, show extracted facts without inserting'),
}, async ({ text, dry_run }) => {
  const result = await add(text, dry_run);
  return { content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }] };
});

// kg_verify — review and manage unverified facts
server.tool('kg_verify', 'Review, confirm, reject, or edit unverified facts', {
  confirm: z.string().optional().describe('Comma-separated relation IDs to confirm'),
  reject: z.string().optional().describe('Comma-separated relation IDs to reject'),
  edit_id: z.string().optional().describe('Relation ID to edit'),
  edit_text: z.string().optional().describe('New text for the edited relation'),
  all: z.boolean().optional().default(false).describe('Show all unverified facts'),
}, async ({ confirm, reject, edit_id, edit_text, all }) => {
  const result = verify({ confirmIds: confirm, rejectIds: reject, editId: edit_id, editText: edit_text, all });
  return { content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }] };
});

// kg_export — export verified knowledge
server.tool('kg_export', 'Export verified knowledge in various formats', {
  format: z.enum(['md', 'claude', 'json']).default('md').describe('Export format'),
  tags: z.string().optional().describe('Comma-separated access tags to filter'),
}, async ({ format, tags }) => {
  const result = exportKg(format, tags);
  if (result.ok) {
    return { content: [{ type: 'text', text: typeof result.data.content === 'string' ? result.data.content : JSON.stringify(result.data, null, 2) }] };
  }
  return { content: [{ type: 'text', text: JSON.stringify({ error: result.error }) }] };
});

// kg_merge — merge duplicate entities
server.tool('kg_merge', 'Merge duplicate entities into a canonical one (redirects relations, creates aliases)', {
  canonical: z.string().describe('Name of the canonical entity (kept)'),
  duplicates: z.array(z.string()).describe('Names of duplicate entities to merge'),
}, async ({ canonical, duplicates }) => {
  const result = merge([canonical, ...duplicates]);
  return { content: [{ type: 'text', text: JSON.stringify(result.ok ? result.data : { error: result.error }, null, 2) }] };
});

// kg_ingest — passive ingestion from LCM
server.tool('kg_ingest', 'Ingest text from external sources (LCM messages/summaries) into the graph', {
  text: z.string().describe('Text to ingest'),
  source_type: z.enum(['lcm_message', 'lcm_summary']).describe('Source type'),
}, async ({ text, source_type }) => {
  const result = await ingest(text, source_type);
  return { content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }] };
});

// Start stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(e => {
  console.error(`[mcp-server] Fatal: ${e.message}`);
  closeDb();
  process.exit(1);
});

// Cleanup on exit
process.on('SIGINT', () => { closeDb(); process.exit(0); });
process.on('SIGTERM', () => { closeDb(); process.exit(0); });
