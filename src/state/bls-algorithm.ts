// ============================================================================
// BLS Algorithm — Valid action paths, transitions, and evaluation logic
// ============================================================================

import { BLSAction, BLSStep } from "../types.js";

// Maps each BLS step to the set of valid actions from that step
const VALID_ACTIONS: Record<BLSStep, BLSAction[]> = {
  scene_safety: ["check_scene_safety"],
  responsiveness: ["check_responsiveness"],
  activate_ems: ["activate_ems", "request_aed"],
  pulse_breathing_check: ["check_pulse_breathing"],

  // Cardiac arrest paths
  no_pulse_no_breathing: ["start_compressions"],
  no_pulse_breathing: ["start_compressions"],

  // Respiratory arrest path
  pulse_no_breathing: ["open_airway", "give_breaths"],

  cpr_in_progress: [
    "apply_aed",
    "switch_compressor",
    "give_breaths",
    "open_airway",
    "establish_iv",
    "give_epinephrine",
    "advanced_airway",
  ],

  aed_applied: ["analyze_rhythm"],

  rhythm_analysis: ["deliver_shock", "resume_cpr"],

  shock_delivered: ["resume_cpr"],

  cpr_post_shock: [
    "check_rhythm",
    "switch_compressor",
    "give_breaths",
    "establish_iv",
    "give_epinephrine",
    "give_amiodarone",
    "advanced_airway",
  ],

  rhythm_check: [
    "analyze_rhythm",
    "rosc_assessment",
    "resume_cpr",
    "deliver_shock",
  ],

  rescue_breathing: [
    "give_breaths",
    "check_pulse_breathing",
    "open_airway",
    "advanced_airway",
  ],

  rosc: ["rosc_assessment", "post_rosc_care"],

  post_rosc_care: ["post_rosc_care"],

  scenario_complete: [],
};

// What step does the algorithm advance to when this action is taken from a given step
const TRANSITIONS: Record<string, BLSStep> = {
  "scene_safety:check_scene_safety": "responsiveness",
  "responsiveness:check_responsiveness": "activate_ems",
  "activate_ems:activate_ems": "pulse_breathing_check",
  "activate_ems:request_aed": "activate_ems", // Stay — still need to activate EMS
  "pulse_breathing_check:check_pulse_breathing": "no_pulse_no_breathing", // Default; server overrides based on vitals

  "no_pulse_no_breathing:start_compressions": "cpr_in_progress",
  "no_pulse_breathing:start_compressions": "cpr_in_progress",
  "pulse_no_breathing:open_airway": "rescue_breathing",
  "pulse_no_breathing:give_breaths": "rescue_breathing",

  "cpr_in_progress:apply_aed": "aed_applied",
  "cpr_in_progress:switch_compressor": "cpr_in_progress",
  "cpr_in_progress:give_breaths": "cpr_in_progress",
  "cpr_in_progress:open_airway": "cpr_in_progress",
  "cpr_in_progress:establish_iv": "cpr_in_progress",
  "cpr_in_progress:give_epinephrine": "cpr_in_progress",
  "cpr_in_progress:advanced_airway": "cpr_in_progress",

  "aed_applied:analyze_rhythm": "rhythm_analysis",

  "rhythm_analysis:deliver_shock": "shock_delivered",
  "rhythm_analysis:resume_cpr": "cpr_post_shock",

  "shock_delivered:resume_cpr": "cpr_post_shock",

  "cpr_post_shock:check_rhythm": "rhythm_check",
  "cpr_post_shock:switch_compressor": "cpr_post_shock",
  "cpr_post_shock:give_breaths": "cpr_post_shock",
  "cpr_post_shock:establish_iv": "cpr_post_shock",
  "cpr_post_shock:give_epinephrine": "cpr_post_shock",
  "cpr_post_shock:give_amiodarone": "cpr_post_shock",
  "cpr_post_shock:advanced_airway": "cpr_post_shock",

  "rhythm_check:analyze_rhythm": "rhythm_analysis",
  "rhythm_check:rosc_assessment": "rosc",
  "rhythm_check:resume_cpr": "cpr_post_shock",
  "rhythm_check:deliver_shock": "shock_delivered",

  "rescue_breathing:give_breaths": "rescue_breathing",
  "rescue_breathing:check_pulse_breathing": "pulse_breathing_check",
  "rescue_breathing:open_airway": "rescue_breathing",
  "rescue_breathing:advanced_airway": "rescue_breathing",

  "rosc:rosc_assessment": "rosc",
  "rosc:post_rosc_care": "post_rosc_care",

  "post_rosc_care:post_rosc_care": "scenario_complete",
};

