# Improvement roadmap — release plan

Each item ships as its **own PR** (atomic commit), is **merged to `main`**, then gets a **full Release** via `jev-release-forge` (`workflow_dispatch`). No squashing unrelated work into one push.

| # | Version | Branch | Scope |
| --- | --- | --- | --- |
| 0 | `0.1.1` | — (already on `main`) | Tag docs/DX polish already merged |
| 1 | `0.2.0` | `feat/history-append` | History append helper (composite + script) for per-test `.jev/test-history.json` |
| 2 | `0.2.1` | `feat/pr-changed-paths` | Auto-load PR changed paths via GitHub API when input empty |
| 3 | `0.2.2` | `feat/decision-mode` | `decision_mode: jev \| deterministic` |
| 4 | `0.2.3` | `feat/error-fingerprint` | Stable error fingerprint (type + normalized message + stack) |
| 5 | `0.2.4` | `feat/heuristic-outputs` | Public `heuristic_failure_type` / per-test heuristic fields |
| 6 | `0.2.5` | `feat/report-size-limit` | Reject oversized reports with clear `SOURCE_UNAVAILABLE` |
| 7 | `0.2.6` | `feat/aggressive-redaction` | Stronger redaction of URLs/tokens/connection strings before Jev |
| 8 | `0.2.7` | `feat/adapter-flaky-hints` | Playwright retries/flaky, Jest/Vitest flake-oriented fields |
| 9 | `0.2.8` | `feat/suggested-action` | Allowlisted `suggested_action` enum (signal only; never reruns/masks) |
| 10 | `0.2.9` | `feat/telemetry` | Expand structured telemetry (`duration_ms`, adapters, history, provisional) |
| 11 | `0.2.10` | `feat/testresult-schema` | Canonical `TestResult` JSON Schema + docs |
| 12 | `0.2.11` | `feat/examples-contract-tests` | dry_run onboarding examples + YAML/example contract tests |

## Hard rules preserved

* `NEVER_RERUN` / `NEVER_MASK`
* No silent Jev provider fallback
* No breaking renames of existing inputs/outputs (additive only)
* Secrets only via `env`, never `with:`

## Process per item

1. `git checkout main && git pull`
2. `git checkout -b feat/...`
3. Implement + `npm run all`
4. One focused commit → push → `gh pr create` → merge
5. `gh workflow run Release -f version=X.Y.Z -f move_major_tag=true`
6. Wait for green release (`vX.Y.Z` + floating `v0`)
