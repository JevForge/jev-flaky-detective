# Changelog

## [Unreleased]

### Added

* Stable error fingerprints built from normalized error type, message, and stack frames; explicit fingerprint reason codes are included in evidence.
* Public per-test and aggregate `heuristic_failure_type`, `heuristic_confidence`, and signal-only `suggested_action` outputs.
* Per-report size limits, stronger redaction for URL credentials, sensitive query parameters, bearer tokens, and connection strings.
* Adapter enrichment for nested JUnit suites, Jest pending/snapshot metadata, Playwright retries/native flaky outcomes, and Vitest reporter metadata.
* Opt-in structured telemetry fields for duration, adapter sources, history runs, and provisional state.
* Canonical `TestResult` JSON Schema/example and YAML contract tests for workflow examples.

### Changed

* Onboarding examples explicitly use `dry_run: 'true'`; production defaults remain backward-compatible.

## [0.2.2]

### Added

* `decision_mode: jev | deterministic` — deterministic classifies from local signals without calling Jev (`DETERMINISTIC_ONLY`).

## [0.2.1]

### Added

* Auto-load PR changed paths via the GitHub API when `changed_paths` is omitted on `pull_request` events (`CHANGED_PATHS_FROM_PR`).

## [0.2.0]

### Added

* Nested `append-history` Action and CLI to persist per-test runs into `.jev/test-history.json` (newest first, bounded `max_runs`).
* Docs and example: append then classify.

## [0.1.1] — 2026-09-24

### Changed

* Professional README with full inputs/outputs tables, authentication, permissions, and output-condition examples.
* Clearer Action log/error prefixes (`[JEV Flaky Detective]`).
* Expanded examples, issue templates, CONTRIBUTING, and SECURITY docs.

## [0.1.0] — 2026-09-24

### Added

* Initial public release of JEV Flaky Detective.
* Typed Jev classification: `regression` | `flaky` | `environment` | `unknown`.
* Providers: `vercel-ai-gateway`, `typesafe-native`, `custom-compatible`.
* Adapters: JUnit XML, Jest, Playwright, Vitest, Mocha.
* Optional native GitHub Actions history fetch.
* Deterministic low-confidence policy; never auto-reruns or masks failures.
