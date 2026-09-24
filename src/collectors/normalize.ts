import { TestResultSchema, HistoryRunSchema, type HistoryRun, type TestResult } from '../schemas/detective.js';
import { toTestResult } from '../adapters/common.js';

export function parseResultsPayload(raw: unknown): TestResult[] {
  const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (Array.isArray(value)) {
    return value.map(item => TestResultSchema.parse(normalizeLooseResult(item)));
  }
  if (value && typeof value === 'object' && Array.isArray((value as { results?: unknown }).results)) {
    return ((value as { results: unknown[] }).results).map(item =>
      TestResultSchema.parse(normalizeLooseResult(item)),
    );
  }
  throw new Error('results must be a JSON array or { results: [] }');
}

export function parseHistoryPayload(raw: unknown): HistoryRun[] {
  const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const runs = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { runs?: unknown }).runs)
      ? (value as { runs: unknown[] }).runs
      : null;
  if (!runs) throw new Error('history must be a JSON array or { runs: [] }');
  return runs.map(run => HistoryRunSchema.parse(normalizeLooseRun(run)));
}

function normalizeLooseResult(item: unknown): TestResult {
  if (!item || typeof item !== 'object') throw new Error('invalid test result entry');
  const row = item as Record<string, unknown>;
  return toTestResult({
    test_id: typeof row.test_id === 'string' ? row.test_id : undefined,
    name: typeof row.name === 'string' ? row.name : undefined,
    suite: typeof row.suite === 'string' ? row.suite : undefined,
    file: typeof row.file === 'string' ? row.file : undefined,
    status: typeof row.status === 'string' ? row.status : 'unknown',
    duration_ms: typeof row.duration_ms === 'number' ? row.duration_ms : undefined,
    error_message: typeof row.error_message === 'string' ? row.error_message : undefined,
    error_type: typeof row.error_type === 'string' ? row.error_type : undefined,
    stack_snippet: typeof row.stack_snippet === 'string' ? row.stack_snippet : undefined,
    retries: typeof row.retries === 'number' ? row.retries : undefined,
    attempt: typeof row.attempt === 'number' ? row.attempt : undefined,
    tags: Array.isArray(row.tags) ? row.tags.filter((t): t is string => typeof t === 'string') : undefined,
    timestamp: typeof row.timestamp === 'string' ? row.timestamp : undefined,
    source: typeof row.source === 'string' ? row.source : undefined,
  });
}

function normalizeLooseRun(item: unknown): HistoryRun {
  if (!item || typeof item !== 'object') throw new Error('invalid history run entry');
  const row = item as Record<string, unknown>;
  const resultsRaw = Array.isArray(row.results) ? row.results : [];
  return {
    run_id: String(row.run_id ?? row.id ?? `run-${Math.random().toString(36).slice(2, 10)}`).slice(0, 128),
    started_at: typeof row.started_at === 'string' ? row.started_at : undefined,
    head_branch: typeof row.head_branch === 'string' ? row.head_branch : undefined,
    head_sha: typeof row.head_sha === 'string' ? row.head_sha : undefined,
    conclusion:
      row.conclusion === 'success' ||
      row.conclusion === 'failure' ||
      row.conclusion === 'cancelled' ||
      row.conclusion === 'skipped' ||
      row.conclusion === 'unknown'
        ? row.conclusion
        : undefined,
    results: resultsRaw.map(result => normalizeLooseResult(result)),
  };
}

export function mergeResults(groups: TestResult[][]): TestResult[] {
  const map = new Map<string, TestResult>();
  for (const group of groups) {
    for (const result of group) {
      const existing = map.get(result.test_id);
      if (!existing) {
        map.set(result.test_id, result);
        continue;
      }
      // Prefer failed over passed when merging concurrent sources for the same id
      const preferFail =
        (result.status === 'failed' || result.status === 'timedOut') &&
        existing.status !== 'failed' &&
        existing.status !== 'timedOut';
      map.set(result.test_id, preferFail ? { ...existing, ...result } : { ...result, ...existing });
    }
  }
  return [...map.values()];
}
