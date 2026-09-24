import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { loadJevConfig } from '../../src/collectors/config.js';
import { createOctokitHistoryClient } from '../../src/collectors/github-history.js';
import { loadEvidence } from '../../src/collectors/load.js';
import { parseResultsPayload, parseHistoryPayload, mergeResults } from '../../src/collectors/normalize.js';
import { emitOutputs } from '../../src/github/outputs.js';
import { maybePostComment, renderComment, MARKER } from '../../src/executors/comment.js';
import { maybeCreateCheckRun, conclusionFor } from '../../src/executors/check-run.js';
import { writeArtifactReports } from '../../src/executors/artifacts.js';
import { createVercelAiGatewayProvider } from '../../src/jev/vercel-ai-gateway.js';
import { createHttpProvider } from '../../src/jev/http-evaluate.js';
import { assertInsideWorkspace, expandPathList, resolveReportPaths } from '../../src/utils/paths.js';
import { applyPolicy } from '../../src/decision/policy.js';
import type { DetectiveDecision, TestResult, TestSignals } from '../../src/schemas/detective.js';
import { credentialEnvName } from '../../src/jev/factory.js';

describe('config + normalize + paths', () => {
  it('loads jev config yaml', () => {
    const root = mkdtempSync(join(tmpdir(), 'cfg-'));
    mkdirSync(join(root, '.jev'), { recursive: true });
    writeFileSync(
      join(root, '.jev', 'config.yml'),
      'jev_provider: typesafe-native\njev_model: demo/jev\nmin_confidence: 0.8\n',
    );
    expect(loadJevConfig(root, '.jev/config.yml')).toMatchObject({
      jev_provider: 'typesafe-native',
      jev_model: 'demo/jev',
      min_confidence: 0.8,
    });
    expect(loadJevConfig(root, '.jev/missing.yml')).toEqual({});
  });

  it('parses payloads and merges preferring failures', () => {
    const results = parseResultsPayload({
      results: [{ test_id: 'a', status: 'passed' }, { test_id: 'b', status: 'failed' }],
    });
    expect(results).toHaveLength(2);
    const history = parseHistoryPayload([{ run_id: '1', results: [{ test_id: 'a', status: 'passed' }] }]);
    expect(history[0]?.run_id).toBe('1');
    const merged = mergeResults([
      [{ test_id: 'a', status: 'passed' }],
      [{ test_id: 'a', status: 'failed', error_message: 'x' }],
    ]);
    expect(merged[0]?.status).toBe('failed');
  });

  it('resolves paths inside workspace', () => {
    const root = mkdtempSync(join(tmpdir(), 'path-'));
    mkdirSync(join(root, 'r'), { recursive: true });
    writeFileSync(join(root, 'r', 'a.json'), '{}');
    expect(expandPathList('a\nb,c')).toEqual(['a', 'b', 'c']);
    expect(resolveReportPaths(root, ['r/*.json']).length).toBe(1);
    expect(() => assertInsideWorkspace(root, '../outside')).toThrow();
  });
});

