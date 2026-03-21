# Telegram Mini App — Implementation Plan

## Phase 1: HTTP Server + API Routes (P0)

### Step 1: Add `hono` dependency
- `npm install hono @hono/node-server`
- Hono is ~14KB, zero-dep, perfect for this use case

### Step 2: Create `src/server.ts`
- HTTP server using Hono + `@hono/node-server`
- Serve static files from `app/` directory
- Implement Telegram `initData` HMAC validation middleware
- API routes:

```
POST /api/onboard/start   → init session, return first question
POST /api/onboard/answer   → submit answer, get next question
GET  /api/onboard/status   → current progress
POST /api/onboard/reset    → restart onboarding
GET  /api/onboard/summary  → final summary after completion
```

**Integration approach**: Import the onboard command functions directly from `src/commands/onboard.ts` rather than spawning subprocesses. The existing onboard module already has:
- `loadOnboardState()` / `saveOnboardState()` for persistence
- `processOnboardAnswer()` for the core Q&A loop
- `getOnboardStatus()` for progress
- `resetOnboardState()` for reset
- Language detection, adaptive depth, suggested answers

We'll need to refactor the onboard command slightly to support:
- Session ID parameter (for multi-user via Telegram user ID)
- Language override from Telegram locale
- Returning structured data instead of CLI JSON output

### Step 3: Create `src/commands/serve.ts`
- New CLI command handler for `memd serve`
- Flags: `--bot-token`, `--port` (default 3847), `--tunnel`
- Starts the HTTP server
- If `--bot-token` provided: register WebApp menu button via Telegram Bot API (POST to `https://api.telegram.org/bot<token>/setChatMenuButton`)

### Step 4: Register `serve` command in `src/cli.ts`
- Add case for `'serve'` in the command dispatcher
- Parse `--bot-token`, `--port`, `--tunnel` flags

## Phase 2: Mini App UI (P0)

### Step 5: Create `app/index.html`
- Single HTML file with embedded CSS and JS (no build step)
- Mobile-first, optimized for Telegram WebView
- Uses `Telegram.WebApp` JS SDK (loaded from `https://telegram.org/js/telegram-web-app.js`)
- Theme integration via `Telegram.WebApp.themeParams`

**Screens (all in single page, JS-toggled):**

1. **Welcome** — Brief intro + language auto-detect from `Telegram.WebApp.initDataUnsafe.user.language_code` + [Start] button
2. **Question** — Progress bar + question text + option buttons + free text input + [Skip] button
3. **Area Transition** — Brief card showing completed area + facts count
4. **Summary** — Facts grouped by area + total stats + [Close] button

**Design tokens:**
- Colors from `Telegram.WebApp.themeParams` (bg_color, text_color, button_color, etc.)
- Min touch target 48px
- No scroll on question screen
- CSS transitions for screen changes

**API communication:**
- `fetch()` to localhost API
- Send `Telegram.WebApp.initData` in `Authorization` header for validation
- Handle loading states, errors gracefully

## Phase 3: Telegram initData Validation (P0)

### Step 6: Implement HMAC validation in `src/server.ts`
- Parse `initData` query string
- Extract `hash` parameter
- Compute HMAC-SHA256 of sorted data-check-string using `HMAC_SHA256(HMAC_SHA256("WebAppData", bot_token), data_check_string)`
- Compare computed hash with provided hash
- Reject requests with invalid/missing initData (except in dev mode)

## Phase 4: Onboard Engine Adaptations

### Step 7: Refactor `src/commands/onboard.ts` for multi-session support
- Current state file: `~/.memd/onboard-state.json` (single user)
- Add session-aware state: `~/.memd/onboard-state-{telegramUserId}.json`
- Extract core logic into reusable functions that accept sessionId parameter
- Keep backward compatibility for CLI (no sessionId = default file)

### Step 8: Add language override support
- Accept explicit language parameter from Telegram locale
- Pass to prompt builder instead of auto-detecting from first answer
- Ensure suggested answer options respect language

### Step 9: Enhance suggested answers for button display
- Current: returns `string[]` of suggested answers
- Add: return structured `{ text: string, id: string }[]` for button rendering
- Generate 2-4 contextual options per question via LLM prompt tweak

## Phase 5: Polish & P1 Features

### Step 10: Adaptive depth follow-ups
- Track answer quality (word count) in session state
- Short answer (<20 words) → generate follow-up question
- Max 3 follow-ups per area, then auto-advance
- Return `followUp: boolean` flag in API response

### Step 11: Summary endpoint
- `GET /api/onboard/summary` queries the graph for:
  - Total facts count (by area, using provenance tracking)
  - Entity/relation counts
  - Highlight facts (high-confidence, key relation types)
- Group by the 7 onboarding areas

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `package.json` | Edit | Add `hono`, `@hono/node-server` deps; add `serve` script |
| `src/server.ts` | Create | HTTP server, API routes, initData validation |
| `src/commands/serve.ts` | Create | CLI command handler for `memd serve` |
| `src/cli.ts` | Edit | Register `serve` command |
| `src/commands/onboard.ts` | Edit | Refactor for multi-session, language override, structured options |
| `app/index.html` | Create | Single-file Mini App (HTML + CSS + JS) |

## Implementation Order

1. `npm install hono @hono/node-server`
2. `src/server.ts` — server + API routes + initData validation
3. `src/commands/serve.ts` — CLI command
4. `src/cli.ts` — register serve command
5. `src/commands/onboard.ts` — refactor for API use
6. `app/index.html` — Mini App UI
7. Test end-to-end locally
