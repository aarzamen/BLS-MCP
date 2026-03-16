// ============================================================================
// Quality Metrics — Compression fraction, timing calculations
// ============================================================================

import { ScenarioState, QualityMetrics, TimelineEntry } from "../types.js";

export function computeMetrics(state: ScenarioState): QualityMetrics {
  const timeline = state.timeline;

  return {
    time_to_first_compression: computeTimeToFirstCompression(timeline),
    compression_fraction: computeCompressionFraction(state),
    cpr_cycle_count: state.metrics.cpr_cycle_count,
    shock_count: state.metrics.shock_count,
    epi_doses: state.metrics.epi_doses,
    epi_intervals: state.metrics.epi_intervals,
    compressor_switches: state.metrics.compressor_switches,
    total_pause_duration: computeTotalPauseDuration(state),
  };
}

function computeTimeToFirstCompression(timeline: TimelineEntry[]): number | null {
  const compressionEntry = timeline.find((e) => e.action === "start_compressions");
  if (!compressionEntry) return null;
  return compressionEntry.timestamp_sec;
}

function computeCompressionFraction(state: ScenarioState): number {
  if (state.elapsed_sec === 0) return 0;

  let totalCprTime = 0;
  const starts = state.cpr_start_times;
  const stops = state.cpr_stop_times;

  for (let i = 0; i < starts.length; i++) {
    const end = i < stops.length ? stops[i] : state.elapsed_sec;
    totalCprTime += end - starts[i];
  }

  // Compression fraction is CPR time relative to time since first compression
  const firstCompression = computeTimeToFirstCompression(state.timeline);
  if (firstCompression === null) return 0;

  const relevantDuration = state.elapsed_sec - firstCompression;
  if (relevantDuration <= 0) return 0;

  return Math.min(1, totalCprTime / relevantDuration);
}

function computeTotalPauseDuration(state: ScenarioState): number {
  let totalPause = 0;
  const starts = state.cpr_start_times;
  const stops = state.cpr_stop_times;

  // Pauses are the gaps between stop and next start
  for (let i = 0; i < stops.length; i++) {
    const nextStart = i + 1 < starts.length ? starts[i + 1] : null;
    if (nextStart !== null) {
      totalPause += nextStart - stops[i];
    }
  }

  return totalPause;
}

export function updateMetricsForAction(
  state: ScenarioState,
  action: string,
  timestampSec: number
): void {
  switch (action) {
    case "start_compressions":
    case "resume_cpr":
      state.cpr_start_times.push(timestampSec);
      state.metrics.cpr_cycle_count++;
      break;

    case "check_rhythm":
    case "analyze_rhythm":
    case "deliver_shock":
    case "rosc_assessment":
      // CPR pauses for these actions
      if (
        state.cpr_start_times.length > state.cpr_stop_times.length
      ) {
        state.cpr_stop_times.push(timestampSec);
      }
      break;

    case "deliver_shock":
      state.metrics.shock_count++;
      break;

    case "switch_compressor":
      state.metrics.compressor_switches++;
      break;

    case "give_epinephrine":
      state.metrics.epi_doses++;
      if (state.last_epi_time !== null) {
        state.metrics.epi_intervals.push(timestampSec - state.last_epi_time);
      }
      state.last_epi_time = timestampSec;
      break;
  }

  // Recompute derived metrics
  const computed = computeMetrics(state);
  state.metrics.time_to_first_compression = computed.time_to_first_compression;
  state.metrics.compression_fraction = computed.compression_fraction;
  state.metrics.total_pause_duration = computed.total_pause_duration;
}
