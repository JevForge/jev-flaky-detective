import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { appendTestHistory, loadResultsForAppend } from '../../src/history/append.js';

describe('appendTestHistory', () => {
  it('creates and appends newest-first history runs', () => {
    const root = mkdtempSync(join(tmpdir(), 'hist-'));
    const historyPath = '.jev/test-history.json';
    const first = appendTestHistory({
      workspace: root,
      historyPath,
      runId: '1',
      results: [{ test_id: 'a', status: 'passed' }],
      conclusion: 'success',
      maxRuns: 2,
    });
    expect(first.runs).toBe(1);
    expect(existsSync(first.path)).toBe(true);

    appendTestHistory({
      workspace: root,
      historyPath,
      runId: '2',
      results: [{ test_id: 'a', status: 'failed', error_message: 'x' }],
      conclusion: 'failure',
      maxRuns: 2,
    });
    appendTestHistory({
      workspace: root,
      historyPath,
      runId: '3',
      results: [{ test_id: 'a', status: 'passed' }],
      maxRuns: 2,
    });

    const parsed = JSON.parse(readFileSync(first.path, 'utf8')) as { runs: Array<{ run_id: string }> };
    expect(parsed.runs).toHaveLength(2);
    expect(parsed.runs[0]?.run_id).toBe('3');
    expect(parsed.runs.map(r => r.run_id)).not.toContain('1');
  });

  it('loads results from inline JSON', () => {
    const results = loadResultsForAppend(process.cwd(), JSON.stringify([{ test_id: 't', status: 'failed' }]));
    expect(results).toHaveLength(1);
  });
});
