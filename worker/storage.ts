// ============================================================================
// Durable Object SQLite Storage — Mirrors StorageManager API for Worker context
// ============================================================================

import {
  ScenarioState,
  DebriefReport,
  ScenarioIndexEntry,
  StoredScenario,
  StudentRecord,
  InstructorAnnotation,
} from "../src/types.js";

interface SqlStorage {
  exec<T extends Record<string, unknown> = Record<string, unknown>>(query: string, ...bindings: unknown[]): { toArray(): T[] };
}

export class DurableStorageManager {
  private sql: SqlStorage;

  constructor(sql: SqlStorage) {
    this.sql = sql;
  }

  async saveScenario(
    state: ScenarioState,
    debrief: DebriefReport,
    studentId: string | null,
    scenarioType: string
  ): Promise<void> {
    this.sql.exec(
      `INSERT OR REPLACE INTO scenarios (case_id, student_id, date, outcome, grade, scenario_type, duration_sec, state_json, debrief_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      state.case_id,
      studentId,
      state.started_at,
      debrief.outcome,
      debrief.grade,
      scenarioType,
      state.elapsed_sec,
      JSON.stringify(state),
      JSON.stringify(debrief)
    );
  }

  async getScenario(caseId: string): Promise<StoredScenario | null> {
    const rows = this.sql.exec(
      `SELECT state_json, debrief_json, student_id, scenario_type FROM scenarios WHERE case_id = ?`,
      caseId
    ).toArray() as Array<{ state_json: string; debrief_json: string; student_id: string | null; scenario_type: string }>;

    if (rows.length === 0) return null;

    const row = rows[0];
    const noteRows = this.sql.exec(
      `SELECT note, category, created_at FROM instructor_notes WHERE case_id = ? ORDER BY created_at`,
      caseId
    ).toArray() as Array<{ note: string; category: string; created_at: string }>;

    return {
      state: JSON.parse(row.state_json),
      debrief: JSON.parse(row.debrief_json),
      student_id: row.student_id,
      scenario_type: row.scenario_type,
      instructor_annotations: noteRows.map((n) => ({
        timestamp: n.created_at,
        note: n.note,
        category: n.category as InstructorAnnotation["category"],
      })),
    };
  }

  async listScenarios(): Promise<ScenarioIndexEntry[]> {
    const rows = this.sql.exec(
      `SELECT case_id, date, student_id, outcome, grade, scenario_type, duration_sec, state_json, debrief_json
       FROM scenarios ORDER BY date DESC`
    ).toArray() as Array<{
      case_id: string; date: string; student_id: string | null;
      outcome: string; grade: string; scenario_type: string;
      duration_sec: number; debrief_json: string;
    }>;

    return rows.map((r) => {
      const debrief = JSON.parse(r.debrief_json) as DebriefReport;
      return {
        case_id: r.case_id,
        date: r.date,
        student_id: r.student_id,
        outcome: r.outcome,
        grade: r.grade,
        scenario_type: r.scenario_type,
        duration_sec: r.duration_sec,
        key_metrics: {
          time_to_first_compression: debrief.quality_metrics.time_to_first_compression,
          compression_fraction: debrief.quality_metrics.compression_fraction,
          shock_count: debrief.quality_metrics.shock_count,
        },
      };
    });
  }

  async getStudent(studentId: string): Promise<StudentRecord | null> {
    const rows = this.sql.exec(
      `SELECT case_id, date FROM scenarios WHERE student_id = ? ORDER BY date`,
      studentId
    ).toArray() as Array<{ case_id: string; date: string }>;

    if (rows.length === 0) return null;

    return {
      student_id: studentId,
      scenarios: rows.map((r) => r.case_id),
      created_at: rows[0].date,
      updated_at: rows[rows.length - 1].date,
    };
  }

  async listStudents(): Promise<StudentRecord[]> {
    const rows = this.sql.exec(
      `SELECT DISTINCT student_id FROM scenarios WHERE student_id IS NOT NULL`
    ).toArray() as Array<{ student_id: string }>;

    const records: StudentRecord[] = [];
    for (const row of rows) {
      const student = await this.getStudent(row.student_id);
      if (student) records.push(student);
    }
    return records;
  }

  async saveStudent(_record: StudentRecord): Promise<void> {
    // No-op for SQL storage — student records are derived from scenarios table
  }

  async addInstructorNote(
    caseId: string,
    note: string,
    category: InstructorAnnotation["category"]
  ): Promise<boolean> {
    const exists = this.sql.exec(
      `SELECT 1 FROM scenarios WHERE case_id = ?`,
      caseId
    ).toArray();
    if (exists.length === 0) return false;

    this.sql.exec(
      `INSERT INTO instructor_notes (case_id, note, category) VALUES (?, ?, ?)`,
      caseId,
      note,
      category
    );
    return true;
  }

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
      const withNotes: ScenarioIndexEntry[] = [];
      for (const entry of results) {
        const noteCount = this.sql.exec(
          `SELECT COUNT(*) as cnt FROM instructor_notes WHERE case_id = ?`,
          entry.case_id
        ).toArray() as Array<{ cnt: number }>;
        if (noteCount[0]?.cnt > 0) {
          withNotes.push(entry);
        }
      }
      results = withNotes;
    }

    const limit = filters.top_k ?? 10;
    return results.slice(0, limit);
  }
}
