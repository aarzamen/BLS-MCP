import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { StorageManager } from "../storage/persistence.js";
import { ScenarioState, DebriefReport, QualityMetrics } from "../types.js";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

function makeState(caseId: string, overrides: Partial<ScenarioState> = {}): ScenarioState {
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
    started_at: new Date().toISOString(),
    scenario_objectives: [],
    errors: [],
    good_calls: ["good CPR"],
    presentation: "Test case",
    collapse_witnessed: true,
    bystander_cpr: false,
    location: "OHCA",
    rosc_achieved: true,
    cpr_start_times: [25],
    cpr_stop_times: [280],
    last_epi_time: null,
    student_id: null,
    scenario_type: "witnessed_vfib",
    ...overrides,
  };
}

function makeDebrief(caseId: string, overrides: Partial<DebriefReport> = {}): DebriefReport {
  return {
    case_id: caseId,
    outcome: "rosc",
    initial_assessment: { scene_safety: true, responsiveness_checked: true, ems_activated: true, pulse_breathing_checked: true, time_to_pulse_check: 15 },
    interventions: { cpr_initiated: true, aed_used: true, shocks_delivered: 1, medications: [], airway_managed: true },
    quality_metrics: { time_to_first_compression: 25, compression_fraction: 0.85, cpr_cycle_count: 3, shock_count: 1, epi_doses: 0, epi_intervals: [], compressor_switches: 1, total_pause_duration: 8 },
    timeline: [],
    what_went_well: ["good CPR"],
    areas_for_improvement: [],
    teaching_points: ["test point"],
    grade: "Competent",
    instructor_notes: "",
    ...overrides,
  };
}

describe("StorageManager", () => {
  let tmpDir: string;
  let storage: StorageManager;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "bls-test-"));
    storage = new StorageManager(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("saves and retrieves a scenario", async () => {
    const state = makeState("case-001");
    const debrief = makeDebrief("case-001");
    await storage.saveScenario(state, debrief, null, "witnessed_vfib");

    const retrieved = await storage.getScenario("case-001");
    expect(retrieved).not.toBeNull();
    expect(retrieved!.state.case_id).toBe("case-001");
    expect(retrieved!.debrief.outcome).toBe("rosc");
  });

  it("persists data across new StorageManager instances", async () => {
    const state = makeState("case-002");
    const debrief = makeDebrief("case-002");
    await storage.saveScenario(state, debrief, null, "witnessed_vfib");

    // Create a new instance pointing to the same directory
    const storage2 = new StorageManager(tmpDir);
    const retrieved = await storage2.getScenario("case-002");
    expect(retrieved).not.toBeNull();
    expect(retrieved!.state.case_id).toBe("case-002");
  });

  it("updates index on save", async () => {
    await storage.saveScenario(makeState("case-a"), makeDebrief("case-a"), null, "witnessed_vfib");
    await storage.saveScenario(makeState("case-b"), makeDebrief("case-b"), "student-1", "pea_arrest");

    const index = await storage.listScenarios();
    expect(index.length).toBe(2);
    expect(index.map((e) => e.case_id).sort()).toEqual(["case-a", "case-b"]);
  });

  it("returns null for non-existent scenario", async () => {
    const result = await storage.getScenario("nonexistent");
    expect(result).toBeNull();
  });

  it("saves and retrieves student records", async () => {
    const state = makeState("case-s1", { student_id: "stu-1" });
    const debrief = makeDebrief("case-s1");
    await storage.saveScenario(state, debrief, "stu-1", "witnessed_vfib");

    const student = await storage.getStudent("stu-1");
    expect(student).not.toBeNull();
    expect(student!.student_id).toBe("stu-1");
    expect(student!.scenarios).toContain("case-s1");
  });

  it("adds instructor notes", async () => {
    await storage.saveScenario(makeState("case-n1"), makeDebrief("case-n1"), null, "witnessed_vfib");

    const added = await storage.addInstructorNote("case-n1", "Good leadership", "leadership");
    expect(added).toBe(true);

    const scenario = await storage.getScenario("case-n1");
    expect(scenario!.instructor_annotations.length).toBe(1);
    expect(scenario!.instructor_annotations[0].note).toBe("Good leadership");
    expect(scenario!.instructor_annotations[0].category).toBe("leadership");
  });

  it("returns false when adding note to non-existent scenario", async () => {
    const result = await storage.addInstructorNote("nonexistent", "note", "general");
    expect(result).toBe(false);
  });

  it("filters scenarios by student_id", async () => {
    await storage.saveScenario(makeState("c1"), makeDebrief("c1"), "stu-a", "witnessed_vfib");
    await storage.saveScenario(makeState("c2"), makeDebrief("c2"), "stu-b", "pea_arrest");
    await storage.saveScenario(makeState("c3"), makeDebrief("c3"), "stu-a", "respiratory_arrest");

    const results = await storage.searchScenarios({ student_id: "stu-a" });
    expect(results.length).toBe(2);
    expect(results.every((r) => r.student_id === "stu-a")).toBe(true);
  });

  it("filters scenarios by grade", async () => {
    await storage.saveScenario(makeState("g1"), makeDebrief("g1", { grade: "Competent" }), null, "vfib");
    await storage.saveScenario(makeState("g2"), makeDebrief("g2", { grade: "Needs Practice" }), null, "pea");

    const results = await storage.searchScenarios({ grade: "Competent" });
    expect(results.length).toBe(1);
    expect(results[0].case_id).toBe("g1");
  });

  it("respects top_k limit", async () => {
    for (let i = 0; i < 5; i++) {
      await storage.saveScenario(makeState(`tk-${i}`), makeDebrief(`tk-${i}`), null, "vfib");
    }
    const results = await storage.searchScenarios({ top_k: 3 });
    expect(results.length).toBe(3);
  });
});
