# Security policy

## Reporting a vulnerability

Do **not** open a public issue that includes secrets, tokens, proprietary test logs with credentials, or exploit details that would put users at risk.

Prefer GitHub private vulnerability reporting for this repository when available (**Security → Advisories / Report a vulnerability**). Otherwise contact the JevForge organization maintainers through a private channel.

## Scope

JEV Flaky Detective classifies test failures (`regression`, `flaky`, `environment`, `unknown`). It does not re-run tests, delete failures, rewrite application code, or execute model prose as commands.

## Data handling

Sent to the selected Jev provider only:

* Bounded sample of test metadata and digests
* Aggregate history signals
* Environment / runner labels

Not sent:

* Provider credentials (used only for auth to the selected endpoint)
* Unbounded raw logs
* Secrets embedded in error text (redacted when detected)

Custom endpoints must be public HTTPS. There is no silent fallback between Jev providers. Paths must remain inside `GITHUB_WORKSPACE`.
