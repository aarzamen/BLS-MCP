// ============================================================================
// Tool: submit_action — Process a clinical action from the user
// ============================================================================

import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { processAction, getScenarioForExport } from "../state/scenario-state.js";
import { BLSAction } from "../types.js";
import { formatStateSummary } from "./start-scenario.js";

export const SUBMIT_ACTION_TOOL = {
  name: "submit_action",
  description:
    "Submit a clinical action taken by the user during the BLS scenario. Returns updated patient state and evaluation of the action's appropriateness and timing.",
  inputSchema: {
    type: "object" as const,
    properties: {
      case_id: { type: "string" },
      action: {
        type: "string",
        enum: [
          "check_scene_safety",
          "check_responsiveness",
          "activate_ems",
          "request_aed",
          "check_pulse_breathing",
          "start_compressions",
          "open_airway",
          "give_breaths",
          "apply_aed",
          "analyze_rhythm",
          "deliver_shock",
          "resume_cpr",
          "switch_compressor",
          "establish_iv",
          "give_epinephrine",
          "give_amiodarone",
          "advanced_airway",
          "check_rhythm",
          "rosc_assessment",
          "post_rosc_care",
          "administer_naloxone",
          "apply_bvm",
          "suction_airway",
          "recovery_position",
          "head_tilt_chin_lift",
          "jaw_thrust",
        ],
      },
      timestamp_sec: {
        type: "number",
        description: "Seconds since scenario start when action was taken",
      },
      notes: {
        type: "string",
        description: "Optional verbal callout or additional context",
      },
    },
    required: ["case_id", "action", "timestamp_sec"],
  },
};

export function handleSubmitAction(args: Record<string, unknown>): CallToolResult {
  const caseId = args.case_id as string;
  const action = args.action as BLSAction;
  const timestampSec = args.timestamp_sec as number;
  const notes = args.notes as string | undefined;

  const result = processAction(caseId, action, timestampSec, notes);
  const exported = getScenarioForExport(caseId);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            success: result.success,
            evaluation: result.evaluation,
            message: result.message,
            new_bls_step: result.new_bls_step,
            valid_actions: exported?.valid_actions ?? [],
            recommended_actions: exported?.recommended_actions ?? [],
            state: exported,
            _summary: formatStateSummary(exported),
          },
          null,
          2
        ),
      },
    ],
  };
}
