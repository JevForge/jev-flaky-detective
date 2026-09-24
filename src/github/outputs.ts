import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DetectiveDecision, EvidenceSummary } from '../schemas/detective.js';
import type { ActionStatus } from '../decision/policy.js';
import { assertInsideWorkspace } from '../utils/paths.js';

const OUTPUT_LIMIT = 50_000;

export interface OutputWriter {
  setOutput(name: string, value: string): void;
}

export function emitOutputs(input: {
  writer: OutputWriter;
  decision: DetectiveDecision;
  evidence: EvidenceSummary;
  actionStatus: ActionStatus;
  needsReview: boolean;
  checkStatus: string;
  reportMarkdownFile: string;
  reportJsonFile: string;
  provider: string;
  workspace: string;
}): void {
  const { decision } = input;
  const counts = {
    flaky: 0,
    regression: 0,
    environment: 0,
    unknown: 0,
  };
  for (const row of decision.classifications) counts[row.failure_type] += 1;

  let classificationsJson = JSON.stringify(decision.classifications);
  let classificationsFile = '';
  if (classificationsJson.length > OUTPUT_LIMIT) {
    const path = assertInsideWorkspace(input.workspace, join('.jev', 'flaky-classifications.json'));
    writeFileSync(path, classificationsJson, 'utf8');
    classificationsFile = path;
    classificationsJson = '[]';
  }

  const outputs: Record<string, string> = {
    decision: decision.decision,
    failure_type: decision.failure_type,
    classifications: classificationsJson,
    classifications_file: classificationsFile,
    confidence: String(decision.confidence),
    reason_codes: JSON.stringify(decision.reason_codes),
    evidence_summary: JSON.stringify(input.evidence),
    provisional: String(decision.provisional),
    jev_status: decision.jev_status,
    jev_proposed: decision.jev_proposed ?? '',
    heuristic_failure_type: decision.heuristic_failure_type,
    suggested_action: decision.suggested_action,
    needs_review: String(input.needsReview),
    tests_count: String(input.evidence.tests_considered),
    failing_count: String(input.evidence.failing_count),
    flaky_count: String(counts.flaky),
    regression_count: String(counts.regression),
    environment_count: String(counts.environment),
    unknown_count: String(counts.unknown),
    summary: decision.summary,
    check_status: input.checkStatus,
    report_markdown_file: input.reportMarkdownFile,
    report_json_file: input.reportJsonFile,
    jev_provider: input.provider,
  };

  for (const [name, value] of Object.entries(outputs)) {
    input.writer.setOutput(name, value);
  }
}
