// ============================================================================
// Tool: end_scenario — Generate structured debrief
// ============================================================================

import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { generateDebrief } from "../state/scenario-state.js";

export const END_SCENARIO_TOOL = {
  name: "end_scenario",
  description:
    "End the scenario and generate a structured debrief including BLS assessment card, quality metrics, and teaching points.",
  inputSchema: {
    type: "object" as const,
    properties: {
      case_id: { type: "string" },
      outcome: {
        type: "string",
        enum: ["rosc", "ongoing_cpr", "terminated", "handoff_to_als"],
      },
      instructor_notes: { type: "string" },
    },
    required: ["case_id", "outcome"],
  },
};

export function handleEndScenario(args: Record<string, unknown>): CallToolResult {
  const caseId = args.case_id as string;
  const outcome = args.outcome as string;
  const instructorNotes = args.instructor_notes as string | undefined;

  const debrief = generateDebrief(caseId, outcome, instructorNotes);

  if (!debrief) {
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
        text: JSON.stringify(
          {
            status: "scenario_complete",
            debrief,
          },
          null,
          2
        ),
      },
    ],
  };
}