describe('executors + outputs', () => {
  const decision: DetectiveDecision = {
    decision: 'CLASSIFY',
    failure_type: 'flaky',
    classifications: [
      {
        test_id: 't1',
        failure_type: 'flaky',
        confidence: 0.9,
        reason_codes: ['NEVER_RERUN', 'NEVER_MASK', 'CLASSIFIED_FLAKY'],
      },
    ],
    confidence: 0.9,
    reason_codes: ['NEVER_RERUN', 'NEVER_MASK'],
    summary: 'ok',
    provisional: false,
    jev_status: 'evaluated',
    jev_proposed: 'flaky',
  };

  it('renders comment and posts via client', async () => {
    expect(renderComment(decision)).toContain(MARKER);
    const status = await maybePostComment(true, false, decision, {
      upsertComment: async () => 'posted',
    });
    expect(status).toBe('posted');
    expect(await maybePostComment(false, false, decision, null)).toBe('skipped');
    expect(await maybePostComment(true, true, decision, null)).toBe('dry-run');
  });

  it('creates check runs and writes artifacts', async () => {
    expect(conclusionFor(decision, 'ok')).toBe('success');
    expect(conclusionFor(decision, 'fail')).toBe('failure');
    const created = await maybeCreateCheckRun(true, false, 'abc', decision, 'ok', {
      createCheckRun: async () => undefined,
    });
    expect(created).toBe('created');
    const root = mkdtempSync(join(tmpdir(), 'art-'));
    const paths = writeArtifactReports({
      workspace: root,
      decision,
      evidence: {
        tests_considered: 1,
        failing_count: 1,
        history_runs: 0,
        history_available: false,
        avg_pass_rate: null,
        avg_flip_count: null,
        environment_marker_tests: 0,
        changed_path_overlap_tests: 0,
        adapter_sources: [],
      },
    });
    expect(paths.markdownPath).toContain('flaky-detective.md');

    const outputs: Record<string, string> = {};
    emitOutputs({
      writer: { setOutput: (name, value) => { outputs[name] = value; } },
      decision,
      evidence: {
        tests_considered: 1,
        failing_count: 1,
        history_runs: 0,
        history_available: false,
        avg_pass_rate: 0.5,
        avg_flip_count: 1,
        environment_marker_tests: 0,
        changed_path_overlap_tests: 0,
        adapter_sources: ['junit'],
      },
      actionStatus: 'ok',
      needsReview: false,
      checkStatus: 'created',
      reportMarkdownFile: paths.markdownPath,
      reportJsonFile: paths.jsonPath,
      provider: 'vercel-ai-gateway',
      workspace: root,
    });
    expect(outputs.failure_type).toBe('flaky');
    expect(outputs.jev_provider).toBe('vercel-ai-gateway');
  });
});

describe('jev providers http + gateway', () => {
  it('maps credential env names', () => {
    expect(credentialEnvName('vercel-ai-gateway')).toBe('AI_GATEWAY_API_KEY');
    expect(credentialEnvName('typesafe-native')).toBe('TYPESAFE_API_KEY');
    expect(credentialEnvName('custom-compatible')).toBe('JEV_CUSTOM_API_KEY');
  });

  it('evaluates via mocked gateway', async () => {
    const provider = createVercelAiGatewayProvider({
      apiKey: 'key',
      timeoutMs: 1000,
      evaluateImpl: async () => ({
        answers: {
          failure_type: { type: 'choice', choice: 'regression', confidence: 0.95 },
          abstain: { type: 'boolean', probability: 0.01 },
        },
        providerMetadata: { typesafe: { confidence: { failure_type: 0.95 } } },
      }),
    });
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
        note: 'n',
      },
      questions: {
        failure_type: {
          type: 'choice',
          instructions: 'x',
          criteria: { regression: 'a', flaky: 'b', environment: 'c', unknown: 'd' },
        },
      },
    });
    expect(result.status).toBe('evaluated');
  });

  it('posts typed evaluation over fetch', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        answers: {
          failure_type: { type: 'choice', choice: 'unknown', confidence: 0.5 },
          abstain: { type: 'boolean', probability: 0.2 },
        },
      }),
    })) as unknown as typeof fetch;
    const provider = createHttpProvider('custom-compatible', {
      apiKey: 'k',
      endpoint: 'https://api.example.com/evaluate',
      model: 'demo/jev',
      timeoutMs: 2000,
      fetchImpl,
    });
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
        note: 'n',
      },
      questions: {
        failure_type: {
          type: 'choice',
          instructions: 'x',
          criteria: { regression: 'a', flaky: 'b', environment: 'c', unknown: 'd' },
        },
      },
    });
    expect(result.status).toBe('evaluated');
    expect(fetchImpl).toHaveBeenCalled();
  });
});

