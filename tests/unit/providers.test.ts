import { describe, expect, it } from 'vitest';
import { assertPublicHttpsEndpoint } from '../../src/utils/endpoint.js';
import { redactSecrets, sanitizeSummary } from '../../src/utils/sanitize.js';
import { createJevProvider } from '../../src/jev/factory.js';

describe('providers and hygiene', () => {
  it('blocks private endpoints', () => {
    expect(assertPublicHttpsEndpoint('http://example.com').ok).toBe(false);
    expect(assertPublicHttpsEndpoint('https://127.0.0.1/eval').ok).toBe(false);
    expect(assertPublicHttpsEndpoint('https://api.example.com/v1').ok).toBe(true);
  });

  it('redacts secrets from summaries', () => {
    expect(redactSecrets('token=ghp_abcdefghijklmnopqrstuvwxyz012345')).toContain('[REDACTED]');
    expect(sanitizeSummary('line1\nBearer sk-abc12345678901234567890')).not.toMatch(/sk-/);
  });

  it('creates each provider without silent fallback', () => {
    expect(createJevProvider('vercel-ai-gateway', { timeoutMs: 1000 }).id).toBe('vercel-ai-gateway');
    expect(createJevProvider('typesafe-native', { timeoutMs: 1000 }).id).toBe('typesafe-native');
    expect(createJevProvider('custom-compatible', { timeoutMs: 1000 }).id).toBe('custom-compatible');
  });

  it('custom provider reports unavailable without key/endpoint', async () => {
    const provider = createJevProvider('custom-compatible', { timeoutMs: 1000 });
    const result = await provider.evaluateFailure({
      state: {
        environment: 'ci',
        history_available: false,
        history_runs: 0,
        sample: [],
        aggregate: {
          tests: 0,
          failing: 0,
          avg_pass_rate: null,
          avg_flip_count: null,
          environment_marker_tests: 0,
        },
        note: 'x',
      },
      questions: {
        failure_type: {
          type: 'choice',
          instructions: 'x',
          criteria: { regression: 'a', flaky: 'b', environment: 'c', unknown: 'd' },
        },
      },
    });
    expect(result.status).toBe('unavailable');
  });
});
