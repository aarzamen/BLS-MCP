// ============================================================================
// Shared Tool Registration — Used by both stdio (index.ts) and Worker entry points
// ============================================================================

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { handleStartScenario } from "./tools/start-scenario.js";
import { handleSubmitAction } from "./tools/submit-action.js";
import { handleUpdatePatient } from "./tools/update-patient.js";
import { handleGetState } from "./tools/get-state.js";
import { handleEndScenario } from "./tools/end-scenario.js";
import { handleSearchScenarios } from "./tools/search-scenarios.js";
import { handleGetStudentProgress } from "./tools/get-student-progress.js";
import { handleCompareScenarios } from "./tools/compare-scenarios.js";
import { handleGenerateCase } from "./tools/generate-case.js";
import { handleAddInstructorNote } from "./tools/add-instructor-note.js";

const BLS_ACTIONS = [
  "check_scene_safety", "check_responsiveness", "activate_ems", "request_aed",
  "check_pulse_breathing", "start_compressions", "open_airway", "give_breaths",
  "apply_aed", "analyze_rhythm", "deliver_shock", "resume_cpr",
  "switch_compressor", "establish_iv", "give_epinephrine", "give_amiodarone",
  "advanced_airway", "check_rhythm", "rosc_assessment", "post_rosc_care",
  "administer_naloxone", "apply_bvm", "suction_airway", "recovery_position",
  "head_tilt_chin_lift", "jaw_thrust",
] as const;

