#!/usr/bin/env node
// ============================================================================
// BLS Scenario MCP Server — stdio Entry Point (local Claude Desktop)
// ============================================================================

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import { setStorageManager } from "./tools/end-scenario.js";
import { setSearchStorageManager } from "./tools/search-scenarios.js";
import { setProgressStorageManager } from "./tools/get-student-progress.js";
import { setCompareStorageManager } from "./tools/compare-scenarios.js";
import { setGenerateCaseStorageManager } from "./tools/generate-case.js";
import { setNoteStorageManager } from "./tools/add-instructor-note.js";
import { StorageManager } from "./storage/persistence.js";
import { registerTools } from "./register-tools.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize storage and wire into tools
export const storageManager = new StorageManager(join(__dirname, "..", "data"));
setStorageManager(storageManager);
setSearchStorageManager(storageManager);
setProgressStorageManager(storageManager);
setCompareStorageManager(storageManager);
setGenerateCaseStorageManager(storageManager);
setNoteStorageManager(storageManager);

function loadDashboardHtml(): string {
  try {
    return readFileSync(join(__dirname, "..", "ui", "dashboard.html"), "utf-8");
  } catch {
    return "<html><body><h1>Dashboard not found</h1></body></html>";
  }
}

const server = new McpServer({
  name: "bls-scenario",
  version: "1.0.0",
});

registerTools(server, loadDashboardHtml);

// ── Start ─────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("BLS Scenario MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
