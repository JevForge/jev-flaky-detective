# Append test history

Use this helper **after** tests finish to persist per-test results into `.jev/test-history.json`. The classifier Action reads that file later. Nothing is re-run or masked.

## Composite / nested Action

```yaml
- uses: JevForge/jev-flaky-detective/append-history@v0
  with:
    results_path: .jev/current-results.json
    history_path: .jev/test-history.json
    max_runs: '50'
    conclusion: failure
```

## CLI (after `npm run build` in this repo)

```bash
node dist/append-history.js --results-path .jev/current-results.json --history-path .jev/test-history.json
```

History runs are stored **newest first**. When `max_runs` is exceeded, oldest entries are dropped.
