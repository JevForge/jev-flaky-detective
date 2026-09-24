import type { DetectiveDecision } from '../schemas/detective.js';
import type { ActionStatus } from '../decision/policy.js';

export interface PlannedEffects {
  annotate: boolean;
  comment: boolean;
  checkRun: boolean;
}

export function planEffects(input: {
  decision: DetectiveDecision;
  actionStatus: ActionStatus;
  comment: boolean;
  checkRun: boolean;
}): PlannedEffects {
  return {
    annotate: input.decision.decision !== 'ABSTAIN' || input.actionStatus !== 'no-op',
    comment: input.comment,
    checkRun: input.checkRun,
  };
}
