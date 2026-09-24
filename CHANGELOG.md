# Changelog

## 0.1.0

* Initial release of JEV Flaky Detective.
* Typed Jev classification: `regression` | `flaky` | `environment` | `unknown`.
* Providers: `vercel-ai-gateway`, `typesafe-native`, `custom-compatible`.
* Adapters: JUnit XML, Jest, Playwright, Vitest, Mocha.
* Optional native GitHub Actions history fetch.
* Deterministic low-confidence policy; never auto-reruns or masks failures.
