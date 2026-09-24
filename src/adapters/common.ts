import type { TestResult } from '../schemas/detective.js';
import type { TestStatus } from '../schemas/enums.js';
import { sanitizeError } from '../utils/sanitize.js';

export function normalizeStatus(raw: string | undefined): TestStatus {
  const value = (raw ?? '').toLowerCase();
  if (['pass', 'passed', 'success', 'successful', 'ok'].includes(value)) return 'passed';
  if (['fail', 'failed', 'failure', 'error', 'broken'].includes(value)) return 'failed';
  if (['skip', 'skipped', 'pending', 'todo', 'disabled'].includes(value)) return 'skipped';
  if (['timeout', 'timedout', 'timed_out', 'timed-out'].includes(value)) return 'timedOut';
  if (['interrupted', 'aborted', 'cancelled', 'canceled'].includes(value)) return 'interrupted';
  return 'unknown';
}

export function makeTestId(parts: Array<string | undefined>): string {
  const joined = parts
    .filter((part): part is string => Boolean(part && part.trim()))
    .map(part => part.trim().replace(/\s+/g, ' '))
    .join(' › ')
    .slice(0, 512);
  return joined || 'unknown-test';
}

export function toTestResult(input: {
  test_id?: string;
  name?: string;
  suite?: string;
  file?: string;
  status: string;
  duration_ms?: number;
  error_message?: string;
  error_type?: string;
  stack_snippet?: string;
  retries?: number;
  attempt?: number;
  tags?: string[];
  timestamp?: string;
  source?: string;
}): TestResult {
  const name = input.name?.trim() || input.test_id?.trim() || 'unnamed';
  const testId = input.test_id?.trim() || makeTestId([input.suite, input.file, name]);
  return {
    test_id: testId.slice(0, 512),
    name: name.slice(0, 1024),
    suite: input.suite?.slice(0, 1024),
    file: input.file?.slice(0, 1024),
    status: normalizeStatus(input.status),
    duration_ms: typeof input.duration_ms === 'number' && Number.isFinite(input.duration_ms) ? input.duration_ms : undefined,
    error_message: sanitizeError(input.error_message),
    error_type: input.error_type?.slice(0, 256),
    stack_snippet: sanitizeError(input.stack_snippet, 1500),
    retries: input.retries,
    attempt: input.attempt,
    tags: input.tags?.slice(0, 32),
    timestamp: input.timestamp?.slice(0, 64),
    source: input.source?.slice(0, 64),
  };
}
