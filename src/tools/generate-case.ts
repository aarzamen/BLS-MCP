// ============================================================================
// Tool: generate_case — Structured case constraints for LLM case generation
// ============================================================================

import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { StorageManager } from "../storage/persistence.js";
import { StoredScenario } from "../types.js";

let _storageManager: StorageManager | null = null;

export function setGenerateCaseStorageManager(sm: StorageManager): void {
  _storageManager = sm;
}

const SCENARIO_TYPE_MAP: Record<
  string,
  {
    suggested_patient: { age_range: string; sex: string; relevant_pmh: string[] };
    suggested_rhythm_progression: string[];
    suggested_distractors: string[];
  }
> = {
  witnessed_vfib: {
    suggested_patient: { age_range: "45-70", sex: "M", relevant_pmh: ["hypertension", "hyperlipidemia"] },
    suggested_rhythm_progression: ["VFib", "VFib", "sinus_tach"],
    suggested_distractors: ["bystander panicking", "crowded environment"],
  },
  unwitnessed_asystole: {
    suggested_patient: { age_range: "70-90", sex: "F", relevant_pmh: ["CHF", "CKD", "diabetes"] },
    suggested_rhythm_progression: ["asystole", "asystole", "asystole"],
    suggested_distractors: ["found in bed", "unknown down time"],
  },
  pea_arrest: {
    suggested_patient: { age_range: "50-70", sex: "M", relevant_pmh: ["recent surgery", "DVT history"] },
    suggested_rhythm_progression: ["PEA", "PEA", "sinus_brady"],
    suggested_distractors: ["post-surgical setting", "IV lines in place"],
  },
  respiratory_arrest: {
    suggested_patient: { age_range: "20-50", sex: "M", relevant_pmh: ["asthma", "obesity"] },
    suggested_rhythm_progression: ["sinus_brady", "sinus_tach"],
    suggested_distractors: ["agonal breathing may confuse rescuer"],
  },
  opioid_overdose: {
    suggested_patient: { age_range: "18-40", sex: "M", relevant_pmh: ["opioid use disorder"] },
    suggested_rhythm_progression: ["sinus_brady", "sinus_rhythm"],
    suggested_distractors: ["needle marks visible", "bystanders may be uncooperative"],
  },
  choking_to_arrest: {
    suggested_patient: { age_range: "60-80", sex: "F", relevant_pmh: ["dysphagia", "stroke history"] },
    suggested_rhythm_progression: ["PEA", "asystole"],
    suggested_distractors: ["food visible in airway", "nursing home setting"],
  },
  exercise_related_sca: {
    suggested_patient: { age_range: "16-30", sex: "M", relevant_pmh: ["none known", "family history SCD"] },
    suggested_rhythm_progression: ["VFib", "sinus_tach"],
    suggested_distractors: ["athletic field", "AED nearby", "crowd of spectators"],
  },
  maternal_arrest: {
    suggested_patient: { age_range: "25-40", sex: "F", relevant_pmh: ["pregnancy 32 weeks", "preeclampsia"] },
    suggested_rhythm_progression: ["PEA", "VFib", "sinus_tach"],
    suggested_distractors: ["left uterine displacement needed", "OB team en route"],
  },
};

const FOCUS_AREA_OBJECTIVES: Record<string, string[]> = {
  rapid_pulse_check: [
    "Complete pulse check in under 10 seconds",
    "Identify pulselessness rapidly and confidently",
  ],
  post_shock_resumption: [
    "Resume CPR immediately after shock delivery",
    "Minimize peri-shock pause to under 10 seconds",
  ],
  compressor_switches: [
    "Switch compressors every 2 minutes",
    "Maintain compression quality throughout switch",
  ],
  minimize_pauses: [
    "Achieve compression fraction above 80%",
    "Limit all pauses to under 10 seconds",
  ],
  early_defibrillation: [
    "Apply AED within 3 minutes of arrest recognition",
    "Minimize time from AED arrival to first shock",
  ],
  team_communication: [
    "Use closed-loop communication for all orders",
    "Clearly verbalize role assignments",
  ],
  airway_management: [
    "Open airway before first ventilation",
    "Avoid excessive ventilation (no hyperventilation)",
  ],
};

