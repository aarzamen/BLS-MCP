// ============================================================================
// Tool: compare_scenarios — Side-by-side comparison of two scenarios
// ============================================================================

import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { StorageAdapter } from "../types.js";

let _storageManager: StorageAdapter | null = null;

export function setCompareStorageManager(sm: StorageAdapter): void {
  _storageManager = sm;
}

export async function handleCompareScenarios(
  args: Record<string, unknown>
): Promise<CallToolResult> {
  if (!_storageManager) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: "Storage not initialized" }) }],
    };
  }

  const caseIdA = args.case_id_a as string;
  const caseIdB = args.case_id_b as string;

  const [scenarioA, scenarioB] = await Promise.all([
    _storageManager.getScenario(caseIdA),
    _storageManager.getScenario(caseIdB),
  ]);

  if (!scenarioA || !scenarioB) {
    const missing = [];
    if (!scenarioA) missing.push(caseIdA);
    if (!scenarioB) missing.push(caseIdB);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: `Scenario(s) not found: ${missing.join(", ")}`,
          }),
        },
      ],
    };
  }

  const mA = scenarioA.debrief.quality_metrics;
  const mB = scenarioB.debrief.quality_metrics;

  const errorsA = new Set(scenarioA.debrief.areas_for_improvement);
  const errorsB = new Set(scenarioB.debrief.areas_for_improvement);
  const errorsAOnly = [...errorsA].filter((e) => !errorsB.has(e));
  const errorsBOnly = [...errorsB].filter((e) => !errorsA.has(e));
  const errorsBoth = [...errorsA].filter((e) => errorsB.has(e));

  function compareMetric(
    a: number | null,
    b: number | null,
    lowerIsBetter: boolean
  ): { a: number | null; b: number | null; delta: number | null; better: "a" | "b" | "equal" } {
    if (a === null || b === null) {
      return { a, b, delta: null, better: "equal" };
    }
    const delta = b - a;
    let better: "a" | "b" | "equal" = "equal";
    if (Math.abs(delta) > 0.001) {
      if (lowerIsBetter) {
        better = a < b ? "a" : "b";
      } else {
        better = a > b ? "a" : "b";
      }
    }
    return { a, b, delta, better };
  }

  const result = {
    scenario_a: {
      case_id: caseIdA,
      student_id: scenarioA.student_id,
      date: scenarioA.state.started_at,
      outcome: scenarioA.debrief.outcome,
      grade: scenarioA.debrief.grade,
      metrics: mA,
    },
    scenario_b: {
      case_id: caseIdB,
      student_id: scenarioB.student_id,
      date: scenarioB.state.started_at,
      outcome: scenarioB.debrief.outcome,
      grade: scenarioB.debrief.grade,
      metrics: mB,
    },
    comparison: {
      time_to_first_compression: compareMetric(
        mA.time_to_first_compression,
        mB.time_to_first_compression,
        true
      ),
      compression_fraction: compareMetric(
        mA.compression_fraction,
        mB.compression_fraction,
        false
      ),
      total_pause_duration: compareMetric(
        mA.total_pause_duration,
        mB.total_pause_duration,
        true
      ),
      shock_count: { a: mA.shock_count, b: mB.shock_count },
      errors_a_only: errorsAOnly,
      errors_b_only: errorsBOnly,
      errors_both: errorsBoth,
    },
  };

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}
