import type { DetectiveDecision } from '../schemas/detective.js';

export interface CommentClient {
  upsertComment(body: string): Promise<'posted' | 'updated'>;
}

const MARKER = '<!-- jev-flaky-detective -->';

export function renderComment(decision: DetectiveDecision): string {
  const counts = {
    regression: 0,
    flaky: 0,
    environment: 0,
    unknown: 0,
  };
  for (const row of decision.classifications) counts[row.failure_type] += 1;
  const rows = decision.classifications
    .slice(0, 20)
    .map(
      row =>
        `| \`${row.test_id.replace(/\|/g, '/')}\` | ${row.failure_type} | ${row.confidence.toFixed(2)} |`,
    )
    .join('\n');
  return [
    MARKER,
    '## JEV Flaky Detective',
    '',
    decision.summary,
    '',
    `- Decision: **${decision.decision}**`,
    `- Primary failure type: **${decision.failure_type}**`,
    `- Confidence: **${decision.confidence.toFixed(2)}**`,
    `- Provisional: **${decision.provisional}**`,
    `- Counts: regression=${counts.regression}, flaky=${counts.flaky}, environment=${counts.environment}, unknown=${counts.unknown}`,
    '',
    '| Test | Type | Confidence |',
    '| --- | --- | --- |',
    rows || '| _(none)_ | — | — |',
    '',
    '_This Action never auto-reruns tests or masks failures._',
  ].join('\n');
}

export async function maybePostComment(
  enabled: boolean,
  dryRun: boolean,
  decision: DetectiveDecision,
  client: CommentClient | null,
): Promise<'posted' | 'updated' | 'dry-run' | 'skipped'> {
  if (!enabled) return 'skipped';
  if (dryRun || !client) return 'dry-run';
  return client.upsertComment(renderComment(decision));
}

export { MARKER };
