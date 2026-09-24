import type { TestResult } from '../schemas/detective.js';
import { toTestResult } from './common.js';

interface VitestAssertion {
  fullName?: string;
  title?: string;
  status?: string;
  duration?: number;
  failureMessages?: string[];
  ancestorTitles?: string[];
  meta?: Record<string, unknown>;
}

interface VitestFile {
  name?: string;
  assertionResults?: VitestAssertion[];
}

interface VitestReport {
  testResults?: VitestFile[];
  tests?: Array<{
    name?: string;
    fullName?: string;
    status?: string;
    duration?: number;
    errors?: Array<{ message?: string; stack?: string }>;
    file?: string;
  }>;
}

export function parseVitestJson(raw: unknown, source = 'vitest'): TestResult[] {
  const report = (typeof raw === 'string' ? JSON.parse(raw) : raw) as VitestReport;
  const results: TestResult[] = [];

  if (report.testResults) {
    for (const file of report.testResults) {
      for (const assertion of file.assertionResults ?? []) {
        results.push(
          toTestResult({
            name: assertion.fullName ?? assertion.title ?? 'unnamed',
            suite: assertion.ancestorTitles?.join(' › '),
            file: file.name,
            status: assertion.status ?? 'unknown',
            duration_ms: assertion.duration,
            error_message: assertion.failureMessages?.[0],
            tags: Object.keys(assertion.meta ?? {}).slice(0, 8).map(key => `vitest:meta:${key}`),
            source,
          }),
        );
        if (results.length >= 2000) return results;
      }
    }
  }

  for (const test of report.tests ?? []) {
    results.push(
      toTestResult({
        name: test.fullName ?? test.name ?? 'unnamed',
        file: test.file,
        status: test.status ?? 'unknown',
        duration_ms: test.duration,
        error_message: test.errors?.[0]?.message,
        stack_snippet: test.errors?.[0]?.stack,
        source,
      }),
    );
    if (results.length >= 2000) break;
  }

  return results;
}