export function registerTools(server: McpServer, getDashboardHtml?: () => string): void {
  // ── Tool: start_scenario ──────────────────────────────────────────────────

  server.tool(
    "start_scenario",
    "Initialize a new BLS training scenario. Provide the case definition including patient demographics, presenting complaint, initial vitals, underlying rhythm, and expected decision points.",
    {
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
      student_id: z.string().optional().describe("Student identifier for longitudinal tracking"),
      scenario_type: z.string().optional().describe("Scenario category, e.g., witnessed_vfib, pea_arrest, respiratory_arrest"),
    },
    { title: "Start BLS Scenario", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    (args) => handleStartScenario(args as Record<string, unknown>)
  );

  // ── Tool: submit_action ───────────────────────────────────────────────────

  server.tool(
    "submit_action",
    "Submit a clinical action taken by the user during the BLS scenario. Returns updated patient state and evaluation of the action's appropriateness and timing.",
    {
      case_id: z.string(),
      action: z.enum(BLS_ACTIONS),
      timestamp_sec: z.number().describe("Seconds since scenario start when action was taken"),
      notes: z.string().optional().describe("Optional verbal callout or additional context"),
    },
    { title: "Submit Clinical Action", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    (args) => handleSubmitAction(args as Record<string, unknown>)
  );

  // ── Tool: update_patient_state ────────────────────────────────────────────

  server.tool(
    "update_patient_state",
    "Update the patient's vitals and condition. Called by the LLM to simulate patient response to interventions or deterioration over time.",
    {
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
    },
    { title: "Update Patient Vitals", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    (args) => handleUpdatePatient(args as Record<string, unknown>)
  );

  // ── Tool: get_scenario_state ──────────────────────────────────────────────

  server.tool(
    "get_scenario_state",
    "Get the current state of the running BLS scenario including all actions taken, current vitals, timeline, and BLS algorithm position.",
    { case_id: z.string() },
    { title: "View Scenario Status", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    (args) => handleGetState(args as Record<string, unknown>)
  );

  // ── Tool: end_scenario ────────────────────────────────────────────────────

  server.tool(
    "end_scenario",
    "End the scenario and generate a structured debrief including BLS assessment card, quality metrics, and teaching points.",
    {
      case_id: z.string(),
      outcome: z.enum(["rosc", "ongoing_cpr", "terminated", "handoff_to_als"]),
      instructor_notes: z.string().optional(),
    },
    { title: "End Scenario & Debrief", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    (args) => handleEndScenario(args as Record<string, unknown>)
  );

  // ── Tool: search_scenarios ─────────────────────────────────────────────────

  server.tool(
    "search_scenarios",
    "Search past BLS training scenarios. Filter by student, date range, outcome, grade, or scenario type. Returns summary metadata, not full scenario state.",
    {
      student_id: z.string().optional().describe("Filter by student"),
      date_after: z.string().optional().describe("ISO date — scenarios after this date"),
      date_before: z.string().optional().describe("ISO date — scenarios before this date"),
      outcome: z.enum(["rosc", "ongoing_cpr", "terminated", "handoff_to_als"]).optional(),
      grade: z.enum(["Competent", "Needs Practice", "Specific Deficiency"]).optional(),
      scenario_type: z.string().optional(),
      has_notes: z.boolean().optional().describe("Filter to scenarios with instructor notes"),
      top_k: z.number().optional().describe("Max results to return. Default 10."),
    },
    { title: "Search Past Scenarios", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    (args) => handleSearchScenarios(args as Record<string, unknown>)
  );

  // ── Tool: get_student_progress ────────────────────────────────────────────

  server.tool(
    "get_student_progress",
    "Track a student's BLS performance across all training sessions. Returns longitudinal metrics, trend analysis, common errors, and identified weak areas.",
    { student_id: z.string().describe("Student identifier") },
    { title: "View Student Progress", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    (args) => handleGetStudentProgress(args as Record<string, unknown>)
  );

  // ── Tool: compare_scenarios ───────────────────────────────────────────────

  server.tool(
    "compare_scenarios",
    "Compare quality metrics between two BLS scenarios. Useful for tracking student improvement over time or comparing two students on the same case type.",
    { case_id_a: z.string(), case_id_b: z.string() },
    { title: "Compare Scenarios", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    (args) => handleCompareScenarios(args as Record<string, unknown>)
  );

  // ── Tool: generate_case ────────────────────────────────────────────────────

  server.tool(
    "generate_case",
    "Generate structured constraints for a new BLS training case. Returns teaching objectives, difficulty parameters, and focus areas based on student performance data. The host LLM uses this output to create and start a scenario via start_scenario.",
    {
      difficulty: z.enum(["beginner", "intermediate", "advanced"]).describe("beginner: straightforward VFib with early ROSC. intermediate: PEA or rhythm changes. advanced: multiple compressor switches, distractors, prolonged resuscitation."),
      focus_areas: z.array(z.string()).optional().describe("Specific skills to target"),
      student_id: z.string().optional().describe("If provided, auto-detect focus areas from student's weak_areas in progress data"),
      scenario_type: z.enum(["witnessed_vfib", "unwitnessed_asystole", "pea_arrest", "respiratory_arrest", "opioid_overdose", "choking_to_arrest", "exercise_related_sca", "maternal_arrest"]).optional(),
      exclude_recent: z.boolean().optional().describe("If true and student_id provided, avoid scenario types the student has done in last 3 sessions"),
    },
    { title: "Generate Training Case", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    (args) => handleGenerateCase(args as Record<string, unknown>)
  );

  // ── Tool: add_instructor_note ─────────────────────────────────────────────

  server.tool(
    "add_instructor_note",
    "Add an instructor annotation to a completed scenario. Notes are persistent and searchable. Use for qualitative observations not captured by automated metrics.",
    {
      case_id: z.string(),
      note: z.string().describe("Instructor observation or teaching note"),
      category: z.enum(["communication", "leadership", "technique", "teamwork", "clinical_judgment", "general"]).optional().describe("Category for the note. Default: general."),
    },
    { title: "Add Instructor Note", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    (args) => handleAddInstructorNote(args as Record<string, unknown>)
  );

  // ── UI Resource ───────────────────────────────────────────────────────────

  if (getDashboardHtml) {
    server.resource(
      "dashboard",
      "ui://bls-scenario/dashboard",
      { mimeType: "text/html", description: "BLS Scenario Interactive Dashboard" },
      () => ({
        contents: [
          {
            uri: "ui://bls-scenario/dashboard",
            mimeType: "text/html",
            text: getDashboardHtml(),
          },
        ],
      })
    );
  }
}