// Action display labels for the timeline
export const ACTION_LABELS: Record<BLSAction, string> = {
  check_scene_safety: "Scene safety confirmed",
  check_responsiveness: "Checked responsiveness — unresponsive",
  activate_ems: "EMS activated",
  request_aed: "AED requested",
  check_pulse_breathing: "Checking pulse and breathing",
  start_compressions: "CPR started — compressions initiated",
  open_airway: "Airway opened (head-tilt chin-lift)",
  give_breaths: "Rescue breaths delivered",
  apply_aed: "AED pads applied",
  analyze_rhythm: "AED analyzing rhythm",
  deliver_shock: "Shock delivered",
  resume_cpr: "CPR resumed",
  switch_compressor: "Compressor switched",
  establish_iv: "IV/IO access established",
  give_epinephrine: "Epinephrine 1mg administered",
  give_amiodarone: "Amiodarone 300mg administered",
  advanced_airway: "Advanced airway placed",
  check_rhythm: "Rhythm check at 2-minute mark",
  rosc_assessment: "Assessing for ROSC",
  post_rosc_care: "Post-ROSC care initiated",
};

export function getValidActions(step: BLSStep): BLSAction[] {
  return VALID_ACTIONS[step] ?? [];
}

export function isActionValid(step: BLSStep, action: BLSAction): boolean {
  return getValidActions(step).includes(action);
}

export function getNextStep(currentStep: BLSStep, action: BLSAction): BLSStep | null {
  const key = `${currentStep}:${action}`;
  return TRANSITIONS[key] ?? null;
}

// Determine the post-pulse-check step based on vitals
export function determinePulseCheckOutcome(
  hr: number,
  rr: number
): BLSStep {
  const hasPulse = hr > 0;
  const hasBreathing = rr > 0;

  if (!hasPulse && !hasBreathing) return "no_pulse_no_breathing";
  if (!hasPulse && hasBreathing) return "no_pulse_breathing";
  if (hasPulse && !hasBreathing) return "pulse_no_breathing";
  // Pulse and breathing present — unusual in BLS emergency but handle it
  return "rosc";
}

// Timing evaluation for specific actions
export function evaluateActionTiming(
  action: BLSAction,
  timestampSec: number,
  scenarioStartSec: number
): "correct" | "late" | "early" {
  const elapsed = timestampSec - scenarioStartSec;

  switch (action) {
    case "check_pulse_breathing":
      // Pulse check should be ≤10 seconds
      if (elapsed > 30) return "late";
      return "correct";

    case "start_compressions":
      // Should start quickly after identifying arrest
      if (elapsed > 60) return "late";
      return "correct";

    default:
      return "correct";
  }
}

// Get recommended next action(s) for a given step
export function getRecommendedActions(step: BLSStep): BLSAction[] {
  switch (step) {
    case "scene_safety":
      return ["check_scene_safety"];
    case "responsiveness":
      return ["check_responsiveness"];
    case "activate_ems":
      return ["activate_ems"];
    case "pulse_breathing_check":
      return ["check_pulse_breathing"];
    case "no_pulse_no_breathing":
    case "no_pulse_breathing":
      return ["start_compressions"];
    case "pulse_no_breathing":
      return ["open_airway"];
    case "cpr_in_progress":
      return ["apply_aed"];
    case "aed_applied":
      return ["analyze_rhythm"];
    case "rhythm_analysis":
      return ["deliver_shock"]; // Default — server may override based on rhythm
    case "shock_delivered":
      return ["resume_cpr"];
    case "cpr_post_shock":
      return ["check_rhythm"];
    case "rhythm_check":
      return ["analyze_rhythm"];
    case "rescue_breathing":
      return ["give_breaths"];
    case "rosc":
      return ["post_rosc_care"];
    default:
      return [];
  }
}
