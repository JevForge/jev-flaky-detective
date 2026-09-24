import { describe, expect, it } from 'vitest';
import { parseJunitXml } from '../../src/adapters/junit.js';
import { parseJestJson } from '../../src/adapters/jest.js';
import { parseMochaJson } from '../../src/adapters/mocha.js';
import { parseVitestJson } from '../../src/adapters/vitest.js';
import { parsePlaywrightJson } from '../../src/adapters/playwright.js';

describe('adapters', () => {
  it('parses JUnit failures and skips', () => {
    const xml = `<?xml version="1.0"?>
      <testsuite name="Suite">
        <testcase classname="A" name="ok" time="0.01"/>
        <testcase classname="A" name="bad" time="0.2">
          <failure type="AssertionError" message="expected true">stack</failure>
        </testcase>
        <testcase classname="A" name="skip" time="0"><skipped/></testcase>
      </testsuite>`;
    const results = parseJunitXml(xml);
    expect(results).toHaveLength(3);
    expect(results.find(r => r.name === 'bad')?.status).toBe('failed');
    expect(results.find(r => r.name === 'skip')?.status).toBe('skipped');
  });

  it('parses Jest JSON', () => {
    const results = parseJestJson({
      testResults: [
        {
          name: 'a.test.js',
          assertionResults: [
            { fullName: 'a works', status: 'passed', duration: 12, ancestorTitles: ['a'] },
            {
              fullName: 'a fails',
              status: 'failed',
              duration: 9,
              failureMessages: ['boom'],
              ancestorTitles: ['a'],
            },
          ],
        },
      ],
    });
    expect(results.map(r => r.status)).toEqual(['passed', 'failed']);
  });

  it('parses Mocha / Vitest / Playwright shapes', () => {
    expect(parseMochaJson({ failures: [{ title: 'x', err: { message: 'nope' } }], passes: [] })).toHaveLength(1);
    expect(
      parseVitestJson({
        tests: [{ name: 't', status: 'failed', errors: [{ message: 'e' }] }],
      }),
    ).toHaveLength(1);
    expect(
      parsePlaywrightJson({
        suites: [
          {
            title: 'root',
            specs: [
              {
                title: 'spec',
                tests: [{ title: 't', results: [{ status: 'timedOut', duration: 30000 }] }],
              },
            ],
          },
        ],
      })[0]?.status,
    ).toBe('timedOut');
  });
});
