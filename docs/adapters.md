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
}
```

| Adapter | Input | Notes |
| --- | --- | --- |
| JUnit | `junit_path` | XML; covers pytest/Surefire-style reports |
| Jest | `jest_path` | `--json` report shape |
| Playwright | `playwright_path` | Nested suites/specs/tests |
| Vitest | `vitest_path` | Jest-compatible or `tests[]` shape |
| Mocha | `mocha_path` | `passes` / `failures` / `pending` |

To add an adapter: parse → `toTestResult()` → unit tests with fixtures. Do not invent new public decision enums.
