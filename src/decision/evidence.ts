import type { TestResult, TestSignals } from '../schemas/detective.js';
import { UNTRUSTED_NOTE } from '../schemas/enums.js';
import { digestError, sanitizeError } from '../utils/sanitize.js';

export interface SampleRow {
  test_id: string;
  name?: string;
  status: string;
  failure_heuristic: string;
  heuristic_confidence: number;
  signals: Partial<TestSignals>;
  error_digest?: string;
  error_preview?: string;
}

export interface EvaluationState {
  environment: string;
  runner_os?: string;
  runner_arch?: string;
  history_available: boolean;
  history_runs: number;
  sample: SampleRow[];
  aggregate: {
    tests: number;
    failing: number;
    avg_pass_rate: number | null;
    avg_flip_count: number | null;
    environment_marker_tests: number;
  };
  note: string;
}

export function buildEvaluationState(input: {
  environment: string;
  runner_os?: string;
  runner_arch?: string;
  historyRuns: number;
  historyAvailable: boolean;
  tests: TestResult[];
  signals: TestSignals[];
  heuristics: Array<{ test_id: string; failure_type: string; confidence: number }>;
  maxSample: number;
}): EvaluationState {
  const byId = new Map(input.signals.map(signal => [signal.test_id, signal]));
  const heuristicById = new Map(input.heuristics.map(row => [row.test_id, row]));
  const failing = input.tests.filter(
    test => test.status === 'failed' || test.status === 'timedOut' || test.status === 'interrupted',
  );
  const sampleSource = failing.length > 0 ? failing : input.tests;
  const sample = sampleSource.slice(0, input.maxSample).map(test => {
    const signals = byId.get(test.test_id);
    const heuristic = heuristicById.get(test.test_id);
    return {
      test_id: test.test_id,
      name: test.name,
      status: test.status,
      failure_heuristic: heuristic?.failure_type ?? 'unknown',
      heuristic_confidence: heuristic?.confidence ?? 0,
      signals: signals
        ? {
            history_count: signals.history_count,
            pass_rate: signals.pass_rate,
            flip_count: signals.flip_count,
            consecutive_failures: signals.consecutive_failures,
            first_failure: signals.first_failure,
            same_error_ratio: signals.same_error_ratio,
            environment_marker_hits: signals.environment_marker_hits,
            changed_path_overlap: signals.changed_path_overlap,
            duration_spike: signals.duration_spike,
          }
        : {},
      error_digest: digestError(test.error_message ?? test.stack_snippet),
      error_preview: sanitizeError(test.error_message, 240),
    };
  });

  const passRates = input.signals.map(signal => signal.pass_rate);
  const flips = input.signals.map(signal => signal.flip_count);

  return {
    environment: input.environment,
    runner_os: input.runner_os,
    runner_arch: input.runner_arch,
    history_available: input.historyAvailable,
    history_runs: input.historyRuns,
    sample,
    aggregate: {
      tests: input.tests.length,
      failing: failing.length,
      avg_pass_rate:
        passRates.length === 0 ? null : passRates.reduce((sum, value) => sum + value, 0) / passRates.length,
      avg_flip_count: flips.length === 0 ? null : flips.reduce((sum, value) => sum + value, 0) / flips.length,
      environment_marker_tests: input.signals.filter(signal => signal.environment_marker_hits.length > 0).length,
    },
    note: UNTRUSTED_NOTE,
  };
}
