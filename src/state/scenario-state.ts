// ============================================================================
// Scenario State Manager — In-memory state management for BLS scenarios
// ============================================================================

import {
  ScenarioState,
  Vitals,
  PatientInfo,
  BLSStep,
  BLSAction,
  ActionResult,
  TimelineEntry,
  DebriefReport,
} from "../types.js";
import {
  isActionValid,
  getNextStep,
  determinePulseCheckOutcome,
  evaluateActionTiming,
  ACTION_LABELS,
  getValidActions,
  getRecommendedActions,
} from "./bls-algorithm.js";
import { updateMetricsForAction, computeMetrics } from "./quality-metrics.js";

// In-memory store — no persistence for v1
const scenarios = new Map<string, ScenarioState>();

export function createScenario(params: {
  case_id: string;
  patient: PatientInfo;
  presentation: string;
  initial_vitals: Vitals;
  collapse_witnessed?: boolean;
  bystander_cpr?: boolean;
  location?: string;
  scenario_objectives?: string[];
}): ScenarioState {
  const state: ScenarioState = {
    case_id: params.case_id,
    patient: params.patient,
    status: "active",
    bls_step: "scene_safety",
    vitals: { ...params.initial_vitals },
    rhythm: params.initial_vitals.rhythm,
    timeline: [],
    metrics: {
      time_to_first_compression: null,
      compression_fraction: 0,
      cpr_cycle_count: 0,
      shock_count: 0,
      epi_doses: 0,
      epi_intervals: [],
      compressor_switches: 0,
      total_pause_duration: 0,
    },
    elapsed_sec: 0,
    started_at: new Date().toISOString(),
    scenario_objectives: params.scenario_objectives ?? [],
    errors: [],
    good_calls: [],
    presentation: params.presentation,
    collapse_witnessed: params.collapse_witnessed ?? false,
    bystander_cpr: params.bystander_cpr ?? false,
    location: params.location ?? "OHCA",
    rosc_achieved: false,
    cpr_start_times: [],
    cpr_stop_times: [],
    last_epi_time: null,
  };

  scenarios.set(params.case_id, state);
  return state;
}

export function getScenario(caseId: string): ScenarioState | undefined {
  return scenarios.get(caseId);
}

export function processAction(
  caseId: string,
  action: BLSAction,
  timestampSec: number,
  notes?: string
): ActionResult {
  const state = scenarios.get(caseId);
  if (!state) {
    return {
      success: false,
      evaluation: "incorrect",
      message: `Scenario ${caseId} not found`,
      new_bls_step: "scene_safety",
      state: {} as ScenarioState,
    };
  }

  if (state.status !== "active") {
    return {
      success: false,
      evaluation: "incorrect",
      message: `Scenario is ${state.status}, not active`,
      new_bls_step: state.bls_step,
      state,
    };
  }

  // Update elapsed time
  state.elapsed_sec = timestampSec;

  // Check if action is valid at current step
  const valid = isActionValid(state.bls_step, action);

  let evaluation: TimelineEntry["evaluation"];
  let message: string;
  let newStep: BLSStep;

  if (!valid) {
    // Action is out of order — record error but don't crash
    evaluation = "out_of_order";
    message = `Action "${action}" is not valid at step "${state.bls_step}". Valid actions: ${getValidActions(state.bls_step).join(", ")}`;
    newStep = state.bls_step; // Don't advance
    state.errors.push(
      `${timestampSec}s: ${action} attempted out of order at ${state.bls_step}`
    );
  } else {
    // Evaluate timing
    evaluation = evaluateActionTiming(action, timestampSec, 0);

    // Get next step
    let nextStep = getNextStep(state.bls_step, action);

    // Special handling for pulse/breathing check — outcome depends on vitals
    if (action === "check_pulse_breathing") {
      nextStep = determinePulseCheckOutcome(state.vitals.hr, state.vitals.rr);
    }

    newStep = nextStep ?? state.bls_step;

    // Update metrics
    updateMetricsForAction(state, action, timestampSec);

    // Generate message
    const label = ACTION_LABELS[action] ?? action;
    if (evaluation === "late") {
      message = `${label} — LATE (consider faster action in future)`;
      state.errors.push(`${timestampSec}s: ${action} was late`);
    } else {
      message = `${label} — Good`;
      state.good_calls.push(`${timestampSec}s: ${action} correctly performed`);
    }
  }

  // Record in timeline
  const entry: TimelineEntry = {
    action,
    timestamp_sec: timestampSec,
    evaluation,
    notes: notes ?? "",
    description: ACTION_LABELS[action] ?? action,
  };
  state.timeline.push(entry);

  // Advance step
  state.bls_step = newStep;

  return {
    success: valid,
    evaluation,
    message,
    new_bls_step: newStep,
    state,
  };
}

