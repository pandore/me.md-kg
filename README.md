# me.md-kg

Personal knowledge graph that stores verified facts about you as entity-relation triples. Designed as a standalone CLI tool that AI agents (like [OpenClaw](https://openclaw.dev)) invoke to read, write, and query your personal context.

```
You → works_at → Podavach (e-commerce)
You → lives_in → Lisbon (since 2023)
You → values  → Autonomy over stability
You → knows   → Patricia (osteopath)
```

## Why

AI tools are better when they know who you are. But passive memory systems (ChatGPT memory, Claude projects) achieve only 53-67% accuracy. me.md-kg takes a different approach:

1. **Extract** facts from conversations, documents, and interviews
2. **Verify** every fact with the human before trusting it
3. **Store** as a structured graph with temporal validity and provenance
4. **Export** as portable context (CLAUDE.md, me.md, JSON) for any AI tool

The result: verified personal context that makes any AI write, decide, and act like you.

## Quick Start

```bash
# Prerequisites: Node.js 22+
git clone https://github.com/oleksiinikitin/me.md-kg.git
cd me.md-kg
npm install

# Optional: set API key for AI-powered extraction + interviews
export ANTHROPIC_API_KEY=sk-ant-...

# Seed from existing workspace data
npm run cli seed -- --workspace ~/path/to/workspace

# Check what's in the graph
npm run cli stats
npm run cli browse "Your Name"

# Add facts manually or from text
npm run cli add "My doctor is Patricia, osteopath, +351 964 960 916"

# Verify extracted facts
npm run cli verify

# Export for use in other AI tools
npm run cli export -- --format claude
npm run cli export -- --format md
npm run cli export -- --format json

# Run guided onboarding interview
npm run cli onboard
```

## Commands

| Command | Description |
|---------|-------------|
| `seed --workspace <path>` | Parse MEMORY.md, USER.md, and markdown files into the graph |
| `stats` | Show entity/relation/episode counts by type |
| `browse <name> [--depth N]` | Explore an entity's neighborhood (N-hop traversal) |
| `add <text>` | Extract facts from text and insert into the graph |
| `verify` | Review unverified facts (confirm, reject, or edit) |
| `verify --confirm <ids>` | Confirm specific facts by ID |
| `verify --reject <ids>` | Reject specific facts by ID |
| `verify --edit <id> "text"` | Edit and verify a fact |
| `query <question>` | Natural language search across the graph |
| `export --format <md\|claude\|json>` | Export verified knowledge |
| `export --tags <tag1,tag2>` | Filter export by access tags |
| `onboard` | Guided multi-turn interview to build initial graph |
| `onboard --reset` | Reset onboarding progress |

Every command outputs `{ ok: boolean, data?: any, error?: string }` as JSON to stdout. Logs go to stderr.

## Architecture

```
CLI (src/cli.ts)
  |
  ├── Commands (src/commands/)
  │   ├── seed    — Parse markdown → entities + relations
  │   ├── stats   — Graph statistics
  │   ├── browse  — N-hop graph traversal
  │   ├── add     — AI fact extraction → insert
  │   ├── verify  — Human verification loop
  │   ├── query   — NL search + AI summary
  │   ├── export  — Markdown / CLAUDE.md / JSON
  │   └── onboard — Guided interview flow
  │
  ├── Core (src/core/)
  │   ├── db.ts         — SQLite connection (better-sqlite3, WAL mode)
  │   ├── schema.sql    — Entity, relation, episode, assessment tables
  │   ├── entity-ops.ts — CRUD for entities, relations, episodes
  │   ├── types.ts      — TypeScript interfaces
  │   ├── verification.ts — Confirm/reject/edit with provenance
  │   └── reverify.ts   — Re-verification scheduling
  │
  ├── Extraction (src/extraction/)
  │   ├── anthropic.ts  — Thin HTTP client (no SDK)
  │   ├── extract.ts    — AI pipeline + rule-based fallback
  │   ├── chunk.ts      — Content chunking
  │   ├── prompt.ts     — Triple extraction prompts
  │   └── dedup.ts      — Entity/relation deduplication
  │
  ├── Export (src/export/)
  │   ├── markdown.ts   — me.md format
  │   ├── claude-md.ts  — CLAUDE.md user context
  │   └── json.ts       — Full JSON dump
  │
  └── Onboarding (src/onboarding/)
      ├── methodologies.ts — Clean Language, Socratic, Five Whys, etc.
      ├── interview-map.ts — Journey, Principles, Frameworks, Examples, Tensions
      └── prompts.ts       — Dynamic system prompt builder
```

## Data Model

**Entities** — people, organizations, places, concepts, services, skills, values, etc.

**Relations** — typed edges between entities with:
- Temporal validity (`valid_from` / `valid_until`)
- Verification status and confidence score (0-1)
- Provenance tracking (where did this fact come from?)
- Access control tags (which agents can see this fact?)

**Episodes** — provenance records linking each relation to its source material.

All stored in SQLite at `~/.memd/kg.db`. No external database server needed.

## Access Control

Each fact has access tags controlling visibility:

- `all` — visible to all agents
- `main` — only the primary agent (personal/sensitive data)
- `workspace-name` — visible to agents in that workspace

Use `--tags` on export to filter: `npm run cli export -- --format claude --tags podavach-shopify`

## Verification Flow

Facts are extracted with a confidence score but marked **unverified**. The verification loop:

1. Run `verify` to see a batch of unverified facts
2. Confirm (`--confirm`), reject (`--reject`), or edit (`--edit`)
3. Verified facts get re-verification schedules based on type:
   - **Situational** (currently, right now) → re-verify in 2 weeks
   - **Preferences** (prefer, enjoy, style) → 3 months
   - **Core traits** (always, never, values) → 6 months
   - **Default** → 1 month

## OpenClaw Integration

me.md-kg is designed as an OpenClaw skill. To install on your agent:

```bash
# On the agent's server
git clone <repo> ~/me.md-kg && cd ~/me.md-kg && npm install

# Link as a skill
mkdir -p ~/.openclaw/workspace/skills
ln -s ~/me.md-kg/src/skill ~/.openclaw/workspace/skills/me.md-kg

# Seed from workspace
tsx src/cli.ts seed --workspace ~/.openclaw/workspace
```

The agent invokes commands via `tsx ~/me.md-kg/src/cli.ts <command>` and parses the JSON output.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | For AI features | Anthropic API key (Claude Sonnet) |
| `SURREAL_DB_PATH` | No | Override database path (default: `~/.memd/kg.db`) |
| `OPENCLAW_WORKSPACE` | No | Default workspace for seed command |

## Development

```bash
npm run cli stats          # Run any command
npm run build              # Compile TypeScript
npm test                   # Run tests (vitest)
```

## Related

- [me.md (me.me-oss)](https://github.com/oleksiinikitin/me.me-oss) — Browser-based personal knowledge system (the predecessor)
- [OpenClaw](https://openclaw.dev) — AI agent platform

## License

MIT
