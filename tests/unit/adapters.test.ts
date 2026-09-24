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

  it('keeps nested JUnit suite identity', () => {
    const results = parseJunitXml(
      '<testsuites><testsuite name="outer"><testsuite name="inner"><testcase name="nested" time="0.01"/></testsuite></testsuite></testsuites>',
    );
    expect(results[0]?.suite).toBe('outer â€º inner');
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

  it('preserves Jest pending and snapshot metadata as tags', () => {
    const results = parseJestJson({
      numPendingTests: 1,
      snapshot: { unmatched: 2, added: 1, updated: 3 },
      testResults: [{ name: 'a.test.js', assertionResults: [{ fullName: 'pending', status: 'pending' }] }],
    });
    expect(results[0]?.status).toBe('skipped');
    expect(results[0]?.tags).toEqual(expect.arrayContaining(['jest:pending-tests:1', 'jest:snapshot-unmatched:2']));
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

  it('records Playwright retries and native flaky outcome', () => {
    const results = parsePlaywrightJson({
      suites: [{ title: 'root', specs: [{ title: 'spec', tests: [{ title: 't', outcome: 'flaky', results: [
        { status: 'failed', retry: 0, duration: 10, error: { message: 'first' } },
        { status: 'passed', retry: 1, duration: 12 },
      ] }] }] }],
    });
    expect(results[0]?.status).toBe('passed');
    expect(results[0]?.retries).toBe(1);
    expect(results[0]?.tags).toContain('playwright:flaky');
  });

  it('accepts Vitest JSON reporter metadata alongside Jest-compatible results', () => {
    const results = parseVitestJson({
      testResults: [{ name: '/repo/a.test.ts', assertionResults: [{ fullName: 'a > works', status: 'passed', meta: { shard: '1' } }] }],
    });
    expect(results[0]?.file).toBe('/repo/a.test.ts');
    expect(results[0]?.tags).toContain('vitest:meta:shard');
  });
});
