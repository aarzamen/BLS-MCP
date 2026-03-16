// ============================================================================
// Tool: get_scenario_state — Read-only state query
// ============================================================================

import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getScenarioForExport } from "../state/scenario-state.js";

export const GET_STATE_TOOL = {
  name: "get_scenario_state",
  description:
    "Get the current state of the running BLS scenario including all actions taken, current vitals, timeline, and BLS algorithm position.",
  inputSchema: {
    type: "object" as const,
    properties: {
      case_id: { type: "string" },
    },
    required: ["case_id"],
  },
};

export function handleGetState(args: Record<string, unknown>): CallToolResult {
  const caseId = args.case_id as string;
  const state = getScenarioForExport(caseId);

  if (!state) {
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

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(state, null, 2),
      },
    ],
  };
}
