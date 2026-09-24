import * as core from '@actions/core';
import { appendTestHistory, loadResultsForAppend } from './append.js';

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function read(name: string, argvName = name.replace(/_/g, '-')): string {
  const fromArgv = arg(argvName);
  if (fromArgv != null && fromArgv !== '') return fromArgv;
  try {
    return core.getInput(name);
  } catch {
    return '';
  }
}

const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
const resultsPath = read('results_path', 'results-path');
const resultsInline = read('results');
const historyPath = read('history_path', 'history-path') || '.jev/test-history.json';
const maxRunsRaw = Number(read('max_runs', 'max-runs') || '50');
const runId = read('run_id', 'run-id') || process.env.GITHUB_RUN_ID || `local-${Date.now()}`;
const headBranch = arg('head-branch') || process.env.GITHUB_REF_NAME;
const headSha = arg('head-sha') || process.env.GITHUB_SHA;
const conclusionRaw = read('conclusion');
const conclusion = (conclusionRaw || undefined) as
  | 'success'
  | 'failure'
  | 'cancelled'
  | 'skipped'
  | 'unknown'
  | undefined;

try {
  const results = loadResultsForAppend(workspace, resultsInline || undefined, resultsPath || undefined);
  const out = appendTestHistory({
    workspace,
    historyPath,
    results,
    runId,
    startedAt: new Date().toISOString(),
    headBranch,
    headSha,
    conclusion,
    maxRuns: Number.isFinite(maxRunsRaw) ? maxRunsRaw : 50,
  });
  const summary = JSON.stringify({ ok: true, path: out.path, runs: out.runs, results: results.length });
  core.info(`[JEV Flaky Detective] append-history ${summary}`);
  core.setOutput('history_path', out.path);
  core.setOutput('runs', String(out.runs));
  process.stdout.write(`${summary}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  core.setFailed(`[JEV Flaky Detective] append-history failed: ${message}`);
}
