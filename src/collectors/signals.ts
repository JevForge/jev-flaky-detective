import type { HistoryRun, TestResult, TestSignals } from '../schemas/detective.js';
import { fingerprintTestResult } from '../utils/sanitize.js';
import { toPosix } from '../utils/paths.js';

const ENV_MARKERS: Array<{ code: string; pattern: RegExp }> = [
  { code: 'timeout', pattern: /\b(timeout|timed?\s*out|etimedout|exceeded timeout)\b/i },
  { code: 'network', pattern: /\b(econnrefused|econnreset|enotfound|socket hang up|fetch failed|dns)\b/i },
  { code: 'resource', pattern: /\b(oom|out of memory|ENOMEM|disk quota|no space left|killed)\b/i },
  { code: 'infra', pattern: /\b(runner|github actions|container|docker|kubernetes|pod evicted)\b/i },
  { code: 'flake-hint', pattern: /\b(flaky|intermittent|race condition|timing)\b/i },
];

export function collectEnvironmentMarkers(text: string | undefined): string[] {
  if (!text) return [];
  const hits: string[] = [];
  for (const marker of ENV_MARKERS) {
    if (marker.pattern.test(text) && !hits.includes(marker.code)) hits.push(marker.code);
  }
  return hits.slice(0, 16);
}

function pathOverlaps(file: string | undefined, changedPaths: string[]): boolean {
  if (!file || changedPaths.length === 0) return false;
  const normalized = toPosix(file).toLowerCase();
  return changedPaths.some(path => {
    const p = toPosix(path).toLowerCase();
    return normalized === p || normalized.endsWith(`/${p}`) || normalized.includes(p);
  });
}

export function computeSignals(
  current: TestResult,
  history: HistoryRun[],
  lookback: number,
  changedPaths: string[],
): TestSignals {
  const window = history.slice(0, lookback);
  const historical: TestResult[] = [];
  for (const run of window) {
    const match = run.results.find(result => result.test_id === current.test_id || result.name === current.name);
    if (match) historical.push(match);
  }

  const timeline = [...historical].reverse(); // oldest → newest within window
  let failCount = 0;
  let passCount = 0;
  let skipCount = 0;
  let flips = 0;
  let consecutiveFailures = 0;
  let countingConsecutive = true;
  const digests: string[] = [];
  const durations: number[] = [];

  const consider = (result: TestResult, fromHistory: boolean) => {
    if (result.status === 'failed' || result.status === 'timedOut' || result.status === 'interrupted') {
      failCount += 1;
      if (countingConsecutive) consecutiveFailures += 1;
    } else if (result.status === 'passed') {
      passCount += 1;
      countingConsecutive = false;
    } else if (result.status === 'skipped') {
      skipCount += 1;
      countingConsecutive = false;
    } else {
      countingConsecutive = false;
    }
    const digest = fingerprintTestResult(result);
    if (digest) digests.push(digest);
    if (typeof result.duration_ms === 'number') durations.push(result.duration_ms);
    void fromHistory;
  };

  // History first (oldest→newest), then current
  for (const result of timeline) consider(result, true);
  // Reset consecutive from the end including current
  consecutiveFailures = 0;
  countingConsecutive = true;
  const reverseAll = [...timeline, current].reverse();
  for (const result of reverseAll) {
    if (result.status === 'failed' || result.status === 'timedOut' || result.status === 'interrupted') {
      if (countingConsecutive) consecutiveFailures += 1;
    } else {
      break;
    }
  }
  // Recount aggregates including current
  failCount = 0;
  passCount = 0;
  skipCount = 0;
  digests.length = 0;
  durations.length = 0;
  for (const result of [...timeline, current]) consider(result, true);

  for (let i = 1; i < timeline.length + 1; i += 1) {
    const prev = i === timeline.length ? current : timeline[i]!;
    const older = timeline[i - 1]!;
    const prevFail = prev.status === 'failed' || prev.status === 'timedOut';
    const olderFail = older.status === 'failed' || older.status === 'timedOut';
    const prevPass = prev.status === 'passed';
    const olderPass = older.status === 'passed';
    if ((prevFail && olderPass) || (prevPass && olderFail)) flips += 1;
  }

  const observed = failCount + passCount;
  const passRate = observed === 0 ? (current.status === 'passed' ? 1 : 0) : passCount / observed;
  const sameErrorRatio =
    digests.length === 0
      ? null
      : digests.filter(d => d === digests[digests.length - 1]).length / digests.length;

  const avgDuration =
    durations.length === 0 ? null : durations.reduce((sum, value) => sum + value, 0) / durations.length;
  const durationSpike =
    avgDuration !== null &&
    typeof current.duration_ms === 'number' &&
    avgDuration > 0 &&
    current.duration_ms > avgDuration * 3;

  const markers = collectEnvironmentMarkers(
    [current.error_message, current.stack_snippet, current.error_type].filter(Boolean).join('\n'),
  );

  return {
    test_id: current.test_id,
    current_status: current.status,
    history_count: timeline.length,
    fail_count: failCount,
    pass_count: passCount,
    skip_count: skipCount,
    pass_rate: passRate,
    flip_count: flips,
    consecutive_failures: consecutiveFailures,
    first_failure: timeline.length === 0 && (current.status === 'failed' || current.status === 'timedOut'),
    same_error_ratio: sameErrorRatio,
    environment_marker_hits: markers,
    changed_path_overlap: pathOverlaps(current.file, changedPaths),
    avg_duration_ms: avgDuration,
    duration_spike: durationSpike,
  };
}

export function heuristicFailureType(signals: TestSignals): {
  failure_type: 'regression' | 'flaky' | 'environment' | 'unknown';
  confidence: number;
} {
  const envHits = signals.environment_marker_hits.filter(hit => hit !== 'flake-hint');
  // Infra markers win over flake heuristics when present on the current failure.
  if (envHits.length > 0) {
    return { failure_type: 'environment', confidence: Math.min(0.88, 0.55 + envHits.length * 0.1) };
  }
  if (signals.flip_count >= 2 || (signals.pass_rate > 0.2 && signals.pass_rate < 0.85 && signals.history_count >= 3)) {
    return { failure_type: 'flaky', confidence: Math.min(0.9, 0.5 + signals.flip_count * 0.1) };
  }
  if (
    signals.consecutive_failures >= 2 ||
    (signals.first_failure && signals.changed_path_overlap) ||
    (signals.pass_rate === 0 && signals.history_count >= 2)
  ) {
    return { failure_type: 'regression', confidence: signals.changed_path_overlap ? 0.8 : 0.65 };
  }
  if (signals.history_count === 0) {
    return { failure_type: 'unknown', confidence: 0.4 };
  }
  return { failure_type: 'unknown', confidence: 0.45 };
}
