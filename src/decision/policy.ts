import {
  DetectiveDecisionSchema,
  type Classification,
  type DetectiveDecision,
  type SourceError,
  type TestResult,
  type TestSignals,
} from '../schemas/detective.js';
import type {
  FailureType,
  LowConfidencePolicy,
  ReasonCode,
  SourceErrorPolicy,
} from '../schemas/enums.js';
import type { JevCallResult } from '../jev/contract.js';
import { digestError, sanitizeSummary } from '../utils/sanitize.js';
import { heuristicFailureType } from '../collectors/signals.js';

export type ActionStatus = 'ok' | 'fail' | 'warn' | 'request-review' | 'no-op';

export interface PolicyOutcome {
  decision: DetectiveDecision;
  action_status: ActionStatus;
  needs_review: boolean;
}

function pushCode(codes: ReasonCode[], code: ReasonCode): void {
  if (!codes.includes(code) && codes.length < 32) codes.push(code);
}

function classifyReason(type: FailureType): ReasonCode {
  switch (type) {
    case 'regression':
      return 'CLASSIFIED_REGRESSION';
    case 'flaky':
      return 'CLASSIFIED_FLAKY';
    case 'environment':
      return 'CLASSIFIED_ENVIRONMENT';
    default:
      return 'CLASSIFIED_UNKNOWN';
  }
}

function signalsToReasons(signals: TestSignals, codes: ReasonCode[]): void {
  if (signals.current_status === 'failed' || signals.current_status === 'timedOut') {
    pushCode(codes, 'CURRENT_FAILURE');
  } else if (signals.current_status === 'passed') {
    pushCode(codes, 'CURRENT_PASS');
  }
  if (signals.history_count === 0) pushCode(codes, 'HISTORY_EMPTY');
  if (signals.flip_count >= 2) pushCode(codes, 'HIGH_FLIP_RATE');
  if (signals.pass_rate < 0.3 && signals.history_count >= 2) pushCode(codes, 'LOW_PASS_RATE');
  if (signals.pass_rate > 0.8) pushCode(codes, 'HIGH_PASS_RATE');
  if (signals.consecutive_failures >= 2) pushCode(codes, 'CONSECUTIVE_FAILURES');
  if (signals.first_failure) pushCode(codes, 'FIRST_FAILURE');
  if ((signals.same_error_ratio ?? 0) >= 0.8) pushCode(codes, 'STABLE_ERROR_SIGNATURE');
  if (signals.same_error_ratio !== null && signals.same_error_ratio < 0.5 && signals.fail_count >= 2) {
    pushCode(codes, 'CHANGING_ERROR_SIGNATURE');
  }
  if (signals.environment_marker_hits.length) pushCode(codes, 'ENVIRONMENT_MARKERS');
  if (signals.environment_marker_hits.includes('timeout')) pushCode(codes, 'TIMEOUT_MARKERS');
  if (signals.environment_marker_hits.includes('resource')) pushCode(codes, 'RESOURCE_MARKERS');
  if (signals.environment_marker_hits.includes('network')) pushCode(codes, 'NETWORK_MARKERS');
  if (signals.changed_path_overlap) pushCode(codes, 'CHANGED_PATH_OVERLAP');
}

export function buildClassifications(input: {
  tests: TestResult[];
  signals: TestSignals[];
  primaryType: FailureType;
  confidence: number;
  perTestOverride?: Map<string, FailureType>;
}): Classification[] {
  const signalById = new Map(input.signals.map(signal => [signal.test_id, signal]));
  return input.tests.map(test => {
    const signals = signalById.get(test.test_id);
    const heuristic = signals ? heuristicFailureType(signals) : { failure_type: 'unknown' as const, confidence: 0.3 };
    const failureType = input.perTestOverride?.get(test.test_id) ?? heuristic.failure_type;
    // When Jev gave a primary type with confidence, bias failing tests toward it if heuristic agrees or is unknown
    const aligned =
      (test.status === 'failed' || test.status === 'timedOut') &&
      (heuristic.failure_type === 'unknown' || heuristic.failure_type === input.primaryType)
        ? input.primaryType
        : failureType;
    const codes: ReasonCode[] = ['NEVER_RERUN', 'NEVER_MASK'];
    if (signals) signalsToReasons(signals, codes);
    pushCode(codes, classifyReason(aligned));
    return {
      test_id: test.test_id,
      name: test.name,
      failure_type: aligned,
      confidence: Math.min(input.confidence || heuristic.confidence, 1),
      reason_codes: codes,
      evidence: signals,
      error_digest: digestError(test.error_message ?? test.stack_snippet),
    };
  });
}

function majorityType(classifications: Classification[]): FailureType {
  const counts: Record<FailureType, number> = {
    regression: 0,
    flaky: 0,
    environment: 0,
    unknown: 0,
  };
  for (const row of classifications) counts[row.failure_type] += 1;
  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] as FailureType) ?? 'unknown';
}

