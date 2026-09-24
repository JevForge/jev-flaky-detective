import type { EvaluationState } from '../decision/evidence.js';
import { UNTRUSTED_NOTE } from '../schemas/enums.js';

export function buildFailureQuestions() {
  return {
    failure_type: {
      type: 'choice' as const,
      instructions: `${UNTRUSTED_NOTE} Classify the primary failure type for the sampled tests. Prefer environment when infra/timeout/network/resource markers dominate with mixed history. Prefer flaky when pass/fail flips across history. Prefer regression when failures are new or consecutive with path overlap. Prefer unknown when evidence is thin.`,
      criteria: {
        regression: 'Consistent or first failure tied to code change; low flip rate; consecutive failures.',
        flaky: 'Intermittent across history; meaningful flip count or mid-range pass rate.',
        environment: 'Timeouts, network, OOM, runner/infra markers dominate.',
        unknown: 'Insufficient history or ambiguous signals.',
      },
    },
    abstain: {
      type: 'boolean' as const,
      instructions:
        'Abstain when history is missing and markers conflict, or when the sample cannot support a type. Abstaining does not hide failures or re-run tests.',
    },
  };
}

export function summarizeState(state: EvaluationState) {
  return {
    environment: state.environment,
    runner_os: state.runner_os,
    runner_arch: state.runner_arch,
    history_available: state.history_available,
    history_runs: state.history_runs,
    sample: state.sample,
    aggregate: state.aggregate,
    note: state.note,
  };
}
