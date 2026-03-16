# BLS Training Scenario MCP App

## Project overview
Interactive BLS (Basic Life Support) code-simulation MCP App. An LLM host drives the scenario via 10 MCP tools; the server manages a deterministic BLS state machine, quality metrics, persistent storage, and an HTML dashboard rendered as an MCP resource.

## Architecture
- **Runtime**: Node 18+, TypeScript, ES modules (`"type": "module"`)
- **MCP SDK**: `@modelcontextprotocol/sdk` — tool params are **Zod schemas**, not raw JSON Schema
- **State machine**: `src/state/bls-algorithm.ts` — step transitions, valid-action map
- **Quality metrics**: `src/state/quality-metrics.ts` — compression fraction, TTFC, pause tracking
- **Persistence**: `src/storage/persistence.ts` — file-based JSON in `data/`, atomic writes (tmp + rename)
- **Dashboard**: `ui/dashboard.html` — single-file HTML/CSS/JS, postMessage bridge to MCP host

## Key commands
| Command | Purpose |
|---------|---------|
| `npm run build` | Compile TypeScript → `dist/` |
| `npm run dev` | Watch mode |
| `npm start` | Run MCP server |
| `npm test` | Run vitest suite |

## MCP tools (10)
1. `start_scenario` — Create new BLS scenario
2. `submit_action` — Advance state machine
3. `get_state` — Read current scenario state
4. `update_patient` — Modify vitals mid-scenario
5. `end_scenario` — Conclude and persist scenario + debrief
6. `search_scenarios` — Query stored scenarios with filters
7. `compare_scenarios` — Side-by-side metric comparison
8. `get_student_progress` — Longitudinal student analytics
9. `generate_case` — Structured case-generation constraints
10. `add_instructor_note` — Annotate stored scenarios

## File layout
```
src/
  index.ts              — MCP server entry, tool registration
  types.ts              — All shared TypeScript interfaces
  state/
    scenario-state.ts   — In-memory scenario state management
    bls-algorithm.ts    — BLS step transitions & valid actions
    quality-metrics.ts  — CPR quality calculations
  storage/
    persistence.ts      — StorageManager (file-based JSON)
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
  __tests__/            — Vitest tests (43 tests across 6 files)
ui/
  dashboard.html        — Single-file interactive dashboard
data/                   — Runtime JSON storage (gitignored)
```

## Conventions
- All imports use `.js` extensions (ES module resolution)
- Tool files export a `set*StorageManager()` setter for dependency injection
- Tool handlers return `{ content: [{ type: "text", text: JSON.stringify(...) }] }`
- Dashboard communicates with host via `window.parent.postMessage()`
- Tests use temp directories (`mkdtemp`) cleaned up in `afterEach`

## Testing
- Framework: vitest 4.x
- Pattern: each test file creates a temp dir, instantiates StorageManager, injects via setter
- Run: `npm test` — expects all 43 tests to pass
