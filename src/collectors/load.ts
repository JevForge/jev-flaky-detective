import { existsSync, readFileSync, statSync } from 'node:fs';
import {
  parseJestJson,
  parseJunitXml,
  parseMochaJson,
  parsePlaywrightJson,
  parseVitestJson,
} from '../adapters/index.js';
import type { HistoryRun, SourceError, TestResult } from '../schemas/detective.js';
import type { ReasonCode } from '../schemas/enums.js';
import { expandPathList, resolveReportPaths, assertInsideWorkspace, toPosix } from '../utils/paths.js';
import { mergeResults, parseHistoryPayload, parseResultsPayload } from './normalize.js';

export interface LoadInput {
  workspace: string;
  resultsInline?: string;
  resultsPath?: string;
  historyInline?: string;
  historyPath?: string;
  junitPath?: string;
  jestPath?: string;
  playwrightPath?: string;
  vitestPath?: string;
  mochaPath?: string;
  changedPathsRaw?: string;
  maxReportBytes?: number;
}

export interface LoadResult {
  current: TestResult[];
  history: HistoryRun[];
  changedPaths: string[];
  sourceErrors: SourceError[];
  adapterSources: string[];
  reasonCodes: ReasonCode[];
  truncated: boolean;
}

function parseChangedPaths(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((value): value is string => typeof value === 'string').map(toPosix).slice(0, 2000);
    }
  } catch {
    // newline list
  }
  return raw
    .split(/[\n,]+/)
    .map(part => toPosix(part.trim()))
    .filter(Boolean)
    .slice(0, 2000);
}

function readBoundedText(file: string, maxReportBytes: number): string {
  const size = statSync(file).size;
  if (size > maxReportBytes) {
    throw new Error(`report exceeds the maximum report size of ${maxReportBytes} bytes`);
  }
  return readFileSync(file, 'utf8');
}

function readJsonFile(workspace: string, relative: string, maxReportBytes: number): unknown {
  const full = assertInsideWorkspace(workspace, relative);
  return JSON.parse(readBoundedText(full, maxReportBytes)) as unknown;
}

export function loadEvidence(input: LoadInput): LoadResult {
  const maxReportBytes = input.maxReportBytes ?? 10 * 1024 * 1024;
  const sourceErrors: SourceError[] = [];
  const adapterSources: string[] = [];
  const reasonCodes: ReasonCode[] = [];
  const groups: TestResult[][] = [];

  if (input.resultsInline?.trim()) {
    try {
      if (Buffer.byteLength(input.resultsInline, 'utf8') > maxReportBytes) {
        throw new Error(`report exceeds the maximum report size of ${maxReportBytes} bytes`);
      }
      groups.push(parseResultsPayload(input.resultsInline));
    } catch (error) {
      sourceErrors.push({
        source: 'results',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const path of expandPathList(input.resultsPath)) {
    try {
      const files = resolveReportPaths(input.workspace, [path]);
      if (files.length === 0) {
        sourceErrors.push({ source: `results_path:${path}`, message: 'file not found' });
        continue;
      }
      for (const file of files) {
        groups.push(parseResultsPayload(JSON.parse(readBoundedText(file, maxReportBytes))));
      }
    } catch (error) {
      sourceErrors.push({
        source: `results_path:${path}`,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const adapterLoads: Array<{
    label: string;
    pathInput?: string;
    code: ReasonCode;
    parse: (content: string) => TestResult[];
  }> = [
    { label: 'junit', pathInput: input.junitPath, code: 'ADAPTER_JUNIT', parse: c => parseJunitXml(c) },
    { label: 'jest', pathInput: input.jestPath, code: 'ADAPTER_JEST', parse: c => parseJestJson(c) },
    {
      label: 'playwright',
      pathInput: input.playwrightPath,
      code: 'ADAPTER_PLAYWRIGHT',
      parse: c => parsePlaywrightJson(c),
    },
    { label: 'vitest', pathInput: input.vitestPath, code: 'ADAPTER_VITEST', parse: c => parseVitestJson(c) },
    { label: 'mocha', pathInput: input.mochaPath, code: 'ADAPTER_MOCHA', parse: c => parseMochaJson(c) },
  ];

  for (const adapter of adapterLoads) {
    const patterns = expandPathList(adapter.pathInput);
    if (patterns.length === 0) continue;
    const files = resolveReportPaths(input.workspace, patterns);
    if (files.length === 0) {
      sourceErrors.push({ source: adapter.label, message: 'no matching report files' });
      continue;
    }
    for (const file of files) {
      try {
        groups.push(adapter.parse(readBoundedText(file, maxReportBytes)));
        if (!adapterSources.includes(adapter.label)) adapterSources.push(adapter.label);
        if (!reasonCodes.includes(adapter.code)) reasonCodes.push(adapter.code);
      } catch (error) {
        sourceErrors.push({
          source: `${adapter.label}:${file}`,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  let history: HistoryRun[] = [];
  if (input.historyInline?.trim()) {
    try {
      history = parseHistoryPayload(input.historyInline);
      reasonCodes.push('HISTORY_AVAILABLE');
    } catch (error) {
      sourceErrors.push({
        source: 'history',
        message: error instanceof Error ? error.message : String(error),
      });
      reasonCodes.push('HISTORY_UNAVAILABLE');
    }
  } else if (input.historyPath?.trim()) {
    try {
      const full = assertInsideWorkspace(input.workspace, input.historyPath);
      if (existsSync(full)) {
        history = parseHistoryPayload(readJsonFile(input.workspace, input.historyPath, maxReportBytes));
        reasonCodes.push(history.length > 0 ? 'HISTORY_AVAILABLE' : 'HISTORY_EMPTY');
      } else {
        reasonCodes.push('HISTORY_EMPTY');
      }
    } catch (error) {
      sourceErrors.push({
        source: 'history_path',
        message: error instanceof Error ? error.message : String(error),
      });
      reasonCodes.push('HISTORY_UNAVAILABLE');
    }
  } else {
    reasonCodes.push('HISTORY_EMPTY');
  }

  let current = mergeResults(groups);
  let truncated = false;
  if (current.length > 5000) {
    current = current.slice(0, 5000);
    truncated = true;
  }

  return {
    current,
    history,
    changedPaths: parseChangedPaths(input.changedPathsRaw),
    sourceErrors,
    adapterSources,
    reasonCodes,
    truncated,
  };
}
