import { describe, expect, it } from 'vitest';
import { digestError, redactSecrets } from '../../src/utils/sanitize.js';

describe('stable error fingerprints and redaction', () => {
  it('ignores volatile stack details but preserves error type and message meaning', () => {
    const first = digestError(
      'AssertionError: expected 200, received 500\n    at login (/workspace/src/auth.ts:42:18)\n    requestId=550e8400-e29b-41d4-a716-446655440000',
    );
    const second = digestError(
      'AssertionError: expected 200, received 500\n    at login (/runner/src/auth.ts:99:4)\n    requestId=123e4567-e89b-12d3-a456-426614174000',
    );
    const changedType = digestError('TimeoutError: expected 200, received 500\n at login (/runner/src/auth.ts:99:4)');

    expect(first).toBe(second);
    expect(first).not.toBe(changedType);
  });

  it('redacts URL credentials, sensitive query parameters, and connection strings', () => {
    const sanitized = redactSecrets(
      'https://user:pass@example.test/path?token=abc123&keep=ok postgres://dbuser:dbpass@db.test:5432/app Authorization: Bearer abcdefghijklmnop',
    );

    expect(sanitized).not.toMatch(/pass|abc123|dbpass|abcdefghijklmnop/);
    expect(sanitized).toContain('[REDACTED]');
    expect(sanitized).toContain('keep=ok');
  });
});
