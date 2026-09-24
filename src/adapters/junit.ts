import type { TestResult } from '../schemas/detective.js';
import { toTestResult } from './common.js';

function attr(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag);
  return match?.[1];
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function parseJunitXml(xml: string, source = 'junit'): TestResult[] {
  const results: TestResult[] = [];
  // Self-closing and paired forms must be separate alternatives so "/" is not
  // swallowed into attributes before a body match spanning the next case.
  const caseRegex =
    /<testcase\b([^>]*?)\/>|<testcase\b([^>]*)>([\s\S]*?)<\/testcase>/gi;
  let match: RegExpExecArray | null;
  while ((match = caseRegex.exec(xml)) !== null) {
    const openAttrs = (match[1] ?? match[2] ?? '').trim();
    const body = match[3] ?? '';
    const name = attr(openAttrs, 'name') ?? 'unnamed';
    const classname = attr(openAttrs, 'classname');
    const file = attr(openAttrs, 'file');
    const time = attr(openAttrs, 'time');
    const durationMs = time ? Math.round(Number(time) * 1000) : undefined;

    let status = 'passed';
    let errorMessage: string | undefined;
    let errorType: string | undefined;
    if (/<skipped\b/i.test(body)) {
      status = 'skipped';
    } else {
      const failure = body.match(/<(failure|error)\b([^>]*)>([\s\S]*?)<\/\1>/i);
      const failureSelf = body.match(/<(failure|error)\b([^>]*)\/>/i);
      const hit = failure ?? failureSelf;
      if (hit) {
        status = 'failed';
        const tag = `<${hit[1]}${hit[2] ?? ''}>`;
        errorType = attr(tag, 'type') ?? hit[1];
        errorMessage = decodeXml((attr(tag, 'message') ?? hit[3] ?? '').trim());
      }
    }

    let suite = classname;
    if (!suite) {
      const before = xml.slice(0, match.index);
      const suites = [...before.matchAll(/<testsuite\b[^>]*\bname\s*=\s*"([^"]*)"/gi)];
      suite = suites.at(-1)?.[1];
    }

    results.push(
      toTestResult({
        name,
        suite,
        file,
        status,
        duration_ms: Number.isFinite(durationMs) ? durationMs : undefined,
        error_message: errorMessage,
        error_type: errorType,
        source,
      }),
    );
    if (results.length >= 2000) break;
  }
  return results;
}
