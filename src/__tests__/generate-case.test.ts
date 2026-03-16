import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { StorageManager } from "../storage/persistence.js";
import { ScenarioState, DebriefReport } from "../types.js";
import {
  handleGenerateCase,
  setGenerateCaseStorageManager,
} from "../tools/generate-case.js";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

function makeState(caseId: string, studentId: string, scenarioType: string): ScenarioState {
  return {
    case_id: caseId,
    patient: { age: 58, sex: "M", weight_kg: 85, history: "HTN" },
    status: "complete",
    bls_step: "scenario_complete",
    vitals: { hr: 80, rhythm: "sinus", bp_systolic: 120, bp_diastolic: 80, spo2: 98, rr: 16, gcs: 15, pupils: "reactive", skin: "warm" },
    rhythm: "sinus",
    timeline: [],
    metrics: { time_to_first_compression: 25, compression_fraction: 0.65, cpr_cycle_count: 3, shock_count: 1, epi_doses: 0, epi_intervals: [], compressor_switches: 0, total_pause_duration: 15 },
    elapsed_sec: 300,
    started_at: new Date().toISOString(),
    scenario_objectives: [],
    errors: ["low compression fraction", "delayed pulse check"],
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
    scenario_type: scenarioType,
  };
}

function makeDebrief(caseId: string, errors: string[]): DebriefReport {
  return {
    case_id: caseId,
    outcome: "rosc",
    initial_assessment: { scene_safety: true, responsiveness_checked: true, ems_activated: true, pulse_breathing_checked: true, time_to_pulse_check: 15 },
    interventions: { cpr_initiated: true, aed_used: true, shocks_delivered: 1, medications: [], airway_managed: true },
    quality_metrics: { time_to_first_compression: 25, compression_fraction: 0.65, cpr_cycle_count: 3, shock_count: 1, epi_doses: 0, epi_intervals: [], compressor_switches: 0, total_pause_duration: 15 },
    timeline: [],
    what_went_well: [],
    areas_for_improvement: errors,
    teaching_points: [],
    grade: "Needs Practice",
    instructor_notes: "",
  };
}

describe("generate_case", () => {
  let tmpDir: string;
  let storage: StorageManager;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "bls-gen-"));
    storage = new StorageManager(tmpDir);
    setGenerateCaseStorageManager(storage);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns structured case constraints for beginner", async () => {
    const result = await handleGenerateCase({ difficulty: "beginner" });
    const data = JSON.parse(result.content[0].text as string);

    expect(data.difficulty).toBe("beginner");
    expect(data.recommended_scenario_type).toBeDefined();
    expect(data.teaching_objectives.length).toBeGreaterThan(0);
    expect(data.suggested_patient).toBeDefined();
    expect(data.suggested_rhythm_progression).toBeDefined();
  });

  it("returns structured case constraints for advanced", async () => {
    const result = await handleGenerateCase({ difficulty: "advanced" });
    const data = JSON.parse(result.content[0].text as string);
    expect(data.difficulty).toBe("advanced");
    expect(data.recommended_scenario_type).toBeDefined();
  });

  it("derives focus areas from student weak areas", async () => {
    // Create student with low compression fraction errors
    for (let i = 0; i < 3; i++) {
      const errors = ["low compression fraction", "delayed pulse check"];
      await storage.saveScenario(
        makeState(`gc-${i}`, "stu-weak", "witnessed_vfib"),
        makeDebrief(`gc-${i}`, errors),
        "stu-weak",
        "witnessed_vfib"
      );
    }

    const result = await handleGenerateCase({
      difficulty: "intermediate",
      student_id: "stu-weak",
    });
    const data = JSON.parse(result.content[0].text as string);

    expect(data.student_weak_areas.length).toBeGreaterThan(0);
    expect(data.rationale).toContain("stu-weak");
  });

  it("excludes recent scenario types when exclude_recent is true", async () => {
    // Student has done witnessed_vfib 3 times recently
    for (let i = 0; i < 3; i++) {
      await storage.saveScenario(
        makeState(`ex-${i}`, "stu-excl", "witnessed_vfib"),
        makeDebrief(`ex-${i}`, []),
        "stu-excl",
        "witnessed_vfib"
      );
    }

    const result = await handleGenerateCase({
      difficulty: "intermediate",
      student_id: "stu-excl",
      exclude_recent: true,
    });
    const data = JSON.parse(result.content[0].text as string);

    // Should not recommend witnessed_vfib again
    expect(data.recommended_scenario_type).not.toBe("witnessed_vfib");
  });

  it("respects explicit focus_areas parameter", async () => {
    const result = await handleGenerateCase({
      difficulty: "intermediate",
      focus_areas: ["rapid_pulse_check", "early_defibrillation"],
    });
    const data = JSON.parse(result.content[0].text as string);

    expect(data.focus_areas).toContain("rapid_pulse_check");
    expect(data.focus_areas).toContain("early_defibrillation");
    expect(data.teaching_objectives.length).toBeGreaterThan(0);
  });
});
