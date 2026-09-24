# Decision contract

## Decisions

| Decision | Meaning |
| --- | --- |
| `CLASSIFY` | Trusted classification available |
| `ABSTAIN` | Not enough trust / Jev unavailable / policy abstain |
| `REQUEST_REVIEW` | Human should confirm before acting on the type |

## Failure types

| Type | Meaning |
| --- | --- |
| `regression` | Likely new or consistent product break |
| `flaky` | Intermittent across history |
| `environment` | Infra / timeout / network / resource |
| `unknown` | Insufficient or conflicting evidence |

## Public comparison and action signals

Each classification includes `heuristic_failure_type` and `heuristic_confidence`. The top-level decision exposes `heuristic_failure_type` beside `jev_proposed`, so consumers can see where local evidence and Jev agree or diverge.

`suggested_action` is an allowlisted, signal-only hint:

| Value | Meaning |
| --- | --- |
| `triage` | Review the test and evidence |
| `ignore-for-gate` | Flake signal is strong enough to route separately; the failing test remains visible |
| `investigate-env` | Inspect runner, network, resource, or service conditions |

The workflow remains responsible for deciding whether a gate should block. The Action never reruns tests or masks failures.

## Hard guarantees

* `NEVER_RERUN` — the Action does not re-execute tests.
* `NEVER_MASK` — failing results stay visible in outputs and summaries.
* Schema rejection of non-enum choices and free-form executable text as decisions.
