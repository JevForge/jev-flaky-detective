import { describe, expect, it } from 'vitest';
import { runDetective } from '../../src/run.js';
import type { JevProvider } from '../../src/jev/contract.js';

describe('decision_mode deterministic', () => {
  it('classifies without calling Jev', async () => {
    let called = false;
    const provider: JevProvider = {
      id: 'vercel-ai-gateway',
      evaluateFailure: async () => {
        called = true;
        return { status: 'unavailable', message: 'should not be called' };
      },
    };
    const result = await runDetective({
      workspace: process.cwd(),
      current: [
        {
          test_id: 't',
          status: 'failed',
          file: 'src/a.ts',
          error_message: 'AssertionError',
        },
      ],
      history: [],
      changedPaths: ['src/a.ts'],
      sourceErrors: [],
      adapterSources: [],
      baseReasonCodes: [],
      truncated: false,
      provider,
      providerId: 'vercel-ai-gateway',
      options: {
        decision_mode: 'deterministic',
        dry_run: true,
        create_check_run: false,
        min_confidence: 0.5,
        low_confidence_policy: 'warn',
      },
    });
    expect(called).toBe(false);
    expect(result.outcome.decision.reason_codes).toContain('DETERMINISTIC_ONLY');
    expect(result.outcome.decision.failure_type).toBe('regression');
  });
});
