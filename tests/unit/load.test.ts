import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadEvidence } from '../../src/collectors/load.js';
import { fetchGithubTestHistory } from '../../src/collectors/github-history.js';

describe('loadEvidence', () => {
  it('loads junit + history from workspace', () => {
    const root = mkdtempSync(join(tmpdir(), 'flaky-'));
    mkdirSync(join(root, 'reports'), { recursive: true });
    mkdirSync(join(root, '.jev'), { recursive: true });
    writeFileSync(
      join(root, 'reports', 'junit.xml'),
      `<testsuite><testcase name="alpha" classname="S" time="0.1"><failure message="boom"/></testcase></testsuite>`,
    );
    writeFileSync(
      join(root, '.jev', 'test-history.json'),
      JSON.stringify({
        runs: [
          {
            run_id: '1',
            results: [{ test_id: 'S › alpha', name: 'alpha', status: 'passed' }],
          },
        ],
      }),
    );
    const loaded = loadEvidence({
      workspace: root,
      junitPath: 'reports/junit.xml',
      historyPath: '.jev/test-history.json',
    });
    expect(loaded.current.length).toBeGreaterThan(0);
    expect(loaded.history).toHaveLength(1);
    expect(loaded.adapterSources).toContain('junit');
  });
});

describe('github history client adapter', () => {
  it('maps workflow jobs into history runs', async () => {
    const { runs, reasonCodes } = await fetchGithubTestHistory({
      client: {
        async listWorkflowRuns() {
          return [{ id: 9, head_branch: 'main', conclusion: 'failure', created_at: '2026-01-01T00:00:00Z' }];
        },
        async listJobsForRun() {
          return [
            {
              name: 'test',
              conclusion: 'failure',
              steps: [{ name: 'Run unit', conclusion: 'failure' }],
            },
          ];
        },
      },
      owner: 'JevForge',
      repo: 'demo',
      lookback: 5,
      focusTestIds: [],
    });
    expect(runs).toHaveLength(1);
    expect(runs[0]?.results.length).toBeGreaterThan(0);
    expect(reasonCodes).toContain('GITHUB_HISTORY_FETCHED');
  });
});