describe('octokit history wrapper + policy modes', () => {
  it('wraps octokit list calls', async () => {
    const client = createOctokitHistoryClient({
      rest: {
        actions: {
          listWorkflowRunsForRepo: async () => ({
            data: {
              workflow_runs: [
                { id: 1, name: 'CI', head_branch: 'main', conclusion: 'failure', created_at: 't', head_sha: 'abc' },
              ],
            },
          }),
          listJobsForWorkflowRun: async () => ({
            data: {
              jobs: [{ name: 'test', conclusion: 'failure', steps: [{ name: 'Run', conclusion: 'failure' }] }],
            },
          }),
        },
      },
    });
    const runs = await client.listWorkflowRuns({
      owner: 'o',
      repo: 'r',
      workflowName: 'CI',
      perPage: 5,
    });
    expect(runs).toHaveLength(1);
    const jobs = await client.listJobsForRun({ owner: 'o', repo: 'r', runId: 1 });
    expect(jobs[0]?.steps?.length).toBe(1);
  });

  it('covers request-review and fail policies', () => {
    const tests: TestResult[] = [{ test_id: 'a', status: 'failed' }];
    const signals: TestSignals[] = [
      {
        test_id: 'a',
        current_status: 'failed',
        history_count: 0,
        fail_count: 1,
        pass_count: 0,
        skip_count: 0,
        pass_rate: 0,
        flip_count: 0,
        consecutive_failures: 1,
        first_failure: true,
        same_error_ratio: 1,
        environment_marker_hits: ['timeout'],
        changed_path_overlap: true,
        avg_duration_ms: 10,
        duration_spike: true,
      },
    ];
    const review = applyPolicy({
      tests,
      signals,
      jev: { status: 'schema_rejected', message: 'bad' },
      minConfidence: 0.9,
      lowConfidencePolicy: 'request-review',
      sourceErrorPolicy: 'fail',
      sourceErrors: [{ source: 'x', message: 'y' }],
      truncated: true,
      baseReasonCodes: [],
    });
    expect(review.decision.decision).toBe('REQUEST_REVIEW');
    expect(review.needs_review).toBe(true);

    const fail = applyPolicy({
      tests,
      signals,
      jev: { status: 'unavailable', message: 'down' },
      minConfidence: 0.9,
      lowConfidencePolicy: 'fail',
      sourceErrorPolicy: 'warn',
      sourceErrors: [],
      truncated: false,
      baseReasonCodes: [],
    });
    expect(fail.action_status).toBe('fail');

    const noop = applyPolicy({
      tests,
      signals,
      jev: {
        status: 'evaluated',
        failure_type: 'flaky',
        confidence: 0.2,
        abstain: false,
        explanation: 'low',
      },
      minConfidence: 0.9,
      lowConfidencePolicy: 'no-op',
      sourceErrorPolicy: 'warn',
      sourceErrors: [],
      truncated: false,
      baseReasonCodes: [],
    });
    expect(noop.action_status).toBe('no-op');
  });

  it('loads inline results and jest adapter files', () => {
    const root = mkdtempSync(join(tmpdir(), 'load2-'));
    mkdirSync(join(root, 'reports'), { recursive: true });
    writeFileSync(
      join(root, 'reports', 'jest.json'),
      JSON.stringify({
        testResults: [{ name: 'a.js', assertionResults: [{ fullName: 'x', status: 'failed', failureMessages: ['e'] }] }],
      }),
    );
    const loaded = loadEvidence({
      workspace: root,
      resultsInline: JSON.stringify([{ test_id: 'inline', status: 'failed' }]),
      jestPath: 'reports/jest.json',
      changedPathsRaw: 'src/a.ts\nsrc/b.ts',
    });
    expect(loaded.current.length).toBeGreaterThanOrEqual(2);
    expect(loaded.changedPaths).toContain('src/a.ts');
  });
});
