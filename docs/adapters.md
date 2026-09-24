# Framework adapters

All adapters emit the shared `TestResult` schema:

```ts
{
  test_id: string
  name?: string
  suite?: string
  file?: string
  status: 'passed' | 'failed' | 'skipped' | 'timedOut' | 'interrupted' | 'unknown'
  duration_ms?: number
  error_message?: string
  error_type?: string
  stack_snippet?: string
  source?: string
  retries?: number
  attempt?: number
  tags?: string[]
}
```

| Adapter | Input | Notes |
| --- | --- | --- |
| JUnit | `junit_path` | XML; nested suites and multi-file inputs are aggregated |
| Jest | `jest_path` | `--json` report shape, pending and snapshot metadata become tags |
| Playwright | `playwright_path` | Nested suites/specs/tests, retries, and native flaky outcome |
| Vitest | `vitest_path` | Official JSON reporter shape and Jest-compatible assertions |
| Mocha | `mocha_path` | `passes` / `failures` / `pending` |

To add an adapter: parse → `toTestResult()` → unit tests with fixtures. Do not invent new public decision enums.
