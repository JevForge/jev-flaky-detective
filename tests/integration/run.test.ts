import { describe, expect, it } from 'vitest';
import { runDetective } from '../../src/run.js';
import type { JevProvider } from '../../src/jev/contract.js';
import type { HistoryRun, TestResult } from '../../src/schemas/detective.js';

function provider(result: Awaited<ReturnType<JevProvider['evaluateFailure']>>): JevProvider {
  return {
    id: 'vercel-ai-gateway',
    evaluateFailure: async () => result,
  };
}

describe('runDetective integration', () => {
  it('classifies flaky when Jev agrees', async () => {
    const current: TestResult[] = [{ test_id: 'login', name: 'login', status: 'failed', error_message: 'flake' }];
    const history: HistoryRun[] = [
      { run_id: '1', results: [{ test_id: 'login', status: 'passed' }] },
      { run_id: '2', results: [{ test_id: 'login', status: 'failed' }] },
      { run_id: '3', results: [{ test_id: 'login', status: 'passed' }] },
    ];
    const result = await runDetective({
      workspace: process.cwd(),
      current,
      history,
      changedPaths: [],
      sourceErrors: [],
      adapterSources: [],
      baseReasonCodes: ['HISTORY_AVAILABLE'],
      truncated: false,
      provider: provider({
        status: 'evaluated',
        failure_type: 'flaky',
        confidence: 0.88,
        abstain: false,
        explanation: 'flips',
      }),
      providerId: 'vercel-ai-gateway',
      options: {
        dry_run: true,
        create_check_run: false,
        comment_on_github: false,
        min_confidence: 0.7,
        low_confidence_policy: 'warn',
      },
    });
    expect(result.outcome.decision.decision).toBe('CLASSIFY');
    expect(result.outcome.decision.failure_type).toBe('flaky');
    expect(result.outcome.decision.provisional).toBe(false);
  });

  it('applies low-confidence warn policy when Jev unavailable', async () => {
    const result = await runDetective({
      workspace: process.cwd(),
      current: [{ test_id: 'x', status: 'failed' }],
      history: [],
      changedPaths: [],
      sourceErrors: [],
      adapterSources: [],
      baseReasonCodes: [],
      truncated: false,
      provider: provider({ status: 'unavailable', message: 'down' }),
      providerId: 'vercel-ai-gateway',
      options: {
        dry_run: true,
        create_check_run: false,
        low_confidence_policy: 'warn',
      },
    });
    expect(result.outcome.decision.decision).toBe('ABSTAIN');
    expect(result.outcome.decision.provisional).toBe(true);
    expect(result.actionStatus).toBe('warn');
    expect(result.outcome.decision.reason_codes).toContain('JEV_UNAVAILABLE');
  });
});
