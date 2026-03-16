// ============================================================================
// Tool: start_scenario — Initialize a new BLS training scenario
// ============================================================================

import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createScenario, getScenarioForExport } from "../state/scenario-state.js";
import { PatientInfo, Vitals } from "../types.js";

export const START_SCENARIO_TOOL = {
  name: "start_scenario",
  description:
    "Initialize a new BLS training scenario. Provide the case definition including patient demographics, presenting complaint, initial vitals, underlying rhythm, and expected decision points. The UI will render and the user will interact with the BLS algorithm.",
  inputSchema: {
    type: "object" as const,
    properties: {
      case_id: { type: "string", description: "Unique case identifier" },
      patient: {
        type: "object",
        properties: {
          age: { type: "number" },
          sex: { type: "string", enum: ["M", "F"] },
          weight_kg: { type: "number" },
          history: {
            type: "string",
            description: "Brief PMH relevant to the case",
          },
        },
        required: ["age", "sex", "weight_kg", "history"],
      },
      presentation: {
        type: "string",
        description:
          "Narrative description of the scene and patient presentation",
      },
      initial_vitals: {
        type: "object",
        properties: {
          hr: { type: "number" },
          rhythm: {
            type: "string",
            description:
              "e.g., VFib, pVT, PEA, asystole, sinus_tach, sinus_brady",
          },
          bp_systolic: { type: "number" },
          bp_diastolic: { type: "number" },
          spo2: { type: "number" },
          rr: { type: "number" },
          gcs: { type: "number" },
          pupils: { type: "string" },
          skin: { type: "string" },
        },
        required: ["hr", "rhythm", "bp_systolic", "bp_diastolic", "spo2", "rr", "gcs", "pupils", "skin"],
      },
      collapse_witnessed: { type: "boolean" },
      bystander_cpr: { type: "boolean" },
      location: { type: "string", enum: ["OHCA", "IHCA"] },
      scenario_objectives: {
        type: "array",
        items: { type: "string" },
        description:
          "Teaching points this scenario is designed to test",
      },
    },
    required: ["case_id", "patient", "presentation", "initial_vitals"],
  },
};

export function handleStartScenario(args: Record<string, unknown>): CallToolResult {
  const patient = args.patient as PatientInfo;
  const initialVitals = args.initial_vitals as Vitals;

  const state = createScenario({
    case_id: args.case_id as string,
    patient,
    presentation: args.presentation as string,
    initial_vitals: initialVitals,
    collapse_witnessed: args.collapse_witnessed as boolean | undefined,
    bystander_cpr: args.bystander_cpr as boolean | undefined,
    location: args.location as string | undefined,
    scenario_objectives: args.scenario_objectives as string[] | undefined,
    student_id: args.student_id as string | undefined,
    scenario_type: args.scenario_type as string | undefined,
  });

  const exported = getScenarioForExport(state.case_id);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            status: "scenario_started",
            case_id: state.case_id,
            message: `BLS scenario initialized. Patient: ${patient.age}yo ${patient.sex}. ${args.presentation}`,
            current_step: state.bls_step,
            valid_actions: exported?.valid_actions ?? [],
            recommended_actions: exported?.recommended_actions ?? [],
            state: exported,
          },
          null,
          2
        ),
      },
    ],
  };
}
