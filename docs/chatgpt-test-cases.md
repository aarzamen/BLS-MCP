# ChatGPT App Directory — Test Cases

## Positive Test Cases

### Scenario 1: Start a basic BLS scenario
**Prompt:** "Run me a basic BLS scenario with a witnessed cardiac arrest"
**Expected Tool:** `start_scenario`
**Expected Output:** Scenario state object with patient info, initial vitals, VFib rhythm, BLS algorithm at `scene_safety` step, valid actions `["check_scene_safety"]`

### Scenario 2: Submit a clinical action
**Prompt:** "Check the scene for safety"
**Expected Tool:** `submit_action` with action `check_scene_safety`
**Expected Output:** Action logged with timestamp, evaluation `correct`, updated BLS step to `responsiveness`, valid actions `["check_responsiveness"]`

### Scenario 3: Complete a scenario and get debrief
**Prompt:** "End this scenario, the patient achieved ROSC"
**Expected Tool:** `end_scenario` with outcome `rosc`
**Expected Output:** Structured debrief with initial assessment checklist, interventions, quality metrics (compression fraction, TTFC, shock count), grade, teaching points

### Scenario 4: Check student progress
**Prompt:** "Show me student Turner's BLS training progress"
**Expected Tool:** `get_student_progress` with student_id `Turner`
**Expected Output:** Total scenarios count, pass rate, metrics over time arrays (compression fraction, TTFC), trend analysis (improving/stable/declining), common errors with frequency, weak areas

### Scenario 5: Generate an adaptive case
**Prompt:** "Generate a BLS case targeting this student's weak areas"
**Expected Tool:** `generate_case` with student_id and difficulty
**Expected Output:** Case constraints with teaching objectives, recommended scenario type, suggested patient demographics, rhythm progression, focus areas, distractors

### Scenario 6: Search past scenarios
**Prompt:** "Find all scenarios from last month where the outcome was ROSC"
**Expected Tool:** `search_scenarios` with outcome `rosc` and date filters
**Expected Output:** Array of scenario summaries with case_id, date, student_id, outcome, grade, key metrics. Sorted by date descending.

## Negative Test Cases

### Scenario N1: Medical advice request (out of scope)
**Prompt:** "What medication should I give for a heart attack?"
**Expected:** App should NOT trigger. This is medical advice, not a BLS training simulation. The app simulates BLS scenarios — it does not provide clinical recommendations.

### Scenario N2: ACLS/ALS request (out of scope)
**Prompt:** "Run me an ACLS mega-code scenario with amiodarone and vasopressin"
**Expected:** App should NOT trigger. This is BLS only — the tool set does not include ACLS-level interventions like vasopressin, lidocaine, or synchronized cardioversion.

### Scenario N3: General medical question (out of scope)
**Prompt:** "What are the symptoms of a stroke?"
**Expected:** App should NOT trigger. General medical knowledge questions are outside the scope of BLS scenario simulation.
