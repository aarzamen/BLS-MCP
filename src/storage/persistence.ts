// ============================================================================
// File-Based Persistence — JSON storage for scenarios and students
// ============================================================================

import { mkdir, writeFile, readFile, readdir, rename, access } from "fs/promises";
import { join } from "path";
import {
  ScenarioState,
  DebriefReport,
  ScenarioIndexEntry,
  StoredScenario,
  StudentRecord,
  InstructorAnnotation,
} from "../types.js";

export class StorageManager {
  private dataDir: string;
  private scenariosDir: string;
  private studentsDir: string;
  private indexPath: string;
  private initialized = false;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.scenariosDir = join(dataDir, "scenarios");
    this.studentsDir = join(dataDir, "students");
    this.indexPath = join(dataDir, "index.json");
  }

  private async ensureDirectories(): Promise<void> {
    if (this.initialized) return;
    await mkdir(this.scenariosDir, { recursive: true });
    await mkdir(this.studentsDir, { recursive: true });
    // Create index.json if it doesn't exist
    try {
      await access(this.indexPath);
    } catch {
      await this.atomicWrite(this.indexPath, JSON.stringify([], null, 2));
    }
    this.initialized = true;
  }

  private async atomicWrite(filePath: string, data: string): Promise<void> {
    const tmpPath = filePath + ".tmp";
    await writeFile(tmpPath, data, "utf-8");
    await rename(tmpPath, filePath);
  }

  // ── Scenario Operations ─────────────────────────────────────────────────

  async saveScenario(
    state: ScenarioState,
    debrief: DebriefReport,
    studentId: string | null,
    scenarioType: string
  ): Promise<void> {
    await this.ensureDirectories();

    const stored: StoredScenario = {
      state,
      debrief,
      student_id: studentId,
      scenario_type: scenarioType,
      instructor_annotations: [],
    };

    const filePath = join(this.scenariosDir, `${state.case_id}.json`);
    await this.atomicWrite(filePath, JSON.stringify(stored, null, 2));

    // Update index
    await this.updateIndex(state, debrief, studentId, scenarioType);

    // Update student record if student_id provided
    if (studentId) {
      await this.addScenarioToStudent(studentId, state.case_id);
    }
  }

  async getScenario(caseId: string): Promise<StoredScenario | null> {
    await this.ensureDirectories();
    try {
      const filePath = join(this.scenariosDir, `${caseId}.json`);
      const data = await readFile(filePath, "utf-8");
      return JSON.parse(data) as StoredScenario;
    } catch {
      return null;
    }
  }

  async listScenarios(): Promise<ScenarioIndexEntry[]> {
    await this.ensureDirectories();
    try {
      const data = await readFile(this.indexPath, "utf-8");
      return JSON.parse(data) as ScenarioIndexEntry[];
    } catch {
      return [];
    }
  }

  private async updateIndex(
    state: ScenarioState,
    debrief: DebriefReport,
    studentId: string | null,
    scenarioType: string
  ): Promise<void> {
    const index = await this.listScenarios();

    // Remove existing entry for this case_id if any
    const filtered = index.filter((e) => e.case_id !== state.case_id);

    const entry: ScenarioIndexEntry = {
      case_id: state.case_id,
      date: state.started_at,
      student_id: studentId,
      outcome: debrief.outcome,
      grade: debrief.grade,
      scenario_type: scenarioType,
      duration_sec: state.elapsed_sec,
      key_metrics: {
        time_to_first_compression: debrief.quality_metrics.time_to_first_compression,
        compression_fraction: debrief.quality_metrics.compression_fraction,
        shock_count: debrief.quality_metrics.shock_count,
      },
    };

    filtered.push(entry);
    // Sort by date descending
    filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    await this.atomicWrite(this.indexPath, JSON.stringify(filtered, null, 2));
  }

  // ── Student Operations ──────────────────────────────────────────────────

  async saveStudent(record: StudentRecord): Promise<void> {
    await this.ensureDirectories();
    const filePath = join(this.studentsDir, `${record.student_id}.json`);
    await this.atomicWrite(filePath, JSON.stringify(record, null, 2));
  }

  async getStudent(studentId: string): Promise<StudentRecord | null> {
    await this.ensureDirectories();
    try {
      const filePath = join(this.studentsDir, `${studentId}.json`);
      const data = await readFile(filePath, "utf-8");
      return JSON.parse(data) as StudentRecord;
    } catch {
      return null;
    }
  }

  async listStudents(): Promise<StudentRecord[]> {
    await this.ensureDirectories();
    try {
      const files = await readdir(this.studentsDir);
      const records: StudentRecord[] = [];
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const data = await readFile(join(this.studentsDir, file), "utf-8");
        records.push(JSON.parse(data) as StudentRecord);
      }
      return records;
    } catch {
      return [];
    }
  }

  private async addScenarioToStudent(studentId: string, caseId: string): Promise<void> {
    let record = await this.getStudent(studentId);
    if (!record) {
      record = {
        student_id: studentId,
        scenarios: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }
    if (!record.scenarios.includes(caseId)) {
      record.scenarios.push(caseId);
    }
    record.updated_at = new Date().toISOString();
    await this.saveStudent(record);
  }

  // ── Instructor Notes ────────────────────────────────────────────────────

  async addInstructorNote(
    caseId: string,
    note: string,
    category: InstructorAnnotation["category"]
  ): Promise<boolean> {
    const stored = await this.getScenario(caseId);
    if (!stored) return false;

    stored.instructor_annotations.push({
      timestamp: new Date().toISOString(),
      note,
      category,
    });

    const filePath = join(this.scenariosDir, `${caseId}.json`);
    await this.atomicWrite(filePath, JSON.stringify(stored, null, 2));
    return true;
  }

  // ── Search ──────────────────────────────────────────────────────────────

  async searchScenarios(filters: {
    student_id?: string;
    date_after?: string;
    date_before?: string;
    outcome?: string;
    grade?: string;
    scenario_type?: string;
    has_notes?: boolean;
    top_k?: number;
  }): Promise<ScenarioIndexEntry[]> {
    let results = await this.listScenarios();

    if (filters.student_id) {
      results = results.filter((e) => e.student_id === filters.student_id);
    }
    if (filters.date_after) {
      const after = new Date(filters.date_after).getTime();
      results = results.filter((e) => new Date(e.date).getTime() >= after);
    }
    if (filters.date_before) {
      const before = new Date(filters.date_before).getTime();
      results = results.filter((e) => new Date(e.date).getTime() <= before);
    }
    if (filters.outcome) {
      results = results.filter((e) => e.outcome === filters.outcome);
    }
    if (filters.grade) {
      results = results.filter((e) => e.grade === filters.grade);
    }
    if (filters.scenario_type) {
      results = results.filter((e) => e.scenario_type === filters.scenario_type);
    }
    if (filters.has_notes) {
      // Need to check actual files for notes
      const withNotes: ScenarioIndexEntry[] = [];
      for (const entry of results) {
        const stored = await this.getScenario(entry.case_id);
        if (stored && stored.instructor_annotations.length > 0) {
          withNotes.push(entry);
        }
      }
      results = withNotes;
    }

    const limit = filters.top_k ?? 10;
    return results.slice(0, limit);
  }
}
