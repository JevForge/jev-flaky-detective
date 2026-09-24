import type { DetectiveDecision } from '../schemas/detective.js';
import type { ActionStatus } from '../decision/policy.js';

export interface CheckRunClient {
  createCheckRun(input: {
    name: string;
    headSha: string;
    conclusion: 'success' | 'neutral' | 'failure';
    title: string;
    summary: string;
  }): Promise<void>;
}

export function conclusionFor(
  decision: DetectiveDecision,
  actionStatus: ActionStatus,
): 'success' | 'neutral' | 'failure' {
  if (actionStatus === 'fail') return 'failure';
  if (decision.decision === 'REQUEST_REVIEW' || actionStatus === 'request-review') return 'neutral';
  if (actionStatus === 'warn' || decision.provisional) return 'neutral';
  return 'success';
}

export async function maybeCreateCheckRun(
  enabled: boolean,
  dryRun: boolean,
  headSha: string | null,
  decision: DetectiveDecision,
  actionStatus: ActionStatus,
  client: CheckRunClient | null,
): Promise<'created' | 'dry-run' | 'skipped'> {
  if (!enabled) return 'skipped';
  if (dryRun || !client || !headSha) return 'dry-run';
  await client.createCheckRun({
    name: 'JEV Flaky Detective',
    headSha,
    conclusion: conclusionFor(decision, actionStatus),
    title: `${decision.decision}: ${decision.failure_type}`,
    summary: decision.summary,
  });
  return 'created';
}
