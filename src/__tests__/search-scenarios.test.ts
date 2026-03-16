import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { StorageManager } from "../storage/persistence.js";
import { ScenarioState, DebriefReport } from "../types.js";
import {
  handleSearchScenarios,
  setSearchStorageManager,
} from "../tools/search-scenarios.js";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

function makeState(caseId: string, startedAt: string): ScenarioState {
  return {
    case_id: caseId,
    patient: { age: 58, sex: "M", weight_kg: 85, history: "HTN" },
    status: "complete",
    bls_step: "scenario_complete",
    vitals: { hr: 80, rhythm: "sinus", bp_systolic: 120, bp_diastolic: 80, spo2: 98, rr: 16, gcs: 15, pupils: "reactive", skin: "warm" },
    rhythm: "sinus",
    timeline: [],
    metrics: { time_to_first_compression: 25, compression_fraction: 0.85, cpr_cycle_count: 3, shock_count: 1, epi_doses: 0, epi_intervals: [], compressor_switches: 1, total_pause_duration: 8 },
    elapsed_sec: 300,
    started_at: startedAt,
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

function makeDebrief(caseId: string, outcome: string, grade: string): DebriefReport {
  return {
    case_id: caseId,
    outcome,
    initial_assessment: { scene_safety: true, responsiveness_checked: true, ems_activated: true, pulse_breathing_checked: true, time_to_pulse_check: 15 },
    interventions: { cpr_initiated: true, aed_used: true, shocks_delivered: 1, medications: [], airway_managed: true },
    quality_metrics: { time_to_first_compression: 25, compression_fraction: 0.85, cpr_cycle_count: 3, shock_count: 1, epi_doses: 0, epi_intervals: [], compressor_switches: 1, total_pause_duration: 8 },
    timeline: [],
    what_went_well: [],
    areas_for_improvement: [],
    teaching_points: [],
    grade: grade as DebriefReport["grade"],
    instructor_notes: "",
  };
}

describe("search_scenarios", () => {
  let tmpDir: string;
  let storage: StorageManager;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "bls-search-"));
    storage = new StorageManager(tmpDir);
    setSearchStorageManager(storage);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns empty results from empty store", async () => {
    const result = await handleSearchScenarios({});
    const data = JSON.parse(result.content[0].text as string);
    expect(data.count).toBe(0);
    expect(data.scenarios).toEqual([]);
  });

  it("returns all scenarios without filters", async () => {
    await storage.saveScenario(makeState("s1", "2026-01-01"), makeDebrief("s1", "rosc", "Competent"), null, "vfib");
    await storage.saveScenario(makeState("s2", "2026-01-02"), makeDebrief("s2", "terminated", "Needs Practice"), null, "pea");

    const result = await handleSearchScenarios({});
    const data = JSON.parse(result.content[0].text as string);
    expect(data.count).toBe(2);
  });

  it("filters by outcome", async () => {
    await storage.saveScenario(makeState("o1", "2026-01-01"), makeDebrief("o1", "rosc", "Competent"), null, "vfib");
    await storage.saveScenario(makeState("o2", "2026-01-02"), makeDebrief("o2", "terminated", "Needs Practice"), null, "pea");

    const result = await handleSearchScenarios({ outcome: "rosc" });
    const data = JSON.parse(result.content[0].text as string);
    expect(data.count).toBe(1);
    expect(data.scenarios[0].case_id).toBe("o1");
  });

  it("filters by date range", async () => {
    await storage.saveScenario(makeState("d1", "2026-01-10"), makeDebrief("d1", "rosc", "Competent"), null, "vfib");
    await storage.saveScenario(makeState("d2", "2026-02-15"), makeDebrief("d2", "rosc", "Competent"), null, "vfib");
    await storage.saveScenario(makeState("d3", "2026-03-20"), makeDebrief("d3", "rosc", "Competent"), null, "vfib");

    const result = await handleSearchScenarios({
      date_after: "2026-02-01",
      date_before: "2026-03-01",
    });
    const data = JSON.parse(result.content[0].text as string);
    expect(data.count).toBe(1);
    expect(data.scenarios[0].case_id).toBe("d2");
  });

  it("sorts results by date descending", async () => {
    await storage.saveScenario(makeState("sort-1", "2026-01-01"), makeDebrief("sort-1", "rosc", "Competent"), null, "vfib");
    await storage.saveScenario(makeState("sort-2", "2026-03-01"), makeDebrief("sort-2", "rosc", "Competent"), null, "vfib");
    await storage.saveScenario(makeState("sort-3", "2026-02-01"), makeDebrief("sort-3", "rosc", "Competent"), null, "vfib");

    const result = await handleSearchScenarios({});
    const data = JSON.parse(result.content[0].text as string);
    expect(data.scenarios[0].case_id).toBe("sort-2");
    expect(data.scenarios[1].case_id).toBe("sort-3");
    expect(data.scenarios[2].case_id).toBe("sort-1");
  });
});
