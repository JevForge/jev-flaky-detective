import {
  EvidenceSummarySchema,
  RunOptionsSchema,
  type EvidenceSummary,
  type HistoryRun,
  type RunOptions,
  type SourceError,
  type TestResult,
} from './schemas/detective.js';
import type { JevProviderId, ReasonCode } from './schemas/enums.js';
import { JEV_PROVIDERS } from './schemas/enums.js';
import { computeSignals, heuristicFailureType } from './collectors/signals.js';
import { buildEvaluationState } from './decision/evidence.js';
import { applyPolicy, type ActionStatus, type PolicyOutcome } from './decision/policy.js';
import type { JevProvider } from './jev/contract.js';
import { buildFailureQuestions } from './jev/questions.js';
import { maybePostComment, type CommentClient } from './executors/comment.js';
import { maybeCreateCheckRun, type CheckRunClient } from './executors/check-run.js';
import { writeArtifactReports } from './executors/artifacts.js';
import { planEffects } from './executors/effects.js';

export interface RunDetectiveParams {
  workspace: string;
  current: TestResult[];
  history: HistoryRun[];
  changedPaths: string[];
  sourceErrors: SourceError[];
  adapterSources: string[];
  baseReasonCodes: ReasonCode[];
  truncated: boolean;
  options: Partial<RunOptions>;
  provider: JevProvider;
  providerId: JevProviderId;
  commentClient?: CommentClient | null;
  checkRunClient?: CheckRunClient | null;
  headSha?: string | null;
}

export interface RunDetectiveResult {
  outcome: PolicyOutcome;
  evidence: EvidenceSummary;
  effects: ReturnType<typeof planEffects>;
  commentStatus: 'posted' | 'updated' | 'dry-run' | 'skipped';
  checkStatus: 'created' | 'dry-run' | 'skipped';
  artifactPaths: { markdownPath: string | null; jsonPath: string | null };
  actionStatus: ActionStatus;
}

export async function runDetective(params: RunDetectiveParams): Promise<RunDetectiveResult> {
  const startedAt = Date.now();
  const options = RunOptionsSchema.parse(params.options);

  let tests = [...params.current];
  if (options.test_id) {
    tests = tests.filter(test => test.test_id === options.test_id || test.name === options.test_id);
  }
  if (options.failing_only) {
    const failing = tests.filter(
      test => test.status === 'failed' || test.status === 'timedOut' || test.status === 'interrupted',
    );
    if (failing.length > 0) tests = failing;
  }
  let truncated = params.truncated;
  if (tests.length > options.max_tests) {
    tests = tests.slice(0, options.max_tests);
    truncated = true;
  }

  const signals = tests.map(test =>
    computeSignals(test, params.history, options.history_lookback, params.changedPaths),
  );
  const heuristics = signals.map(signal => {
    const h = heuristicFailureType(signal);
    return { test_id: signal.test_id, failure_type: h.failure_type, confidence: h.confidence };
  });

  const state = buildEvaluationState({
    environment: options.environment,
    runner_os: options.runner_os,
    runner_arch: options.runner_arch,
    historyRuns: params.history.length,
    historyAvailable: params.history.length > 0,
    tests,
    signals,
    heuristics,
    maxSample: options.max_tests_to_jev,
  });

  let baseReasonCodes = [...params.baseReasonCodes];
  let jev;
  if (options.decision_mode === 'deterministic') {
    baseReasonCodes.push('DETERMINISTIC_ONLY');
    const counts: Record<string, number> = { regression: 0, flaky: 0, environment: 0, unknown: 0 };
    let confSum = 0;
    for (const row of heuristics) {
      counts[row.failure_type] = (counts[row.failure_type] ?? 0) + 1;
      confSum += row.confidence;
    }
    const failure_type = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ??
      'unknown') as 'regression' | 'flaky' | 'environment' | 'unknown';
    const confidence = heuristics.length === 0 ? 0 : confSum / heuristics.length;
    jev = {
      status: 'evaluated' as const,
      failure_type,
      confidence,
      abstain: false,
      explanation: 'Deterministic heuristics only (decision_mode=deterministic)',
    };
  } else {
    jev = await params.provider.evaluateFailure({
      state,
      questions: buildFailureQuestions(),
    });
  }

  const outcome = applyPolicy({
    tests,
    signals,
    jev,
    minConfidence: options.min_confidence,
    lowConfidencePolicy: options.low_confidence_policy,
    sourceErrorPolicy: options.source_error_policy,
    sourceErrors: params.sourceErrors,
    truncated,
    baseReasonCodes,
    provider: params.providerId,
  });

  const evidence = EvidenceSummarySchema.parse({
    tests_considered: tests.length,
    failing_count: tests.filter(
      test => test.status === 'failed' || test.status === 'timedOut' || test.status === 'interrupted',
    ).length,
    history_runs: params.history.length,
    history_available: params.history.length > 0,
    avg_pass_rate: state.aggregate.avg_pass_rate,
    avg_flip_count: state.aggregate.avg_flip_count,
    environment_marker_tests: state.aggregate.environment_marker_tests,
    changed_path_overlap_tests: signals.filter(signal => signal.changed_path_overlap).length,
    adapter_sources: params.adapterSources,
    duration_ms: Date.now() - startedAt,
  });

  const effects = planEffects({
    decision: outcome.decision,
    actionStatus: outcome.action_status,
    comment: options.comment_on_github,
    checkRun: options.create_check_run,
  });

  const commentStatus = await maybePostComment(
    options.comment_on_github,
    options.dry_run,
    outcome.decision,
    params.commentClient ?? null,
  );

  const checkStatus = await maybeCreateCheckRun(
    options.create_check_run,
    options.dry_run,
    params.headSha ?? null,
    outcome.decision,
    outcome.action_status,
    params.checkRunClient ?? null,
  );

  const artifactPaths =
    !options.dry_run && options.write_report_artifact
      ? (() => {
          const paths = writeArtifactReports({
            workspace: params.workspace,
            decision: outcome.decision,
            evidence,
          });
          return { markdownPath: paths.markdownPath, jsonPath: paths.jsonPath };
        })()
      : { markdownPath: null, jsonPath: null };

  return {
    outcome,
    evidence,
    effects,
    commentStatus,
    checkStatus,
    artifactPaths,
    actionStatus: outcome.action_status,
  };
}

export function parseProviderId(raw: string | undefined, fallback: JevProviderId = 'vercel-ai-gateway'): JevProviderId {
  const value = (raw || fallback).trim();
  if (!(JEV_PROVIDERS as readonly string[]).includes(value)) {
    throw new Error(
      `[JEV Flaky Detective] Unsupported jev_provider: ${value}. Use vercel-ai-gateway, typesafe-native, or custom-compatible.`,
    );
  }
  return value as JevProviderId;
}
