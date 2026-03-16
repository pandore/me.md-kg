# Contributing to me.md-kg

Thanks for your interest in contributing! This project is in early development, and contributions are welcome.

## Getting Started

```bash
git clone https://github.com/oleksiinikitin/me.md-kg.git
cd me.md-kg
npm install
```

You'll need Node.js 22+ and optionally an `ANTHROPIC_API_KEY` for AI-powered features.

## Development

```bash
# Run commands directly
npm run cli stats
npm run cli browse "Test"

# Type check
npx tsc --noEmit

# Run tests
npm test

# Use a temp database for development
SURREAL_DB_PATH=/tmp/dev-kg.db npm run cli stats
```

## Project Structure

- `src/core/` — Database, schema, entity operations, types
- `src/commands/` — CLI command handlers (one file per command)
- `src/extraction/` — AI fact extraction pipeline
- `src/export/` — Export format generators
- `src/onboarding/` — Interview methodologies and prompts
- `src/seed/` — Markdown parsing and workspace seeding
- `prompts/` — Externalized prompt templates
- `tests/` — Test files (vitest)

## Conventions

- **Output contract**: Every command returns `{ ok: boolean, data?: any, error?: string }` to stdout
- **Logging**: Use `console.error()` for logs (stderr), never stdout
- **Imports**: Use `.js` extensions in all imports (ESM requirement)
- **Types**: Define interfaces in `src/core/types.ts` for shared types
- **No SDK**: Anthropic API uses plain `fetch`, no SDK dependency

## Submitting Changes

1. Fork the repo and create a branch
2. Make your changes
3. Ensure `npx tsc --noEmit` passes
4. Run `npm test` if you added/changed tests
5. Submit a PR with a clear description

## Areas for Contribution

- **Tests** — Test coverage is sparse, especially for extraction and verification
- **Markdown parsing** — The seed parser could handle more formats
- **Export formats** — New export targets (Cursor rules, OpenAI instructions, etc.)
- **Graph traversal** — More sophisticated query patterns
- **Documentation** — Usage examples, tutorials