export async function handleGenerateCase(
  args: Record<string, unknown>
): Promise<CallToolResult> {
  const difficulty = args.difficulty as string;
  let focusAreas = (args.focus_areas as string[] | undefined) ?? [];
  const studentId = args.student_id as string | undefined;
  let scenarioType = args.scenario_type as string | undefined;
  const excludeRecent = args.exclude_recent as boolean | undefined;

  // If student_id provided, load their weak areas
  let studentWeakAreas: string[] = [];
  let recentTypes: string[] = [];
  if (studentId && _storageManager) {
    const scenarios = await _storageManager.searchScenarios({
      student_id: studentId,
      top_k: 1000,
    });

    if (scenarios.length > 0) {
      // Load full scenarios to analyze weak areas
      const fullScenarios: StoredScenario[] = [];
      for (const entry of scenarios) {
        const stored = await _storageManager.getScenario(entry.case_id);
        if (stored) fullScenarios.push(stored);
      }

      // Derive weak areas from errors
      const errorCounts = new Map<string, number>();
      for (const s of fullScenarios) {
        for (const err of s.debrief.areas_for_improvement) {
          const normalized = err.replace(/^\d+s:\s*/, "");
          errorCounts.set(normalized, (errorCounts.get(normalized) ?? 0) + 1);
        }
      }
      studentWeakAreas = [...errorCounts.entries()]
        .filter(([, count]) => count >= Math.ceil(fullScenarios.length * 0.3))
        .sort((a, b) => b[1] - a[1])
        .map(([err]) => err)
        .slice(0, 5);

      // Check compression fraction
      const recentCf = fullScenarios
        .slice(-3)
        .map((s) => s.debrief.quality_metrics.compression_fraction);
      if (recentCf.some((cf) => cf < 0.8)) {
        if (!focusAreas.includes("minimize_pauses")) {
          focusAreas.push("minimize_pauses");
        }
      }

      // Recent scenario types for exclusion
      recentTypes = fullScenarios.slice(-3).map((s) => s.scenario_type);
    }
  }

  // If no explicit focus areas and student has weak areas, use those
  if (focusAreas.length === 0 && studentWeakAreas.length > 0) {
    // Map weak areas to focus area keys
    for (const wa of studentWeakAreas) {
      if (wa.includes("compression") || wa.includes("pause")) focusAreas.push("minimize_pauses");
      if (wa.includes("compressor") || wa.includes("switch")) focusAreas.push("compressor_switches");
      if (wa.includes("shock") || wa.includes("defibrillat")) focusAreas.push("post_shock_resumption");
      if (wa.includes("pulse check") || wa.includes("pulse_check")) focusAreas.push("rapid_pulse_check");
    }
    // Deduplicate
    focusAreas = [...new Set(focusAreas)];
  }

  // Select scenario type if not specified
  if (!scenarioType) {
    const allTypes = Object.keys(SCENARIO_TYPE_MAP);
    let candidates = allTypes;
    if (excludeRecent && recentTypes.length > 0) {
      candidates = allTypes.filter((t) => !recentTypes.includes(t));
      if (candidates.length === 0) candidates = allTypes;
    }

    // Pick based on difficulty
    if (difficulty === "beginner") {
      scenarioType =
        candidates.find((t) => t === "witnessed_vfib") ??
        candidates.find((t) => t === "exercise_related_sca") ??
        candidates[0];
    } else if (difficulty === "advanced") {
      scenarioType =
        candidates.find((t) => t === "pea_arrest") ??
        candidates.find((t) => t === "maternal_arrest") ??
        candidates[candidates.length - 1];
    } else {
      // intermediate — pick one not recently done
      scenarioType = candidates[Math.floor(candidates.length / 2)] ?? candidates[0];
    }
  }

  const typeData = SCENARIO_TYPE_MAP[scenarioType ?? "witnessed_vfib"] ??
    SCENARIO_TYPE_MAP["witnessed_vfib"];

  // Build teaching objectives from focus areas
  const teachingObjectives: string[] = [];
  for (const fa of focusAreas.slice(0, 3)) {
    const objectives = FOCUS_AREA_OBJECTIVES[fa];
    if (objectives) teachingObjectives.push(...objectives);
  }
  if (teachingObjectives.length === 0) {
    teachingObjectives.push(
      "Execute the BLS algorithm in correct order",
      "Deliver high-quality CPR with minimal interruptions"
    );
  }

  // Rationale
  const rationale = studentId
    ? `Targeting identified weak areas for student ${studentId}: ${studentWeakAreas.slice(0, 3).join("; ") || "general BLS proficiency"}. Focus: ${focusAreas.join(", ") || "comprehensive assessment"}.`
    : `${difficulty} difficulty scenario designed to test: ${focusAreas.join(", ") || "general BLS algorithm execution"}.`;

  const result = {
    recommended_scenario_type: scenarioType,
    difficulty,
    teaching_objectives: teachingObjectives.slice(0, 6),
    focus_areas: focusAreas,
    suggested_patient: typeData.suggested_patient,
    suggested_rhythm_progression: typeData.suggested_rhythm_progression,
    suggested_distractors: typeData.suggested_distractors,
    student_weak_areas: studentWeakAreas,
    rationale,
  };

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
}
