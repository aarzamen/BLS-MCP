import { describe, it, expect, beforeEach } from "vitest";
import {
  createScenario,
  processAction,
  getScenarioForExport,
  updatePatientState,
} from "../state/scenario-state.js";
import {
  isActionValid,
  getNextStep,
  getValidActions,
  getRecommendedActions,
} from "../state/bls-algorithm.js";

function advanceToAssessment(caseId: string): void {
  processAction(caseId, "check_scene_safety", 5);
  processAction(caseId, "check_responsiveness", 10);
  processAction(caseId, "activate_ems", 15);
}

describe("BLS Algorithm — Path B (Respiratory Arrest)", () => {
  beforeEach(() => {
    createScenario({
      case_id: "pathb-1",
      patient: { age: 22, sex: "M", weight_kg: 75, history: "Opioid use" },
      presentation: "Found unresponsive, absent breathing, pinpoint pupils",
      initial_vitals: {
        hr: 55, rhythm: "sinus_brady", bp_systolic: 90, bp_diastolic: 60,
        spo2: 72, rr: 0, gcs: 3, pupils: "pinpoint", skin: "cyanotic",
      },
      scenario_type: "opioid_overdose",
    });
  });

  it("routes to pulse_no_breathing when pulse present, no breathing", () => {
    advanceToAssessment("pathb-1");
    const result = processAction("pathb-1", "check_pulse_breathing", 20);
    expect(result.new_bls_step).toBe("pulse_no_breathing");
  });

  it("transitions to rescue_breathing on open_airway from pulse_no_breathing", () => {
    advanceToAssessment("pathb-1");
    processAction("pathb-1", "check_pulse_breathing", 20);
    const result = processAction("pathb-1", "open_airway", 25);
    expect(result.success).toBe(true);
    expect(result.new_bls_step).toBe("rescue_breathing");
  });

  it("allows naloxone during rescue_breathing", () => {
    advanceToAssessment("pathb-1");
    processAction("pathb-1", "check_pulse_breathing", 20);
    processAction("pathb-1", "open_airway", 25);
    const result = processAction("pathb-1", "administer_naloxone", 30);
    expect(result.success).toBe(true);
    expect(result.new_bls_step).toBe("rescue_breathing");
  });

  it("allows BVM during rescue_breathing", () => {
    advanceToAssessment("pathb-1");
    processAction("pathb-1", "check_pulse_breathing", 20);
    processAction("pathb-1", "open_airway", 25);
    const result = processAction("pathb-1", "apply_bvm", 30);
    expect(result.success).toBe(true);
    expect(result.new_bls_step).toBe("rescue_breathing");
  });

  it("allows suction_airway during rescue_breathing", () => {
    advanceToAssessment("pathb-1");
    processAction("pathb-1", "check_pulse_breathing", 20);
    processAction("pathb-1", "open_airway", 25);
    const result = processAction("pathb-1", "suction_airway", 28);
    expect(result.success).toBe(true);
  });

  it("completes opioid OD: rescue breathing → naloxone → breathing returns → recovery", () => {
    advanceToAssessment("pathb-1");
    processAction("pathb-1", "check_pulse_breathing", 20);
    processAction("pathb-1", "open_airway", 25);
    processAction("pathb-1", "give_breaths", 30);
    processAction("pathb-1", "administer_naloxone", 35);
    processAction("pathb-1", "apply_bvm", 60);

    // Simulate naloxone effect — breathing returns
    updatePatientState("pathb-1", { vitals: { rr: 14 } });

    // Reassess at 2 min
    const reassess = processAction("pathb-1", "check_pulse_breathing", 140);
    expect(reassess.success).toBe(true);
    expect(reassess.new_bls_step).toBe("rosc");

    // Recovery position
    const recovery = processAction("pathb-1", "recovery_position", 150);
    expect(recovery.success).toBe(true);
    expect(recovery.new_bls_step).toBe("post_rosc_care");
  });

  it("transitions to cardiac arrest path when pulse lost during rescue breathing", () => {
    createScenario({
      case_id: "pathb-det",
      patient: { age: 45, sex: "F", weight_kg: 65, history: "None" },
      presentation: "Respiratory arrest",
      initial_vitals: {
        hr: 60, rhythm: "sinus", bp_systolic: 100, bp_diastolic: 70,
        spo2: 80, rr: 0, gcs: 3, pupils: "dilated", skin: "pale",
      },
      scenario_type: "respiratory_arrest",
    });

    advanceToAssessment("pathb-det");
    processAction("pathb-det", "check_pulse_breathing", 20);
    processAction("pathb-det", "open_airway", 25);
    processAction("pathb-det", "give_breaths", 30);

    // Pulse lost
    updatePatientState("pathb-det", { vitals: { hr: 0, rr: 0 } });

    // Reassess — should detect no pulse
    const reassess = processAction("pathb-det", "check_pulse_breathing", 140);
    expect(reassess.new_bls_step).toBe("no_pulse_no_breathing");

    // Start CPR (Path A)
    const cpr = processAction("pathb-det", "start_compressions", 145);
    expect(cpr.success).toBe(true);
    expect(cpr.new_bls_step).toBe("cpr_in_progress");
  });

  it("continues rescue breathing loop when reassess shows pulse but no breathing", () => {
    advanceToAssessment("pathb-1");
    processAction("pathb-1", "check_pulse_breathing", 20);
    processAction("pathb-1", "open_airway", 25);
    processAction("pathb-1", "give_breaths", 30);

    // Reassess — still pulse, no breathing (hr=55, rr=0)
    const reassess = processAction("pathb-1", "check_pulse_breathing", 140);
    expect(reassess.success).toBe(true);
    expect(reassess.new_bls_step).toBe("rescue_breathing");
  });

  it("validates new actions at correct steps", () => {
    expect(isActionValid("rescue_breathing", "administer_naloxone")).toBe(true);
    expect(isActionValid("rescue_breathing", "apply_bvm")).toBe(true);
    expect(isActionValid("rescue_breathing", "suction_airway")).toBe(true);
    expect(isActionValid("rosc", "recovery_position")).toBe(true);
    expect(isActionValid("post_rosc_care", "recovery_position")).toBe(true);
    expect(isActionValid("cpr_in_progress", "administer_naloxone")).toBe(true);
  });

  it("allows naloxone during CPR (opioid cardiac arrest)", () => {
    expect(getNextStep("cpr_in_progress", "administer_naloxone")).toBe("cpr_in_progress");
  });

  it("provides correct recommendations for rescue_breathing_reassess", () => {
    expect(getRecommendedActions("rescue_breathing_reassess")).toEqual(["check_pulse_breathing"]);
    expect(getValidActions("rescue_breathing_reassess")).toEqual(["check_pulse_breathing"]);
  });

  it("validates head_tilt_chin_lift at pulse_no_breathing and rescue_breathing", () => {
    expect(isActionValid("pulse_no_breathing", "head_tilt_chin_lift")).toBe(true);
    expect(isActionValid("rescue_breathing", "head_tilt_chin_lift")).toBe(true);
    expect(isActionValid("cpr_in_progress", "head_tilt_chin_lift")).toBe(false);
  });

  it("validates jaw_thrust at pulse_no_breathing and rescue_breathing", () => {
    expect(isActionValid("pulse_no_breathing", "jaw_thrust")).toBe(true);
    expect(isActionValid("rescue_breathing", "jaw_thrust")).toBe(true);
    expect(isActionValid("scene_safety", "jaw_thrust")).toBe(false);
  });

  it("transitions to rescue_breathing on head_tilt_chin_lift from pulse_no_breathing", () => {
    advanceToAssessment("pathb-1");
    processAction("pathb-1", "check_pulse_breathing", 20);
    const result = processAction("pathb-1", "head_tilt_chin_lift", 25);
    expect(result.success).toBe(true);
    expect(result.new_bls_step).toBe("rescue_breathing");
  });

  it("transitions to rescue_breathing on jaw_thrust from pulse_no_breathing", () => {
    createScenario({
      case_id: "pathb-jt",
      patient: { age: 30, sex: "M", weight_kg: 80, history: "Trauma" },
      presentation: "MVC with c-spine precaution",
      initial_vitals: {
        hr: 65, rhythm: "sinus", bp_systolic: 110, bp_diastolic: 70,
        spo2: 78, rr: 0, gcs: 3, pupils: "equal", skin: "pale",
      },
      scenario_type: "respiratory_arrest",
    });
    advanceToAssessment("pathb-jt");
    processAction("pathb-jt", "check_pulse_breathing", 20);
    const result = processAction("pathb-jt", "jaw_thrust", 25);
    expect(result.success).toBe(true);
    expect(result.new_bls_step).toBe("rescue_breathing");
  });
});
