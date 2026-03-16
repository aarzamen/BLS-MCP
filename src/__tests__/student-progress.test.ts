import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { StorageManager } from "../storage/persistence.js";
import { ScenarioState, DebriefReport } from "../types.js";
import {
  handleGetStudentProgress,
  setProgressStorageManager,
} from "../tools/get-student-progress.js";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

function makeState(
  caseId: string,
  studentId: string,
  startedAt: string,
  cf: number,
  ttfc: number,
  errors: string[]
): ScenarioState {
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
    started_at: startedAt,
    scenario_objectives: [],
    errors,
    good_calls: [],
    presentation: "Test",
    collapse_witnessed: true,
    bystander_cpr: false,
    location: "OHCA",
    rosc_achieved: true,
    cpr_start_times: [],
    cpr_stop_times: [],
    last_epi_time: null,
    student_id: studentId,
    scenario_type: "witnessed_vfib",
  };
}

function makeDebrief(
  caseId: string,
  grade: DebriefReport["grade"],
  cf: number,
  ttfc: number,
  errors: string[]
): DebriefReport {
  return {
    case_id: caseId,
    outcome: "rosc",
    initial_assessment: { scene_safety: true, responsiveness_checked: true, ems_activated: true, pulse_breathing_checked: true, time_to_pulse_check: 15 },
    interventions: { cpr_initiated: true, aed_used: true, shocks_delivered: 1, medications: [], airway_managed: true },
    quality_metrics: { time_to_first_compression: ttfc, compression_fraction: cf, cpr_cycle_count: 3, shock_count: 1, epi_doses: 0, epi_intervals: [], compressor_switches: 1, total_pause_duration: 8 },
    timeline: [],
    what_went_well: [],
    areas_for_improvement: errors,
    teaching_points: [],
    grade,
    instructor_notes: "",
  };
}

describe("get_student_progress", () => {
  let tmpDir: string;
  let storage: StorageManager;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "bls-progress-"));
    storage = new StorageManager(tmpDir);
    setProgressStorageManager(storage);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns 0 scenarios for unknown student", async () => {
    const result = await handleGetStudentProgress({ student_id: "unknown" });
    const data = JSON.parse(result.content[0].text as string);
    expect(data.total_scenarios).toBe(0);
  });

  it("computes pass rate correctly", async () => {
    const dates = ["2026-01-01", "2026-01-08", "2026-01-15", "2026-01-22"];
    for (let i = 0; i < 4; i++) {
      const grade = i < 3 ? "Competent" : "Needs Practice";
      await storage.saveScenario(
        makeState(`c-${i}`, "stu-1", dates[i], 0.85, 25, []),
        makeDebrief(`c-${i}`, grade as DebriefReport["grade"], 0.85, 25, []),
        "stu-1",
        "witnessed_vfib"
      );
    }

    const result = await handleGetStudentProgress({ student_id: "stu-1" });
    const data = JSON.parse(result.content[0].text as string);
    expect(data.total_scenarios).toBe(4);
    expect(data.pass_rate).toBe(0.75);
  });

  it("detects improving trend", async () => {
    // First 3 sessions: low CF, last 3: high CF
    const sessions = [
      { cf: 0.5, ttfc: 50 },
      { cf: 0.55, ttfc: 45 },
      { cf: 0.6, ttfc: 40 },
      { cf: 0.85, ttfc: 20 },
      { cf: 0.9, ttfc: 18 },
      { cf: 0.92, ttfc: 15 },
    ];
    for (let i = 0; i < sessions.length; i++) {
      const d = `2026-0${i + 1}-01`;
      await storage.saveScenario(
        makeState(`t-${i}`, "stu-t", d, sessions[i].cf, sessions[i].ttfc, []),
        makeDebrief(`t-${i}`, "Competent", sessions[i].cf, sessions[i].ttfc, []),
        "stu-t",
        "witnessed_vfib"
      );
    }

    const result = await handleGetStudentProgress({ student_id: "stu-t" });
    const data = JSON.parse(result.content[0].text as string);
    expect(data.trends.compression_fraction).toBe("improving");
    expect(data.trends.time_to_first_compression).toBe("improving");
  });

  it("omits trends for student with fewer than 3 sessions", async () => {
    await storage.saveScenario(
      makeState("lone-1", "stu-lone", "2026-01-01", 0.8, 30, []),
      makeDebrief("lone-1", "Competent", 0.8, 30, []),
      "stu-lone",
      "witnessed_vfib"
    );

    const result = await handleGetStudentProgress({ student_id: "stu-lone" });
    const data = JSON.parse(result.content[0].text as string);
    expect(data.total_scenarios).toBe(1);
    expect(Object.keys(data.trends).length).toBe(0);
  });

  it("identifies common errors", async () => {
    const commonErr = "delayed compressions";
    for (let i = 0; i < 3; i++) {
      await storage.saveScenario(
        makeState(`e-${i}`, "stu-e", `2026-0${i + 1}-01`, 0.7, 40, [commonErr]),
        makeDebrief(`e-${i}`, "Needs Practice", 0.7, 40, [commonErr]),
        "stu-e",
        "witnessed_vfib"
      );
    }

    const result = await handleGetStudentProgress({ student_id: "stu-e" });
    const data = JSON.parse(result.content[0].text as string);
    expect(data.common_errors.length).toBeGreaterThan(0);
    expect(data.common_errors[0].error).toBe(commonErr);
    expect(data.common_errors[0].frequency).toBe(3);
  });
});
