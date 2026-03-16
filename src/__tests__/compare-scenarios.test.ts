import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { StorageManager } from "../storage/persistence.js";
import { ScenarioState, DebriefReport } from "../types.js";
import {
  handleCompareScenarios,
  setCompareStorageManager,
} from "../tools/compare-scenarios.js";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

function makeState(caseId: string, cf: number, ttfc: number): ScenarioState {
  return {
    case_id: caseId,
    patient: { age: 58, sex: "M", weight_kg: 85, history: "HTN" },
    status: "complete",
    bls_step: "scenario_complete",
    vitals: { hr: 80, rhythm: "sinus", bp_systolic: 120, bp_diastolic: 80, spo2: 98, rr: 16, gcs: 15, pupils: "reactive", skin: "warm" },
    rhythm: "sinus",
    timeline: [],
    metrics: { time_to_first_compression: ttfc, compression_fraction: cf, cpr_cycle_count: 3, shock_count: 1, epi_doses: 0, epi_intervals: [], compressor_switches: 1, total_pause_duration: 8 },
    elapsed_sec: 300,
    started_at: "2026-01-01T00:00:00Z",
    scenario_objectives: [],
    errors: [],
    good_calls: [],
    presentation: "Test",
    collapse_witnessed: true,
    bystander_cpr: false,
    location: "OHCA",
    rosc_achieved: true,
    cpr_start_times: [],
    cpr_stop_times: [],
    last_epi_time: null,
    student_id: null,
    scenario_type: "witnessed_vfib",
  };
}

function makeDebrief(caseId: string, cf: number, ttfc: number, pause: number, errors: string[]): DebriefReport {
  return {
    case_id: caseId,
    outcome: "rosc",
    initial_assessment: { scene_safety: true, responsiveness_checked: true, ems_activated: true, pulse_breathing_checked: true, time_to_pulse_check: 15 },
    interventions: { cpr_initiated: true, aed_used: true, shocks_delivered: 1, medications: [], airway_managed: true },
    quality_metrics: { time_to_first_compression: ttfc, compression_fraction: cf, cpr_cycle_count: 3, shock_count: 1, epi_doses: 0, epi_intervals: [], compressor_switches: 1, total_pause_duration: pause },
    timeline: [],
    what_went_well: [],
    areas_for_improvement: errors,
    teaching_points: [],
    grade: "Competent",
    instructor_notes: "",
  };
}

describe("compare_scenarios", () => {
  let tmpDir: string;
  let storage: StorageManager;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "bls-compare-"));
    storage = new StorageManager(tmpDir);
    setCompareStorageManager(storage);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("computes correct deltas and 'better' assignments", async () => {
    // A: CF 0.85, TTFC 25, pause 8
    // B: CF 0.70, TTFC 40, pause 15
    await storage.saveScenario(makeState("cmp-a", 0.85, 25), makeDebrief("cmp-a", 0.85, 25, 8, ["err-a"]), null, "vfib");
    await storage.saveScenario(makeState("cmp-b", 0.70, 40), makeDebrief("cmp-b", 0.70, 40, 15, ["err-b"]), null, "vfib");

    const result = await handleCompareScenarios({ case_id_a: "cmp-a", case_id_b: "cmp-b" });
    const data = JSON.parse(result.content[0].text as string);

    // Higher compression fraction is better → A is better
    expect(data.comparison.compression_fraction.better).toBe("a");
    // Lower TTFC is better → A is better
    expect(data.comparison.time_to_first_compression.better).toBe("a");
    // Lower pause is better → A is better
    expect(data.comparison.total_pause_duration.better).toBe("a");

    // Deltas
    expect(data.comparison.compression_fraction.delta).toBeCloseTo(-0.15, 2);
    expect(data.comparison.time_to_first_compression.delta).toBe(15);
  });

  it("handles equal metrics", async () => {
    await storage.saveScenario(makeState("eq-a", 0.80, 30), makeDebrief("eq-a", 0.80, 30, 10, []), null, "vfib");
    await storage.saveScenario(makeState("eq-b", 0.80, 30), makeDebrief("eq-b", 0.80, 30, 10, []), null, "vfib");

    const result = await handleCompareScenarios({ case_id_a: "eq-a", case_id_b: "eq-b" });
    const data = JSON.parse(result.content[0].text as string);
    expect(data.comparison.compression_fraction.better).toBe("equal");
    expect(data.comparison.time_to_first_compression.better).toBe("equal");
  });

  it("computes error set differences", async () => {
    await storage.saveScenario(makeState("es-a", 0.8, 25), makeDebrief("es-a", 0.8, 25, 8, ["err-shared", "err-a-only"]), null, "vfib");
    await storage.saveScenario(makeState("es-b", 0.8, 25), makeDebrief("es-b", 0.8, 25, 8, ["err-shared", "err-b-only"]), null, "vfib");

    const result = await handleCompareScenarios({ case_id_a: "es-a", case_id_b: "es-b" });
    const data = JSON.parse(result.content[0].text as string);
    expect(data.comparison.errors_a_only).toContain("err-a-only");
    expect(data.comparison.errors_b_only).toContain("err-b-only");
    expect(data.comparison.errors_both).toContain("err-shared");
  });

  it("returns error for missing scenario", async () => {
    await storage.saveScenario(makeState("exists", 0.8, 25), makeDebrief("exists", 0.8, 25, 8, []), null, "vfib");

    const result = await handleCompareScenarios({ case_id_a: "exists", case_id_b: "missing" });
    const data = JSON.parse(result.content[0].text as string);
    expect(data.error).toContain("missing");
  });
});
