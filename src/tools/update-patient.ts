// ============================================================================
// Tool: update_patient_state — LLM updates patient condition
// ============================================================================

import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { updatePatientState, getScenarioForExport } from "../state/scenario-state.js";
import { Vitals } from "../types.js";

export const UPDATE_PATIENT_TOOL = {
  name: "update_patient_state",
  description:
    "Update the patient's vitals and condition. Called by the LLM to simulate patient response to interventions or deterioration over time.",
  inputSchema: {
    type: "object" as const,
    properties: {
      case_id: { type: "string" },
      vitals: {
        type: "object",
        properties: {
          hr: { type: "number" },
          rhythm: { type: "string" },
          bp_systolic: { type: "number" },
          bp_diastolic: { type: "number" },
          spo2: { type: "number" },
          rr: { type: "number" },
          gcs: { type: "number" },
          pupils: { type: "string" },
          skin: { type: "string" },
        },
        description: "Partial vitals update — only include changed values",
      },
      rhythm_change: {
        type: "string",
        description: "New rhythm if changed",
      },
      narrative: {
        type: "string",
        description: "What's happening clinically",
      },
      rosc: {
        type: "boolean",
        description: "Set true if ROSC achieved",
      },
      scenario_complete: { type: "boolean" },
    },
    required: ["case_id"],
  },
};

export function handleUpdatePatient(args: Record<string, unknown>): CallToolResult {
  const caseId = args.case_id as string;

  const updated = updatePatientState(caseId, {
    vitals: args.vitals as Partial<Vitals> | undefined,
    rhythm_change: args.rhythm_change as string | undefined,
    narrative: args.narrative as string | undefined,
    rosc: args.rosc as boolean | undefined,
    scenario_complete: args.scenario_complete as boolean | undefined,
  });

  if (!updated) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: `Scenario ${caseId} not found`,
          }),
        },
      ],
    };
  }

  const exported = getScenarioForExport(caseId);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            status: "patient_updated",
            case_id: caseId,
            rosc_achieved: updated.rosc_achieved,
            scenario_complete: updated.status === "complete",
            state: exported,
          },
          null,
          2
        ),
      },
    ],
  };
}