export function applyPolicy(input: {
  tests: TestResult[];
  signals: TestSignals[];
  jev: JevCallResult;
  minConfidence: number;
  lowConfidencePolicy: LowConfidencePolicy;
  sourceErrorPolicy: SourceErrorPolicy;
  sourceErrors: SourceError[];
  truncated: boolean;
  baseReasonCodes: ReasonCode[];
  provider?: DetectiveDecision['provider'];
}): PolicyOutcome {
  const codes: ReasonCode[] = [...input.baseReasonCodes];
  pushCode(codes, 'NEVER_RERUN');
  pushCode(codes, 'NEVER_MASK');
  if (input.truncated) pushCode(codes, 'TESTS_TRUNCATED');
  if (input.sourceErrors.length) pushCode(codes, 'SOURCE_UNAVAILABLE');
  if (input.tests.some(test => !test.file) === false && input.tests.every(test => !test.file)) {
    pushCode(codes, 'NO_CHANGED_PATHS');
  }

  let actionStatus: ActionStatus = 'ok';
  let needsReview = false;
  let provisional = false;
  let decision: DetectiveDecision['decision'] = 'CLASSIFY';
  let confidence = 0;
  let jevProposed: FailureType | null = null;
  let jevStatus: DetectiveDecision['jev_status'] = 'unavailable';
  let primary: FailureType = 'unknown';

  if (input.jev.status === 'evaluated') {
    jevStatus = 'evaluated';
    jevProposed = input.jev.failure_type;
    confidence = input.jev.confidence;
    primary = input.jev.failure_type;
    if (input.jev.abstain) {
      pushCode(codes, 'JEV_ABSTAIN');
      decision = 'ABSTAIN';
      provisional = true;
      primary = 'unknown';
    } else if (confidence < input.minConfidence) {
      pushCode(codes, 'LOW_CONFIDENCE');
      provisional = true;
      ({ decision, actionStatus, needsReview, primary } = applyLowConfidence(
        input.lowConfidencePolicy,
        primary,
        codes,
      ));
    } else {
      pushCode(codes, 'JEV_AGREED');
      pushCode(codes, classifyReason(primary));
    }
  } else if (input.jev.status === 'schema_rejected') {
    jevStatus = 'schema_rejected';
    pushCode(codes, 'SCHEMA_REJECTED');
    provisional = true;
    ({ decision, actionStatus, needsReview, primary } = applyLowConfidence(
      input.lowConfidencePolicy,
      'unknown',
      codes,
    ));
  } else {
    jevStatus = 'unavailable';
    pushCode(codes, 'JEV_UNAVAILABLE');
    provisional = true;
    // Deterministic fallback classification from heuristics — still provisional
    const classificationsPreview = buildClassifications({
      tests: input.tests,
      signals: input.signals,
      primaryType: 'unknown',
      confidence: 0,
    });
    primary = majorityType(classificationsPreview);
    ({ decision, actionStatus, needsReview, primary } = applyLowConfidence(
      input.lowConfidencePolicy,
      primary,
      codes,
    ));
  }

  if (input.sourceErrors.length && input.sourceErrorPolicy === 'fail' && actionStatus === 'ok') {
    actionStatus = 'fail';
    decision = decision === 'CLASSIFY' ? 'REQUEST_REVIEW' : decision;
    needsReview = true;
    pushCode(codes, 'POLICY_REQUEST_REVIEW');
  }

  const classifications = buildClassifications({
    tests: input.tests,
    signals: input.signals,
    primaryType: primary,
    confidence: confidence || 0.5,
  });
  if (decision === 'CLASSIFY') {
    primary = majorityType(classifications.filter(row => row.failure_type !== 'unknown')) || majorityType(classifications);
  }

  const summary = sanitizeSummary(
    decision === 'CLASSIFY'
      ? `Classified ${classifications.length} test(s); primary failure_type=${primary} (confidence=${confidence.toFixed(2)}).`
      : decision === 'REQUEST_REVIEW'
        ? `Review required before trusting failure classification (primary=${primary}).`
        : `Abstained from classifying failures (primary=${primary}). Failures were not masked or re-run.`,
  );

  const finalDecision = DetectiveDecisionSchema.parse({
    decision,
    failure_type: primary,
    classifications,
    confidence,
    reason_codes: codes,
    summary,
    provisional,
    provider: input.provider,
    jev_status: jevStatus,
    jev_proposed: jevProposed,
  });

  return {
    decision: finalDecision,
    action_status: actionStatus,
    needs_review: needsReview,
  };
}

function applyLowConfidence(
  policy: LowConfidencePolicy,
  primary: FailureType,
  codes: ReasonCode[],
): {
  decision: DetectiveDecision['decision'];
  actionStatus: ActionStatus;
  needsReview: boolean;
  primary: FailureType;
} {
  switch (policy) {
    case 'fail':
      pushCode(codes, 'POLICY_ABSTAIN');
      return { decision: 'ABSTAIN', actionStatus: 'fail', needsReview: false, primary: 'unknown' };
    case 'request-review':
      pushCode(codes, 'POLICY_REQUEST_REVIEW');
      return { decision: 'REQUEST_REVIEW', actionStatus: 'request-review', needsReview: true, primary };
    case 'no-op':
      pushCode(codes, 'POLICY_NO_OP');
      return { decision: 'ABSTAIN', actionStatus: 'no-op', needsReview: false, primary: 'unknown' };
    case 'warn':
    default:
      pushCode(codes, 'POLICY_ABSTAIN');
      return { decision: 'ABSTAIN', actionStatus: 'warn', needsReview: false, primary };
  }
}
