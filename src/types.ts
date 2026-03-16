// ============================================================================
// BLS Scenario MCP App — Type Definitions
// ============================================================================

export interface PatientInfo {
  age: number;
  sex: "M" | "F";
  weight_kg: number;
  history: string;
}

export interface Vitals {
  hr: number;
  rhythm: string;
  bp_systolic: number;
  bp_diastolic: number;
  spo2: number;
  rr: number;
  gcs: number;
  pupils: string;
  skin: string;
}

export type BLSAction =
  | "check_scene_safety"
  | "check_responsiveness"
  | "activate_ems"
  | "request_aed"
  | "check_pulse_breathing"
  | "start_compressions"
  | "open_airway"
  | "give_breaths"
  | "apply_aed"
  | "analyze_rhythm"
  | "deliver_shock"
  | "resume_cpr"
  | "switch_compressor"
  | "establish_iv"
  | "give_epinephrine"
  | "give_amiodarone"
  | "advanced_airway"
  | "check_rhythm"
  | "rosc_assessment"
  | "post_rosc_care"
  // Path B: respiratory arrest / opioid overdose
  | "administer_naloxone"
  | "apply_bvm"
  | "suction_airway"
  | "recovery_position";

export type BLSStep =
  | "scene_safety"
  | "responsiveness"
  | "activate_ems"
  | "pulse_breathing_check"
  | "no_pulse_no_breathing"
  | "no_pulse_breathing"
  | "pulse_no_breathing"
  | "cpr_in_progress"
  | "aed_applied"
  | "rhythm_analysis"
  | "shock_delivered"
  | "cpr_post_shock"
  | "rhythm_check"
  | "rescue_breathing"
  | "rescue_breathing_reassess"
  | "rosc"
  | "post_rosc_care"
  | "scenario_complete";

export type ScenarioStatus = "not_started" | "active" | "paused" | "complete";

export interface TimelineEntry {
  action: BLSAction;
  timestamp_sec: number;
  evaluation: "correct" | "incorrect" | "late" | "early" | "out_of_order";
  notes: string;
  description: string;
}

export interface QualityMetrics {
  time_to_first_compression: number | null;
  compression_fraction: number;
  cpr_cycle_count: number;
  shock_count: number;
  epi_doses: number;
  epi_intervals: number[];
  compressor_switches: number;
  total_pause_duration: number;
}

export interface ScenarioState {
  case_id: string;
  patient: PatientInfo;
  status: ScenarioStatus;
  bls_step: BLSStep;
  vitals: Vitals;
  rhythm: string;
  timeline: TimelineEntry[];
  metrics: QualityMetrics;
  elapsed_sec: number;
  started_at: string;
  scenario_objectives: string[];
  errors: string[];
  good_calls: string[];
  presentation: string;
  collapse_witnessed: boolean;
  bystander_cpr: boolean;
  location: string;
  rosc_achieved: boolean;
  // Tracks CPR state for compression fraction calculation
  cpr_start_times: number[];
  cpr_stop_times: number[];
  last_epi_time: number | null;
  // v2: student and scenario tracking
  student_id: string | null;
  scenario_type: string;
}

export interface ActionResult {
  success: boolean;
  evaluation: "correct" | "incorrect" | "late" | "early" | "out_of_order";
  message: string;
  new_bls_step: BLSStep;
  state: ScenarioState;
}

export interface ScenarioIndexEntry {
  case_id: string;
  date: string;
  student_id: string | null;
  outcome: string;
  grade: string;
  scenario_type: string;
  duration_sec: number;
  key_metrics: {
    time_to_first_compression: number | null;
    compression_fraction: number;
    shock_count: number;
  };
}

export interface StoredScenario {
  state: ScenarioState;
  debrief: DebriefReport;
  student_id: string | null;
  scenario_type: string;
  instructor_annotations: InstructorAnnotation[];
}

export interface InstructorAnnotation {
  timestamp: string;
  note: string;
  category: "communication" | "leadership" | "technique" | "teamwork" | "clinical_judgment" | "general";
}

export interface StudentRecord {
  student_id: string;
  scenarios: string[];  // case_ids
  created_at: string;
  updated_at: string;
}

export interface DebriefReport {
  case_id: string;
  outcome: string;
  initial_assessment: {
    scene_safety: boolean;
    responsiveness_checked: boolean;
    ems_activated: boolean;
    pulse_breathing_checked: boolean;
    time_to_pulse_check: number | null;
  };
  interventions: {
    cpr_initiated: boolean;
    aed_used: boolean;
    shocks_delivered: number;
    medications: string[];
    airway_managed: boolean;
  };
  quality_metrics: QualityMetrics;
  timeline: TimelineEntry[];
  what_went_well: string[];
  areas_for_improvement: string[];
  teaching_points: string[];
  grade: "Competent" | "Needs Practice" | "Specific Deficiency";
  instructor_notes: string;
}
