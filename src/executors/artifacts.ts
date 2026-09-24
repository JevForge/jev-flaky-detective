import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DetectiveDecision, EvidenceSummary } from '../schemas/detective.js';
import { assertInsideWorkspace } from '../utils/paths.js';

export function writeArtifactReports(input: {
  workspace: string;
  decision: DetectiveDecision;
  evidence: EvidenceSummary;
}): { markdownPath: string; jsonPath: string } {
  const dir = assertInsideWorkspace(input.workspace, '.jev');
  mkdirSync(dir, { recursive: true });
  const markdownPath = join(dir, 'flaky-detective.md');
  const jsonPath = join(dir, 'flaky-detective.json');
  const md = [
    '# JEV Flaky Detective Report',
    '',
    input.decision.summary,
    '',
    '```json',
    JSON.stringify({ decision: input.decision, evidence: input.evidence }, null, 2),
    '```',
    '',
  ].join('\n');
  writeFileSync(markdownPath, md, 'utf8');
  writeFileSync(jsonPath, JSON.stringify({ decision: input.decision, evidence: input.evidence }, null, 2), 'utf8');
  return { markdownPath, jsonPath };
}
