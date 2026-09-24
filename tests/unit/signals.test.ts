import { describe, expect, it } from 'vitest';
import { computeSignals, heuristicFailureType } from '../../src/collectors/signals.js';
import type { HistoryRun, TestResult } from '../../src/schemas/detective.js';

function fail(id: string, message?: string): TestResult {
  return { test_id: id, name: id, status: 'failed', error_message: message };
}
function pass(id: string): TestResult {
  return { test_id: id, name: id, status: 'passed' };
}

describe('signals', () => {
  it('detects flaky flip patterns', () => {
    const history: HistoryRun[] = [
      { run_id: '1', results: [pass('t')] },
      { run_id: '2', results: [fail('t')] },
      { run_id: '3', results: [pass('t')] },
      { run_id: '4', results: [fail('t')] },
    ];
    const signals = computeSignals(fail('t'), history, 20, []);
    expect(signals.flip_count).toBeGreaterThanOrEqual(2);
    expect(heuristicFailureType(signals).failure_type).toBe('flaky');
  });

  it('detects environment markers', () => {
    const signals = computeSignals(
      fail('t', 'Error: connect ECONNREFUSED 127.0.0.1:5432'),
      [
        { run_id: '1', results: [pass('t')] },
        { run_id: '2', results: [fail('t', 'ECONNREFUSED')] },
      ],
      20,
      [],
    );
    expect(signals.environment_marker_hits).toContain('network');
    expect(heuristicFailureType(signals).failure_type).toBe('environment');
  });

  it('detects regression with path overlap', () => {
    const current: TestResult = {
      test_id: 't',
      name: 't',
      file: 'src/foo.ts',
      status: 'failed',
      error_message: 'AssertionError',
    };
    const signals = computeSignals(current, [], 20, ['src/foo.ts']);
    expect(signals.first_failure).toBe(true);
    expect(signals.changed_path_overlap).toBe(true);
    expect(heuristicFailureType(signals).failure_type).toBe('regression');
  });
});
