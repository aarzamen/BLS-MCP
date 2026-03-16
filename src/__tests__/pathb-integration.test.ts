import { describe, it, expect } from "vitest";
import {
  createScenario,
  processAction,
  generateDebrief,
  updatePatientState,
} from "../state/scenario-state.js";

describe("Path B Integration — Full Opioid OD Scenario", () => {
  it("runs a complete opioid overdose scenario end-to-end", () => {
    createScenario({
      case_id: "integ-od-1",
      patient: { age: 19, sex: "M", weight_kg: 70, history: "IV drug use" },
      presentation: "Found unresponsive in barracks, pinpoint pupils, cyanotic, agonal breathing",
      initial_vitals: {
        hr: 48, rhythm: "sinus_brady", bp_systolic: 85, bp_diastolic: 55,
        spo2: 68, rr: 0, gcs: 3, pupils: "pinpoint", skin: "cyanotic",
      },
      scenario_type: "opioid_overdose",
      student_id: "Marine-Turner",
    });

    // Scene safety → responsiveness → EMS → pulse check
    let r = processAction("integ-od-1", "check_scene_safety", 5);
    expect(r.success).toBe(true);
    r = processAction("integ-od-1", "check_responsiveness", 10);
    expect(r.success).toBe(true);
    r = processAction("integ-od-1", "activate_ems", 15);
    expect(r.success).toBe(true);
    r = processAction("integ-od-1", "check_pulse_breathing", 22);
    expect(r.success).toBe(true);
    expect(r.new_bls_step).toBe("pulse_no_breathing"); // Pulse present, no breathing

    // Open airway → rescue breathing begins
    r = processAction("integ-od-1", "open_airway", 28);
    expect(r.new_bls_step).toBe("rescue_breathing");

    // Administer naloxone
    r = processAction("integ-od-1", "administer_naloxone", 35);
    expect(r.success).toBe(true);
    expect(r.new_bls_step).toBe("rescue_breathing");

    // Apply BVM
    r = processAction("integ-od-1", "apply_bvm", 40);
    expect(r.success).toBe(true);

    // Give breaths while waiting for naloxone
    r = processAction("integ-od-1", "give_breaths", 60);
    expect(r.success).toBe(true);
    r = processAction("integ-od-1", "give_breaths", 90);
    expect(r.success).toBe(true);

    // Simulate naloxone working — breathing returns
    updatePatientState("integ-od-1", { vitals: { rr: 16, spo2: 94 } });

    // Reassess at 2 minutes — pulse + breathing → ROSC
    r = processAction("integ-od-1", "check_pulse_breathing", 140);
    expect(r.success).toBe(true);
    expect(r.new_bls_step).toBe("rosc");

    // Recovery position
    r = processAction("integ-od-1", "recovery_position", 150);
    expect(r.success).toBe(true);
    expect(r.new_bls_step).toBe("post_rosc_care");

    // Post-ROSC care
    r = processAction("integ-od-1", "post_rosc_care", 160);
    expect(r.success).toBe(true);
    expect(r.new_bls_step).toBe("scenario_complete");

    // Generate debrief
    const debrief = generateDebrief("integ-od-1", "rosc");
    expect(debrief).not.toBeUndefined();
    expect(debrief!.outcome).toBe("rosc");
    expect(debrief!.interventions.medications).toContain("Naloxone (intranasal/IM)");
    expect(debrief!.interventions.airway_managed).toBe(true);
  });

  it("handles respiratory arrest deteriorating to cardiac arrest", () => {
    createScenario({
      case_id: "integ-det-1",
      patient: { age: 60, sex: "F", weight_kg: 80, history: "COPD" },
      presentation: "Respiratory failure, unresponsive",
      initial_vitals: {
        hr: 50, rhythm: "sinus_brady", bp_systolic: 80, bp_diastolic: 50,
        spo2: 55, rr: 0, gcs: 3, pupils: "dilated", skin: "cyanotic",
      },
      scenario_type: "respiratory_arrest",
    });

    processAction("integ-det-1", "check_scene_safety", 5);
    processAction("integ-det-1", "check_responsiveness", 10);
    processAction("integ-det-1", "activate_ems", 15);
    processAction("integ-det-1", "check_pulse_breathing", 22);
    processAction("integ-det-1", "open_airway", 28);
    processAction("integ-det-1", "give_breaths", 35);

    // Patient deteriorates — pulse lost
    updatePatientState("integ-det-1", { vitals: { hr: 0, rr: 0 } });

    // Reassess → no pulse, no breathing → cardiac arrest
    let r = processAction("integ-det-1", "check_pulse_breathing", 140);
    expect(r.new_bls_step).toBe("no_pulse_no_breathing");

    // Transition to Path A
    r = processAction("integ-det-1", "start_compressions", 145);
    expect(r.success).toBe(true);
    expect(r.new_bls_step).toBe("cpr_in_progress");

    // Continue with CPR
    r = processAction("integ-det-1", "apply_aed", 160);
    expect(r.success).toBe(true);
    expect(r.new_bls_step).toBe("aed_applied");
  });
});
