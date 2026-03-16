// ============================================================================
// Tool: end_scenario — Generate structured debrief and persist
// ============================================================================

import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { generateDebrief, getScenario } from "../state/scenario-state.js";
import { StorageManager } from "../storage/persistence.js";

let _storageManager: StorageManager | null = null;

export function setStorageManager(sm: StorageManager): void {
  _storageManager = sm;
}

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

  // Persist scenario asynchronously (fire and forget — don't block the response)
  const state = getScenario(caseId);
  if (state && _storageManager) {
    _storageManager
      .saveScenario(state, debrief, state.student_id, state.scenario_type)
      .catch((err) => console.error("Failed to persist scenario:", err));
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
