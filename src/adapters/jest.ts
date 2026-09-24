import type { TestResult } from '../schemas/detective.js';
import { toTestResult } from './common.js';

interface JestAssertion {
  fullName?: string;
  title?: string;
  status?: string;
  duration?: number;
  failureMessages?: string[];
  ancestorTitles?: string[];
}

interface JestFile {
  name?: string;
  assertionResults?: JestAssertion[];
}

interface JestReport {
  testResults?: JestFile[];
}

export function parseJestJson(raw: unknown, source = 'jest'): TestResult[] {
  const report = (typeof raw === 'string' ? JSON.parse(raw) : raw) as JestReport;
  const results: TestResult[] = [];
  for (const file of report.testResults ?? []) {
    for (const assertion of file.assertionResults ?? []) {
      const suite = assertion.ancestorTitles?.join(' › ');
      const name = assertion.fullName ?? assertion.title ?? 'unnamed';
      results.push(
        toTestResult({
          name,
          suite,
          file: file.name,
          status: assertion.status ?? 'unknown',
          duration_ms: assertion.duration,
          error_message: assertion.failureMessages?.[0],
          source,
        }),
      );
      if (results.length >= 2000) return results;
    }
  }
  return results;
}