export function updatePatientState(
  caseId: string,
  updates: {
    vitals?: Partial<Vitals>;
    rhythm_change?: string;
    narrative?: string;
    rosc?: boolean;
    scenario_complete?: boolean;
  }
): ScenarioState | undefined {
  const state = scenarios.get(caseId);
  if (!state) return undefined;

  if (updates.vitals) {
    state.vitals = { ...state.vitals, ...updates.vitals };
  }

  if (updates.rhythm_change) {
    state.vitals.rhythm = updates.rhythm_change;
    state.rhythm = updates.rhythm_change;
  }

  if (updates.rosc) {
    state.rosc_achieved = true;
    state.bls_step = "rosc";
    // Stop CPR tracking
    if (state.cpr_start_times.length > state.cpr_stop_times.length) {
      state.cpr_stop_times.push(state.elapsed_sec);
    }
  }

  if (updates.narrative) {
    state.timeline.push({
      action: "rosc_assessment" as BLSAction,
      timestamp_sec: state.elapsed_sec,
      evaluation: "correct",
      notes: updates.narrative,
      description: updates.narrative,
    });
  }

  if (updates.scenario_complete) {
    state.status = "complete";
    state.bls_step = "scenario_complete";
  }

  return state;
}

export function generateDebrief(
  caseId: string,
  outcome: string,
  instructorNotes?: string
): DebriefReport | undefined {
  const state = scenarios.get(caseId);
  if (!state) return undefined;

  // Mark as complete
  state.status = "complete";

  const metrics = computeMetrics(state);

  const hasAction = (a: BLSAction) =>
    state.timeline.some((t) => t.action === a);

  const timeOfAction = (a: BLSAction): number | null => {
    const entry = state.timeline.find((t) => t.action === a);
    return entry ? entry.timestamp_sec : null;
  };

  // Determine grade
  let grade: DebriefReport["grade"] = "Competent";
  if (state.errors.length > 3) {
    grade = "Needs Practice";
  }
  if (state.errors.length > 6) {
    grade = "Specific Deficiency";
  }
  // Also check compression fraction
  if (metrics.compression_fraction < 0.6 && metrics.time_to_first_compression !== null) {
    grade = "Needs Practice";
  }

  // Generate teaching points from objectives
  const teachingPoints = state.scenario_objectives.length > 0
    ? state.scenario_objectives
    : generateDefaultTeachingPoints(state);

  return {
    case_id: caseId,
    outcome,
    initial_assessment: {
      scene_safety: hasAction("check_scene_safety"),
      responsiveness_checked: hasAction("check_responsiveness"),
      ems_activated: hasAction("activate_ems"),
      pulse_breathing_checked: hasAction("check_pulse_breathing"),
      time_to_pulse_check: timeOfAction("check_pulse_breathing"),
    },
    interventions: {
      cpr_initiated: hasAction("start_compressions"),
      aed_used: hasAction("apply_aed"),
      shocks_delivered: metrics.shock_count,
      medications: [
        ...(hasAction("give_epinephrine") ? [`Epinephrine x${metrics.epi_doses}`] : []),
        ...(hasAction("give_amiodarone") ? ["Amiodarone 300mg"] : []),
      ],
      airway_managed: hasAction("advanced_airway") || hasAction("open_airway"),
    },
    quality_metrics: metrics,
    timeline: state.timeline,
    what_went_well: state.good_calls,
    areas_for_improvement: state.errors,
    teaching_points: teachingPoints,
    grade,
    instructor_notes: instructorNotes ?? "",
  };
}

function generateDefaultTeachingPoints(state: ScenarioState): string[] {
  const points: string[] = [];

  if (state.metrics.time_to_first_compression !== null) {
    if (state.metrics.time_to_first_compression > 30) {
      points.push(
        "Time to first compression was delayed. Goal: <30 seconds from identifying cardiac arrest."
      );
    } else {
      points.push("Good time to first compression.");
    }
  }

  if (state.metrics.compression_fraction < 0.8) {
    points.push(
      `Compression fraction was ${Math.round(state.metrics.compression_fraction * 100)}%. Goal: >80%. Minimize interruptions.`
    );
  }

  if (state.metrics.compressor_switches === 0 && state.metrics.cpr_cycle_count > 1) {
    points.push(
      "Remember to switch compressors every 2 minutes to maintain compression quality."
    );
  }

  if (points.length === 0) {
    points.push("Overall performance met BLS standards. Continue practicing to maintain skills.");
  }

  return points;
}

export function getScenarioForExport(caseId: string) {
  const state = scenarios.get(caseId);
  if (!state) return null;

  return {
    case_id: state.case_id,
    patient: state.patient,
    status: state.status,
    bls_step: state.bls_step,
    vitals: state.vitals,
    rhythm: state.rhythm,
    timeline: state.timeline,
    metrics: computeMetrics(state),
    elapsed_sec: state.elapsed_sec,
    started_at: state.started_at,
    scenario_objectives: state.scenario_objectives,
    errors: state.errors,
    good_calls: state.good_calls,
    presentation: state.presentation,
    collapse_witnessed: state.collapse_witnessed,
    bystander_cpr: state.bystander_cpr,
    location: state.location,
    rosc_achieved: state.rosc_achieved,
    valid_actions: getValidActions(state.bls_step),
    recommended_actions: getRecommendedActions(state.bls_step),
  };
}
