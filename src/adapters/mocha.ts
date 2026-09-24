import type { TestResult } from '../schemas/detective.js';
import { toTestResult } from './common.js';

interface MochaTest {
  title?: string;
  fullTitle?: string;
  file?: string;
  duration?: number;
  err?: { message?: string; stack?: string; name?: string };
}

interface MochaReport {
  passes?: MochaTest[];
  failures?: MochaTest[];
  pending?: MochaTest[];
  tests?: MochaTest[];
}

export function parseMochaJson(raw: unknown, source = 'mocha'): TestResult[] {
  const report = (typeof raw === 'string' ? JSON.parse(raw) : raw) as MochaReport;
  const results: TestResult[] = [];

  const push = (tests: MochaTest[] | undefined, status: string) => {
    for (const test of tests ?? []) {
      results.push(
        toTestResult({
          name: test.fullTitle ?? test.title ?? 'unnamed',
          file: test.file,
          status,
          duration_ms: test.duration,
          error_message: test.err?.message,
          error_type: test.err?.name,
          stack_snippet: test.err?.stack,
          source,
        }),
      );
    }
  };

  if (report.passes || report.failures || report.pending) {
    push(report.passes, 'passed');
    push(report.failures, 'failed');
    push(report.pending, 'skipped');
  } else {
    for (const test of report.tests ?? []) {
      push([test], test.err ? 'failed' : 'passed');
    }
  }

  return results.slice(0, 2000);
}
