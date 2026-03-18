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
import { handleStartScenario } from "../src/tools/start-scenario.js";
import { handleSubmitAction } from "../src/tools/submit-action.js";
import { handleGetState } from "../src/tools/get-state.js";
import { handleEndScenario } from "../src/tools/end-scenario.js";
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
    name: "BLS.ai",
    version: "3.0.0",
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

  // Intercept regular HTTP requests for REST API before MCP handling
  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/app/api/")) {
      return this.handleRestApi(request, url);
    }
    return new Response("Not Found", { status: 404 });
  }

  // Handle REST API requests
  async handleRestApi(request: Request, url: URL): Promise<Response> {
    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "content-type": "application/json",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      const path = url.pathname.replace("/app/api", "");

      if (path === "/start" && request.method === "POST") {
        const body = await request.json() as Record<string, unknown>;
        const result = handleStartScenario(body);
        return new Response(result.content[0].text, { headers: cors });
      }

      if (path === "/action" && request.method === "POST") {
        const body = await request.json() as Record<string, unknown>;
        const result = handleSubmitAction(body);
        return new Response(result.content[0].text, { headers: cors });
      }

      if (path === "/state" && request.method === "POST") {
        const body = await request.json() as Record<string, unknown>;
        const result = handleGetState(body);
        return new Response(result.content[0].text, { headers: cors });
      }

      if (path === "/end" && request.method === "POST") {
        const body = await request.json() as Record<string, unknown>;
        const result = handleEndScenario(body);
        return new Response(result.content[0].text, { headers: cors });
      }

      if (path === "/scenarios" && request.method === "GET") {
        const storage = new DurableStorageManager(this.ctx.storage.sql);
        const filters: Record<string, unknown> = {};
        for (const [key, val] of url.searchParams) { filters[key] = val; }
        const results = await storage.searchScenarios(filters as any);
        return new Response(JSON.stringify({ count: results.length, scenarios: results }), { headers: cors });
      }

      if (path.startsWith("/student/") && request.method === "GET") {
        const studentId = decodeURIComponent(path.replace("/student/", ""));
        const storage = new DurableStorageManager(this.ctx.storage.sql);
        const scenarios = await storage.searchScenarios({ student_id: studentId, top_k: 1000 });
        // Return basic progress data
        return new Response(JSON.stringify({ student_id: studentId, total_scenarios: scenarios.length, scenarios }), { headers: cors });
      }

      return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: cors });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
    }
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

    if (url.pathname === "/app" || url.pathname === "/app/" || url.pathname === "/ui/dashboard" || url.pathname === "/ui/dashboard.html") {
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

    // REST API — route to a dedicated DO instance for state persistence
    if (url.pathname.startsWith("/app/api/")) {
      const id = env.BLS_SCENARIO.idFromName("rest-api");
      const stub = env.BLS_SCENARIO.get(id);
      return stub.fetch(request);
    }

    // MCP endpoint — delegate to McpAgent
    if (url.pathname.startsWith("/mcp")) {
      return mcpHandler.fetch(request, env, ctx);
    }

    return new Response("Not Found", { status: 404 });
  },
};
