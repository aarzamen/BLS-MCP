// ============================================================================
// Tool: add_instructor_note — Persistent instructor annotations
// ============================================================================

import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { StorageAdapter, InstructorAnnotation } from "../types.js";

let _storageManager: StorageAdapter | null = null;

export function setNoteStorageManager(sm: StorageAdapter): void {
  _storageManager = sm;
}

export async function handleAddInstructorNote(
  args: Record<string, unknown>
): Promise<CallToolResult> {
  if (!_storageManager) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: "Storage not initialized" }) }],
    };
  }

  const caseId = args.case_id as string;
  const note = args.note as string;
  const category = (args.category as InstructorAnnotation["category"]) ?? "general";

  const success = await _storageManager.addInstructorNote(caseId, note, category);

  if (!success) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: `Scenario ${caseId} not found in storage. Note: scenarios must be completed and persisted before adding notes.`,
          }),
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          status: "note_added",
          case_id: caseId,
          category,
          note,
          timestamp: new Date().toISOString(),
        }),
      },
    ],
  };
}
