import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { HistoryRunSchema, type HistoryRun, type TestResult } from '../schemas/detective.js';
import { parseHistoryPayload, parseResultsPayload } from '../collectors/normalize.js';
import { assertInsideWorkspace } from '../utils/paths.js';

export interface AppendHistoryOptions {
  workspace: string;
  historyPath: string;
  /** Current results to store as one HistoryRun */
  results: TestResult[];
  runId: string;
  startedAt?: string;
  headBranch?: string;
  headSha?: string;
  conclusion?: HistoryRun['conclusion'];
  /** Max runs to keep (oldest dropped). Default 50. */
  maxRuns?: number;
}

export interface AppendHistoryResult {
  path: string;
  runs: number;
  appended: boolean;
}

/**
 * Append the current test results as one history run.
 * Does not re-run tests and does not alter current failure visibility.
 */
export function appendTestHistory(options: AppendHistoryOptions): AppendHistoryResult {
  const maxRuns = Math.min(200, Math.max(1, options.maxRuns ?? 50));
  const fullPath = assertInsideWorkspace(options.workspace, options.historyPath);

  let runs: HistoryRun[] = [];
  if (existsSync(fullPath)) {
    const raw = JSON.parse(readFileSync(fullPath, 'utf8')) as unknown;
    runs = parseHistoryPayload(raw);
  }

  const next = HistoryRunSchema.parse({
    run_id: options.runId.slice(0, 128),
    started_at: options.startedAt,
    head_branch: options.headBranch?.slice(0, 256),
    head_sha: options.headSha?.slice(0, 64),
    conclusion: options.conclusion,
    results: options.results.slice(0, 2000),
  });

  // Newest first (matches lookback consumers that slice from the start)
  const deduped = runs.filter(run => run.run_id !== next.run_id);
  const merged = [next, ...deduped].slice(0, maxRuns);

  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, `${JSON.stringify({ runs: merged }, null, 2)}\n`, 'utf8');

  return { path: fullPath, runs: merged.length, appended: true };
}

export function loadResultsForAppend(workspace: string, resultsInline?: string, resultsPath?: string): TestResult[] {
  if (resultsInline?.trim()) return parseResultsPayload(resultsInline);
  if (resultsPath?.trim()) {
    const full = assertInsideWorkspace(workspace, resultsPath);
    return parseResultsPayload(JSON.parse(readFileSync(full, 'utf8')) as unknown);
  }
  throw new Error('results or results_path is required to append history');
}
