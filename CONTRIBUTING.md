# Contributing

Thanks for helping improve JEV Flaky Detective.

## Setup

```bash
git clone https://github.com/JevForge/jev-flaky-detective.git
cd jev-flaky-detective
npm ci
```

Requires **Node.js 24+**.

## Local checks

```bash
npm test
npm run typecheck
npm run build
# or
npm run all
```

## Guidelines

1. Keep the public decision schema backward compatible. Add reason codes; do not rename existing ones.
2. Keep Jev access behind `JevProvider`. Never execute explanation text.
3. New adapters must normalize into `TestResult` and must not auto-rerun or hide failures.
4. Rebuild and commit `dist/index.js` when the Action entrypoint changes.
5. Prefer small PRs with tests for schema, policy, and adapter changes.

## Pull requests

Use the PR template checklist. Do not publish releases or Marketplace listings from a pull request.
