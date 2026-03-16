#!/usr/bin/env node
// ============================================================================
// BLS Scenario MCP Server — Entry Point
// ============================================================================

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { z } from "zod";

import { handleStartScenario } from "./tools/start-scenario.js";
import { handleSubmitAction } from "./tools/submit-action.js";
import { handleUpdatePatient } from "./tools/update-patient.js";
import { handleGetState } from "./tools/get-state.js";
import { handleEndScenario } from "./tools/end-scenario.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

// ── Tool: start_scenario ──────────────────────────────────────────────────

const startScenarioParams = {
  case_id: z.string().describe("Unique case identifier"),
  patient: z.object({
    age: z.number(),
    sex: z.enum(["M", "F"]),
    weight_kg: z.number(),
    history: z.string().describe("Brief PMH relevant to the case"),
  }),
  presentation: z.string().describe("Narrative description of the scene and patient presentation"),
  initial_vitals: z.object({
    hr: z.number(),
    rhythm: z.string().describe("e.g., VFib, pVT, PEA, asystole, sinus_tach, sinus_brady"),
    bp_systolic: z.number(),
    bp_diastolic: z.number(),
    spo2: z.number(),
    rr: z.number(),
    gcs: z.number(),
    pupils: z.string(),
    skin: z.string(),
  }),
  collapse_witnessed: z.boolean().optional(),
  bystander_cpr: z.boolean().optional(),
  location: z.enum(["OHCA", "IHCA"]).optional(),
  scenario_objectives: z.array(z.string()).optional().describe("Teaching points this scenario is designed to test"),
};

server.tool(
  "start_scenario",
  "Initialize a new BLS training scenario. Provide the case definition including patient demographics, presenting complaint, initial vitals, underlying rhythm, and expected decision points.",
  startScenarioParams,
  (args) => handleStartScenario(args as Record<string, unknown>)
);

// ── Tool: submit_action ───────────────────────────────────────────────────

const BLS_ACTIONS = [
  "check_scene_safety", "check_responsiveness", "activate_ems", "request_aed",
  "check_pulse_breathing", "start_compressions", "open_airway", "give_breaths",
  "apply_aed", "analyze_rhythm", "deliver_shock", "resume_cpr",
  "switch_compressor", "establish_iv", "give_epinephrine", "give_amiodarone",
  "advanced_airway", "check_rhythm", "rosc_assessment", "post_rosc_care",
] as const;

const submitActionParams = {
  case_id: z.string(),
  action: z.enum(BLS_ACTIONS),
  timestamp_sec: z.number().describe("Seconds since scenario start when action was taken"),
  notes: z.string().optional().describe("Optional verbal callout or additional context"),
};

server.tool(
  "submit_action",
  "Submit a clinical action taken by the user during the BLS scenario. Returns updated patient state and evaluation of the action's appropriateness and timing.",
  submitActionParams,
  (args) => handleSubmitAction(args as Record<string, unknown>)
);

// ── Tool: update_patient_state ────────────────────────────────────────────

const updatePatientParams = {
  case_id: z.string(),
  vitals: z.object({
    hr: z.number().optional(),
    rhythm: z.string().optional(),
    bp_systolic: z.number().optional(),
    bp_diastolic: z.number().optional(),
    spo2: z.number().optional(),
    rr: z.number().optional(),
    gcs: z.number().optional(),
    pupils: z.string().optional(),
    skin: z.string().optional(),
  }).optional().describe("Partial vitals update — only include changed values"),
  rhythm_change: z.string().optional().describe("New rhythm if changed"),
  narrative: z.string().optional().describe("What's happening clinically"),
  rosc: z.boolean().optional().describe("Set true if ROSC achieved"),
  scenario_complete: z.boolean().optional(),
};

server.tool(
  "update_patient_state",
  "Update the patient's vitals and condition. Called by the LLM to simulate patient response to interventions or deterioration over time.",
  updatePatientParams,
  (args) => handleUpdatePatient(args as Record<string, unknown>)
);

// ── Tool: get_scenario_state ──────────────────────────────────────────────

const getStateParams = {
  case_id: z.string(),
};

server.tool(
  "get_scenario_state",
  "Get the current state of the running BLS scenario including all actions taken, current vitals, timeline, and BLS algorithm position.",
  getStateParams,
  (args) => handleGetState(args as Record<string, unknown>)
);

// ── Tool: end_scenario ────────────────────────────────────────────────────

const endScenarioParams = {
  case_id: z.string(),
  outcome: z.enum(["rosc", "ongoing_cpr", "terminated", "handoff_to_als"]),
  instructor_notes: z.string().optional(),
};

server.tool(
  "end_scenario",
  "End the scenario and generate a structured debrief including BLS assessment card, quality metrics, and teaching points.",
  endScenarioParams,
  (args) => handleEndScenario(args as Record<string, unknown>)
);

// ── UI Resource ───────────────────────────────────────────────────────────

server.resource(
  "dashboard",
  "ui://bls-scenario/dashboard",
  { mimeType: "text/html", description: "BLS Scenario Interactive Dashboard" },
  () => ({
    contents: [
      {
        uri: "ui://bls-scenario/dashboard",
        mimeType: "text/html",
        text: loadDashboardHtml(),
      },
    ],
  })
);

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
