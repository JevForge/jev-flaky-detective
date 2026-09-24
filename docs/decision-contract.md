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

## Hard guarantees

* `NEVER_RERUN` — the Action does not re-execute tests.
* `NEVER_MASK` — failing results stay visible in outputs and summaries.
* Schema rejection of non-enum choices and free-form executable text as decisions.
