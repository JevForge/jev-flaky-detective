# Changelog

## [Unreleased]

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
