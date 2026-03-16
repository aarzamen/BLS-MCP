# ChatGPT App Directory — Submission Metadata

Use this information when filling out the OpenAI Platform App Directory submission form.

## App Details

- **App Name:** BLS.ai
- **Tagline:** Interactive BLS training scenarios with AI-powered patient simulation and structured debriefs
- **Category:** Education
- **Description:**

BLS.ai runs interactive Basic Life Support training scenarios directly in conversation. An AI generates realistic clinical cases (cardiac arrest, respiratory arrest, opioid overdose), simulates patient physiology in response to your clinical decisions, and produces structured debriefs with quality metrics — compression fraction, time-to-first-compression, pause duration, and more. Track student progress over time, compare performances, and generate adaptive cases targeting weak areas. Built by a Navy physician who teaches BLS to combat medics.

## URLs

- **Privacy Policy URL:** `https://bls-scenario-server.<account>.workers.dev/privacy`
- **Terms of Service URL:** `https://bls-scenario-server.<account>.workers.dev/privacy`
- **Support Email:** [Your email]
- **MCP Server URL:** `https://bls-scenario-server.<account>.workers.dev/mcp`

## Availability

- **Country Availability:** United States (initially)

## Assets Needed (Human-Created)

- **Logo:** 512x512 PNG — medical/BLS themed (heart rhythm, AED, etc.)
- **Screenshots:** 3-5 screenshots showing:
  1. Starting a scenario with patient presentation
  2. The interactive dashboard during CPR
  3. A structured debrief with quality metrics
  4. Student progress tracking
  5. Case generation targeting weak areas

## Domain Verification

After deployment, set the verification token:

```bash
npx wrangler secret put OPENAI_VERIFICATION_TOKEN
```

The token is provided by OpenAI during the submission process and served at `/.well-known/openai-apps-challenge`.

## Tools Summary

| Tool | Title | Read-Only | Description |
|------|-------|-----------|-------------|
| start_scenario | Start BLS Scenario | No | Initialize a new training scenario |
| submit_action | Submit Clinical Action | No | Submit a BLS action during the scenario |
| update_patient_state | Update Patient Vitals | No | Modify patient condition mid-scenario |
| get_scenario_state | View Scenario Status | Yes | Read current scenario state |
| end_scenario | End Scenario & Debrief | No | Complete scenario and generate debrief |
| search_scenarios | Search Past Scenarios | Yes | Query stored scenarios with filters |
| get_student_progress | View Student Progress | Yes | Longitudinal student analytics |
| compare_scenarios | Compare Scenarios | Yes | Side-by-side metric comparison |
| generate_case | Generate Training Case | Yes | Structured case generation constraints |
| add_instructor_note | Add Instructor Note | No | Annotate completed scenarios |

## Data Categories

Categories of data collected/processed (required by OpenAI):

- Student identifiers (user-provided labels, not verified PII)
- BLS scenario actions and timestamps
- Quality metrics (compression fraction, timing measurements)
- Instructor notes (free-text annotations)
