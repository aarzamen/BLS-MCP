// ============================================================================
// Tool: get_student_progress — Longitudinal student performance tracking
// ============================================================================

import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { StorageAdapter, StoredScenario } from "../types.js";

let _storageManager: StorageAdapter | null = null;

export function setProgressStorageManager(sm: StorageAdapter): void {
  _storageManager = sm;
}

export async function handleGetStudentProgress(
  args: Record<string, unknown>
): Promise<CallToolResult> {
  if (!_storageManager) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: "Storage not initialized" }) }],
    };
  }

  const studentId = args.student_id as string;

  // Get all scenarios for this student from the index
  const allScenarios = await _storageManager.searchScenarios({
    student_id: studentId,
    top_k: 1000,
  });

  if (allScenarios.length === 0) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            student_id: studentId,
            total_scenarios: 0,
            message: "No scenarios found for this student",
          }),
        },
      ],
    };
  }

  // Load full scenario data for each
  const fullScenarios: StoredScenario[] = [];
  for (const entry of allScenarios) {
    const stored = await _storageManager.getScenario(entry.case_id);
    if (stored) fullScenarios.push(stored);
  }

  // Sort chronologically
  fullScenarios.sort(
    (a, b) => new Date(a.state.started_at).getTime() - new Date(b.state.started_at).getTime()
  );

  // Compute metrics over time
  const dates = fullScenarios.map((s) => s.state.started_at);
  const ttfc = fullScenarios.map(
    (s) => s.debrief.quality_metrics.time_to_first_compression ?? -1
  );
  const cf = fullScenarios.map((s) => s.debrief.quality_metrics.compression_fraction);
  const shocks = fullScenarios.map((s) => s.debrief.quality_metrics.shock_count);
  const pauses = fullScenarios.map((s) => s.debrief.quality_metrics.total_pause_duration);

  // Pass rate
  const competentCount = fullScenarios.filter((s) => s.debrief.grade === "Competent").length;
  const passRate = fullScenarios.length > 0 ? competentCount / fullScenarios.length : 0;

  // Trends (compare first 3 vs last 3)
  const trends: Record<string, string> = {};
  if (fullScenarios.length >= 3) {
    trends.time_to_first_compression = computeTrend(ttfc.filter((v) => v >= 0), true);
    trends.compression_fraction = computeTrend(cf, false);
  }

  // Common errors
  const errorCounts = new Map<string, number>();
  for (const s of fullScenarios) {
    for (const err of s.debrief.areas_for_improvement) {
      // Normalize error strings — strip timestamps
      const normalized = err.replace(/^\d+s:\s*/, "");
      errorCounts.set(normalized, (errorCounts.get(normalized) ?? 0) + 1);
    }
  }
  const commonErrors = [...errorCounts.entries()]
    .map(([error, frequency]) => ({ error, frequency }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 10);

  // Strengths — consistent good calls
  const goodCallCounts = new Map<string, number>();
  for (const s of fullScenarios) {
    for (const gc of s.debrief.what_went_well) {
      const normalized = gc.replace(/^\d+s:\s*/, "");
      goodCallCounts.set(normalized, (goodCallCounts.get(normalized) ?? 0) + 1);
    }
  }
  const strengths = [...goodCallCounts.entries()]
    .filter(([, count]) => count >= Math.ceil(fullScenarios.length * 0.5))
    .map(([s]) => s)
    .slice(0, 5);

  // Weak areas — derived from common errors + consistently low metrics
  const weakAreas: string[] = [];
  const recentCf = cf.slice(-3);
  if (recentCf.length >= 2 && recentCf.every((v) => v < 0.8)) {
    weakAreas.push("Low compression fraction (<80%) — minimize interruptions");
  }
  const recentTtfc = ttfc.filter((v) => v >= 0).slice(-3);
  if (recentTtfc.length >= 2 && recentTtfc.every((v) => v > 30)) {
    weakAreas.push("Delayed time to first compression (>30s)");
  }
  // Add top errors that occur in >50% of sessions
  for (const { error, frequency } of commonErrors) {
    if (frequency >= Math.ceil(fullScenarios.length * 0.5)) {
      weakAreas.push(error);
    }
  }

  const result = {
    student_id: studentId,
    total_scenarios: fullScenarios.length,
    date_range: {
      first: dates[0],
      last: dates[dates.length - 1],
    },
    pass_rate: Math.round(passRate * 100) / 100,
    metrics_over_time: {
      dates,
      time_to_first_compression: ttfc,
      compression_fraction: cf,
      shock_count: shocks,
      total_pause_duration: pauses,
    },
    trends,
    common_errors: commonErrors,
    strengths,
    weak_areas: weakAreas,
  };

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}

function computeTrend(values: number[], lowerIsBetter: boolean): string {
  if (values.length < 3) return "insufficient_data";

  const first3 = values.slice(0, 3);
  const last3 = values.slice(-3);
  const avgFirst = first3.reduce((a, b) => a + b, 0) / first3.length;
  const avgLast = last3.reduce((a, b) => a + b, 0) / last3.length;

  if (avgFirst === 0) return "stable";

  const change = (avgLast - avgFirst) / Math.abs(avgFirst);

  if (lowerIsBetter) {
    // For metrics where lower is better (e.g., time to first compression)
    if (change < -0.1) return "improving";
    if (change > 0.1) return "declining";
  } else {
    // For metrics where higher is better (e.g., compression fraction)
    if (change > 0.1) return "improving";
    if (change < -0.1) return "declining";
  }
  return "stable";
}
