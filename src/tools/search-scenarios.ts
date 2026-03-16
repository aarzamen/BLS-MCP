// ============================================================================
// Tool: search_scenarios — Search past BLS training scenarios
// ============================================================================

import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { StorageManager } from "../storage/persistence.js";

let _storageManager: StorageManager | null = null;

export function setSearchStorageManager(sm: StorageManager): void {
  _storageManager = sm;
}

export async function handleSearchScenarios(
  args: Record<string, unknown>
): Promise<CallToolResult> {
  if (!_storageManager) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: "Storage not initialized" }) }],
    };
  }

  const results = await _storageManager.searchScenarios({
    student_id: args.student_id as string | undefined,
    date_after: args.date_after as string | undefined,
    date_before: args.date_before as string | undefined,
    outcome: args.outcome as string | undefined,
    grade: args.grade as string | undefined,
    scenario_type: args.scenario_type as string | undefined,
    has_notes: args.has_notes as boolean | undefined,
    top_k: args.top_k as number | undefined,
  });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            count: results.length,
            scenarios: results,
          },
          null,
          2
        ),
      },
    ],
  };
}
