import { describe, expect, it } from 'vitest';
import { interpretEvaluation } from '../../src/jev/normalize.js';
import { DetectiveDecisionSchema } from '../../src/schemas/detective.js';
import { applyPolicy } from '../../src/decision/policy.js';
import type { TestResult, TestSignals } from '../../src/schemas/detective.js';

describe('decision contract', () => {
  it('accepts valid Jev choice answers', () => {
    const result = interpretEvaluation({
      answers: {
        failure_type: { type: 'choice', choice: 'flaky', confidence: 0.91 },
        abstain: { type: 'boolean', probability: 0.1 },
      },
    });
    expect(result.status).toBe('evaluated');
    if (result.status === 'evaluated') {
      expect(result.failure_type).toBe('flaky');
      expect(result.confidence).toBeGreaterThan(0.9);
    }
  });

  it('rejects invalid failure_type values', () => {
    const result = interpretEvaluation({
      answers: {
        failure_type: { type: 'choice', choice: 'rerun_please' },
      },
    });
    expect(result.status).toBe('schema_rejected');
  });

  it('rejects missing choice', () => {
    expect(interpretEvaluation({ answers: {} }).status).toBe('schema_rejected');
  });

  it('policy never invents shell commands from summary and keeps NEVER_MASK', () => {
    const tests: TestResult[] = [{ test_id: 'a', status: 'failed', error_message: 'x' }];
    const signals: TestSignals[] = [
      {
        test_id: 'a',
        current_status: 'failed',
        history_count: 0,
        fail_count: 1,
        pass_count: 0,
        skip_count: 0,
        pass_rate: 0,
        flip_count: 0,
        consecutive_failures: 1,
        first_failure: true,
        same_error_ratio: null,
        environment_marker_hits: [],
        changed_path_overlap: false,
        avg_duration_ms: null,
        duration_spike: false,
      },
    ];
    const outcome = applyPolicy({
      tests,
      signals,
      jev: { status: 'evaluated', failure_type: 'regression', confidence: 0.95, abstain: false, explanation: 'ok' },
      minConfidence: 0.7,
      lowConfidencePolicy: 'warn',
      sourceErrorPolicy: 'warn',
      sourceErrors: [],
      truncated: false,
      baseReasonCodes: [],
      provider: 'vercel-ai-gateway',
    });
    const parsed = DetectiveDecisionSchema.parse(outcome.decision);
    expect(parsed.reason_codes).toContain('NEVER_MASK');
    expect(parsed.reason_codes).toContain('NEVER_RERUN');
    expect(parsed.summary).not.toMatch(/rm -rf|curl |eval\(/i);
  });
});
