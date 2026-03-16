# BLS Training Scenario MCP App

## Project overview
Interactive BLS (Basic Life Support) code-simulation MCP App. An LLM host drives the scenario via 10 MCP tools; the server manages a deterministic BLS state machine, quality metrics, persistent storage, and an HTML dashboard rendered as an MCP resource.

Supports three platforms:
- **Claude Desktop** — local stdio transport
- **Claude.ai** — remote MCP via custom connector
- **ChatGPT** — remote MCP via App Directory

## Architecture
- **Runtime**: Node 18+, TypeScript, ES modules (`"type": "module"`)
- **MCP SDK**: `@modelcontextprotocol/sdk` — tool params are **Zod schemas**, not raw JSON Schema
- **State machine**: `src/state/bls-algorithm.ts` — step transitions, valid-action map (Path A: cardiac arrest, Path B: respiratory arrest)
- **Quality metrics**: `src/state/quality-metrics.ts` — compression fraction, TTFC, pause tracking
- **Persistence (local)**: `src/storage/persistence.ts` — file-based JSON in `data/`, atomic writes
- **Persistence (Worker)**: `worker/storage.ts` — Durable Object SQLite
- **Dashboard**: `ui/dashboard.html` — single-file HTML/CSS/JS, postMessage bridge to MCP host
- **Worker**: `worker/index.ts` — Cloudflare Workers entry with McpAgent Durable Object
- **Tool registration**: `src/register-tools.ts` — shared by both entry points

## Key commands
| Command | Purpose |
|---------|---------|
| `npm run build` | Compile TypeScript → `dist/` |
| `npm run dev` | Watch mode |
| `npm start` | Run MCP server (stdio) |
| `npm test` | Run vitest suite |
| `npx wrangler dev` | Run Worker locally |
| `npx wrangler deploy` | Deploy to Cloudflare |

## MCP tools (10)
1. `start_scenario` — Create new BLS scenario
2. `submit_action` — Advance state machine
3. `get_scenario_state` — Read current scenario state
4. `update_patient_state` — Modify vitals mid-scenario
5. `end_scenario` — Conclude and persist scenario + debrief
6. `search_scenarios` — Query stored scenarios with filters
7. `compare_scenarios` — Side-by-side metric comparison
8. `get_student_progress` — Longitudinal student analytics
9. `generate_case` — Structured case-generation constraints
10. `add_instructor_note` — Annotate stored scenarios

All tools include ChatGPT-compliant annotations (readOnlyHint, destructiveHint, openWorldHint, title).

## BLS Algorithm Paths
- **Path A** (Cardiac Arrest): scene safety → responsiveness → EMS → pulse check → CPR → AED → shock/no-shock loop
- **Path B** (Respiratory Arrest): scene safety → responsiveness → EMS → pulse check (pulse present, no breathing) → rescue breathing → reassess q2min → ROSC or deteriorate to Path A
- **Opioid Overdose**: Path B + `administer_naloxone` action

## File layout
```
src/
  index.ts              — stdio entry point (local Claude Desktop)
  register-tools.ts     — Shared tool registration (both transports)
  types.ts              — All shared interfaces + StorageAdapter
  state/
    scenario-state.ts   — In-memory scenario state management
    bls-algorithm.ts    — BLS step transitions & valid actions
    quality-metrics.ts  — CPR quality calculations
  storage/
    persistence.ts      — StorageManager (file-based JSON, local)
  tools/
    start-scenario.ts
    submit-action.ts
    get-state.ts
    update-patient.ts
    end-scenario.ts
    search-scenarios.ts
    compare-scenarios.ts
    get-student-progress.ts
    generate-case.ts
    add-instructor-note.ts
  __tests__/            — Vitest tests
worker/
  index.ts              — Cloudflare Worker entry (McpAgent)
  storage.ts            — DurableStorageManager (SQLite)
  pages/
    index.html          — Landing page
    privacy.html        — Privacy policy
ui/
  dashboard.html        — Single-file interactive dashboard
docs/
  claude-connector-setup.md
  claude-desktop-setup.md
  chatgpt-setup.md
  chatgpt-test-cases.md
  chatgpt-submission.md
data/                   — Runtime JSON storage (gitignored)
```

## Conventions
- All imports use `.js` extensions (ES module resolution)
- Tool files use `StorageAdapter` interface from types.ts (not concrete class)
- Tool files export a `set*StorageManager()` setter for dependency injection
- Tool handlers return `{ content: [{ type: "text", text: JSON.stringify(...) }] }`
- Dashboard communicates with host via `window.parent.postMessage()`
- Tests use temp directories (`mkdtemp`) cleaned up in `afterEach`

## Testing
- Framework: vitest 4.x
- Pattern: each test file creates a temp dir, instantiates StorageManager, injects via setter
- Run: `npm test` — expects all tests to pass
- Tests cover: BLS algorithm (Path A + Path B), storage, search, compare, progress, generate case, tool registration, integration scenarios

## Decision Log
- 2026-03-16: Sprint 3 — Deployed to Cloudflare Workers for cross-platform
  access. Added respiratory arrest path (Path B) to state machine. Added
  naloxone action. Fixed UI resource registration. Added ChatGPT tool
  annotations. Created App Directory submission materials.
  Platforms: Claude.ai (custom connector), Claude Desktop (stdio or remote),
  ChatGPT (App Directory submission pending).
