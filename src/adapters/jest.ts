import type { TestResult } from '../schemas/detective.js';
import { toTestResult } from './common.js';

interface JestAssertion {
  fullName?: string;
  title?: string;
  status?: string;
  duration?: number;
  failureMessages?: string[];
  ancestorTitles?: string[];
  meta?: Record<string, unknown>;
}

interface JestFile {
  name?: string;
  assertionResults?: JestAssertion[];
}

interface JestReport {
  testResults?: JestFile[];
  numPendingTests?: number;
  snapshot?: { unmatched?: number; added?: number; updated?: number; filesRemoved?: number };
}

export function parseJestJson(raw: unknown, source = 'jest'): TestResult[] {
  const report = (typeof raw === 'string' ? JSON.parse(raw) : raw) as JestReport;
  const results: TestResult[] = [];
  const reportTags = [
    report.numPendingTests ? `jest:pending-tests:${report.numPendingTests}` : undefined,
    report.snapshot?.unmatched ? `jest:snapshot-unmatched:${report.snapshot.unmatched}` : undefined,
    report.snapshot?.added ? `jest:snapshot-added:${report.snapshot.added}` : undefined,
    report.snapshot?.updated ? `jest:snapshot-updated:${report.snapshot.updated}` : undefined,
    report.snapshot?.filesRemoved ? `jest:snapshot-files-removed:${report.snapshot.filesRemoved}` : undefined,
  ].filter((tag): tag is string => Boolean(tag));
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
          tags: [...reportTags, ...Object.keys(assertion.meta ?? {}).slice(0, 8).map(key => `jest:meta:${key}`)],
          source,
        }),
      );
      if (results.length >= 2000) return results;
    }
  }
  return results;
}
