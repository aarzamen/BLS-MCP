import { describe, it, expect } from "vitest";
import {
  isActionValid,
  getNextStep,
  getValidActions,
  determinePulseCheckOutcome,
  evaluateActionTiming,
  getRecommendedActions,
} from "../state/bls-algorithm.js";

describe("BLS Algorithm", () => {
  it("only allows check_scene_safety at scene_safety step", () => {
    expect(isActionValid("scene_safety", "check_scene_safety")).toBe(true);
    expect(isActionValid("scene_safety", "start_compressions")).toBe(false);
    expect(isActionValid("scene_safety", "deliver_shock")).toBe(false);
  });

  it("transitions scene_safety → responsiveness on check_scene_safety", () => {
    expect(getNextStep("scene_safety", "check_scene_safety")).toBe("responsiveness");
  });

  it("transitions responsiveness → activate_ems", () => {
    expect(getNextStep("responsiveness", "check_responsiveness")).toBe("activate_ems");
  });

  it("transitions activate_ems → pulse_breathing_check on activate_ems", () => {
    expect(getNextStep("activate_ems", "activate_ems")).toBe("pulse_breathing_check");
  });

  it("stays at activate_ems on request_aed (still need to activate)", () => {
    expect(getNextStep("activate_ems", "request_aed")).toBe("activate_ems");
  });

  it("transitions to cpr_in_progress from no_pulse_no_breathing", () => {
    expect(getNextStep("no_pulse_no_breathing", "start_compressions")).toBe("cpr_in_progress");
  });

  it("transitions cpr_in_progress → aed_applied on apply_aed", () => {
    expect(getNextStep("cpr_in_progress", "apply_aed")).toBe("aed_applied");
  });

  it("allows shock or resume_cpr at rhythm_analysis", () => {
    expect(isActionValid("rhythm_analysis", "deliver_shock")).toBe(true);
    expect(isActionValid("rhythm_analysis", "resume_cpr")).toBe(true);
  });

  it("determines pulse check outcome based on vitals", () => {
    expect(determinePulseCheckOutcome(0, 0)).toBe("no_pulse_no_breathing");
    expect(determinePulseCheckOutcome(0, 12)).toBe("no_pulse_breathing");
    expect(determinePulseCheckOutcome(80, 0)).toBe("pulse_no_breathing");
    expect(determinePulseCheckOutcome(80, 16)).toBe("rosc");
  });

  it("flags late pulse check timing", () => {
    expect(evaluateActionTiming("check_pulse_breathing", 10, 0)).toBe("correct");
    expect(evaluateActionTiming("check_pulse_breathing", 40, 0)).toBe("late");
  });

  it("flags late compressions", () => {
    expect(evaluateActionTiming("start_compressions", 30, 0)).toBe("correct");
    expect(evaluateActionTiming("start_compressions", 70, 0)).toBe("late");
  });

  it("returns valid actions for each step", () => {
    expect(getValidActions("scene_safety")).toEqual(["check_scene_safety"]);
    expect(getValidActions("cpr_in_progress")).toContain("apply_aed");
    expect(getValidActions("scenario_complete")).toEqual([]);
  });

  it("returns recommended actions", () => {
    expect(getRecommendedActions("scene_safety")).toEqual(["check_scene_safety"]);
    expect(getRecommendedActions("cpr_in_progress")).toEqual(["apply_aed"]);
    expect(getRecommendedActions("shock_delivered")).toEqual(["resume_cpr"]);
  });

  it("handles out-of-order action gracefully (does not throw)", () => {
    expect(isActionValid("scene_safety", "deliver_shock")).toBe(false);
    // getNextStep returns null for invalid transitions
    expect(getNextStep("scene_safety", "deliver_shock")).toBeNull();
  });
});
