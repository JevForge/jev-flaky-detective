import { describe, expect, it } from 'vitest';
import { buildClassifications, applyPolicy } from '../../src/decision/policy.js';
import type { TestResult, TestSignals } from '../../src/schemas/detective.js';

function signals(overrides: Partial<TestSignals> = {}): TestSignals {
  return {
    test_id: 't',
    current_status: 'failed',
    history_count: 4,
    fail_count: 2,
    pass_count: 2,
    skip_count: 0,
    pass_rate: 0.5,
    flip_count: 2,
    consecutive_failures: 1,
    first_failure: false,
    same_error_ratio: 1,
    environment_marker_hits: [],
    changed_path_overlap: false,
    avg_duration_ms: null,
    duration_spike: false,
    ...overrides,
  };
}

describe('public heuristic signals', () => {
  it('exposes heuristic type and a signal-only suggested action per test', () => {
    const test: TestResult = { test_id: 't', status: 'failed' };
    const classification = buildClassifications({
      tests: [test],
      signals: [signals()],
      primaryType: 'flaky',
      confidence: 0.9,
    })[0]!;

    expect(classification.heuristic_failure_type).toBe('flaky');
    expect(classification.heuristic_confidence).toBeGreaterThan(0);
    expect(classification.suggested_action).toBe('ignore-for-gate');
  });

  it('keeps heuristic and Jev proposal side by side in the decision', () => {
    const outcome = applyPolicy({
      tests: [{ test_id: 't', status: 'failed' }],
      signals: [signals()],
      jev: { status: 'evaluated', failure_type: 'regression', confidence: 0.95, abstain: false, explanation: 'new code' },
      minConfidence: 0.7,
      lowConfidencePolicy: 'warn',
      sourceErrorPolicy: 'warn',
      sourceErrors: [],
      truncated: false,
      baseReasonCodes: [],
      provider: 'vercel-ai-gateway',
    });

    expect(outcome.decision.heuristic_failure_type).toBe('flaky');
    expect(outcome.decision.jev_proposed).toBe('regression');
    expect(outcome.decision.suggested_action).toBe('ignore-for-gate');
  });
});
