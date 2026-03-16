// ============================================================================
// BLS Scenario MCP Server — Cloudflare Worker Entry Point
// ============================================================================

import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "../src/register-tools.js";
import { setStorageManager } from "../src/tools/end-scenario.js";
import { setSearchStorageManager } from "../src/tools/search-scenarios.js";
import { setProgressStorageManager } from "../src/tools/get-student-progress.js";
import { setCompareStorageManager } from "../src/tools/compare-scenarios.js";
import { setGenerateCaseStorageManager } from "../src/tools/generate-case.js";
import { setNoteStorageManager } from "../src/tools/add-instructor-note.js";
import { DurableStorageManager } from "./storage.js";
import DASHBOARD_HTML from "../ui/dashboard.html";
import LANDING_HTML from "./pages/index.html";
import PRIVACY_HTML from "./pages/privacy.html";

interface Env {
  BLS_SCENARIO: DurableObjectNamespace;
  OPENAI_VERIFICATION_TOKEN?: string;
}

// ── Durable Object: BLS Scenario Agent ────────────────────────────────────

export class BLSScenarioAgent extends McpAgent<Env, {}, {}> {
  server = new McpServer({
    name: "bls-scenario",
    version: "1.0.0",
  });

  async init() {
    // Initialize SQLite tables for persistence
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS scenarios (
        case_id TEXT PRIMARY KEY,
        student_id TEXT,
        date TEXT NOT NULL,
        outcome TEXT,
        grade TEXT,
        scenario_type TEXT,
        duration_sec INTEGER,
        state_json TEXT NOT NULL,
        debrief_json TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS instructor_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        case_id TEXT NOT NULL,
        note TEXT NOT NULL,
        category TEXT DEFAULT 'general',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    this.ctx.storage.sql.exec(
      `CREATE INDEX IF NOT EXISTS idx_scenarios_student ON scenarios(student_id)`
    );
    this.ctx.storage.sql.exec(
      `CREATE INDEX IF NOT EXISTS idx_scenarios_date ON scenarios(date)`
    );

    // Wire up storage adapter for persistence tools
    const storage = new DurableStorageManager(this.ctx.storage.sql);
    setStorageManager(storage);
    setSearchStorageManager(storage);
    setProgressStorageManager(storage);
    setCompareStorageManager(storage);
    setGenerateCaseStorageManager(storage);
    setNoteStorageManager(storage);

    // Register all tools and the dashboard resource
    registerTools(this.server, () => DASHBOARD_HTML);
  }
}

// ── Worker fetch handler ──────────────────────────────────────────────────

const mcpHandler = BLSScenarioAgent.serve("/mcp");

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Static routes
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return new Response(LANDING_HTML, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    if (url.pathname === "/privacy" || url.pathname === "/privacy.html") {
      return new Response(PRIVACY_HTML, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    if (url.pathname === "/ui/dashboard" || url.pathname === "/ui/dashboard.html") {
      return new Response(DASHBOARD_HTML, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    if (url.pathname === "/.well-known/openai-apps-challenge") {
      const token = env.OPENAI_VERIFICATION_TOKEN ?? "TOKEN_NOT_SET";
      return new Response(token, {
        headers: { "content-type": "text/plain" },
      });
    }

    // MCP endpoint — delegate to McpAgent
    if (url.pathname.startsWith("/mcp")) {
      return mcpHandler.fetch(request, env, ctx);
    }

    return new Response("Not Found", { status: 404 });
  },
};
