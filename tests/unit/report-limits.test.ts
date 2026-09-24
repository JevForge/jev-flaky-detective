import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadEvidence } from '../../src/collectors/load.js';

describe('report safety limits', () => {
  it('rejects a report above the configured byte limit with a clear source error', () => {
    const root = mkdtempSync(join(tmpdir(), 'report-limit-'));
    mkdirSync(join(root, 'reports'), { recursive: true });
    writeFileSync(
      join(root, 'reports', 'results.json'),
      JSON.stringify([{ test_id: 'x', status: 'failed', error_message: 'x'.repeat(100) }]),
    );

    const loaded = loadEvidence({
      workspace: root,
      resultsPath: 'reports/results.json',
      maxReportBytes: 32,
    });

    expect(loaded.current).toHaveLength(0);
    expect(loaded.sourceErrors[0]?.message).toContain('exceeds the maximum report size');
  });
});
