import type { TestResult } from '../schemas/detective.js';
import { toTestResult } from './common.js';

interface PlaywrightTest {
  title?: string;
  outcome?: string;
  results?: Array<{
    status?: string;
    duration?: number;
    error?: { message?: string; stack?: string };
    retry?: number;
  }>;
}

interface PlaywrightSpec {
  title?: string;
  file?: string;
  tests?: PlaywrightTest[];
}

interface PlaywrightSuite {
  title?: string;
  file?: string;
  suites?: PlaywrightSuite[];
  specs?: PlaywrightSpec[];
}

interface PlaywrightReport {
  suites?: PlaywrightSuite[];
}

function walkSuite(suite: PlaywrightSuite, results: TestResult[], parent: string[]): void {
  const titles = suite.title ? [...parent, suite.title] : parent;
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      const last = test.results?.[test.results.length - 1];
      const status = last?.status ?? 'unknown';
      const retries = Math.max(0, ...(test.results ?? []).map(result => result.retry ?? 0));
      const tags = [
        test.outcome === 'flaky' ? 'playwright:flaky' : undefined,
        retries > 0 ? `playwright:retries:${retries}` : undefined,
      ].filter((tag): tag is string => Boolean(tag));
      results.push(
        toTestResult({
          name: test.title ?? spec.title ?? 'unnamed',
          suite: [...titles, ...(spec.title ? [spec.title] : [])].join(' › ') || undefined,
          file: spec.file ?? suite.file,
          status,
          duration_ms: last?.duration,
          error_message: last?.error?.message,
          stack_snippet: last?.error?.stack,
          retries,
          attempt: typeof last?.retry === 'number' ? last.retry + 1 : undefined,
          tags,
          source: 'playwright',
        }),
      );
    }
  }
  for (const child of suite.suites ?? []) walkSuite(child, results, titles);
}

export function parsePlaywrightJson(raw: unknown, source = 'playwright'): TestResult[] {
  const report = (typeof raw === 'string' ? JSON.parse(raw) : raw) as PlaywrightReport;
  const results: TestResult[] = [];
  for (const suite of report.suites ?? []) {
    walkSuite(suite, results, []);
    if (results.length >= 2000) break;
  }
  // Ensure source stamp
  return results.map(result => ({ ...result, source: result.source ?? source }));
}
