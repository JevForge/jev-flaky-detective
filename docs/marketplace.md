# Marketplace readiness

## Short description (≤125 characters)

```text
Classify failing tests as regression, flaky, environment, or unknown. Jev decides; results are never masked or auto-rerun.
```

Length: 122 characters.

## Listing fields

| Field | Value |
| --- | --- |
| Name | JEV Flaky Detective |
| Primary category | Continuous integration |
| Secondary category | Code quality |
| Branding | `search` / `yellow` in `action.yml` |
| Pricing | Free (MIT) |

## Publish checklist

1. Public repository with root `action.yml` — done.
2. GitHub Release with a semver tag (`v0.1.0` or later) — done via Release workflow.
3. Accept the GitHub Marketplace Developer Agreement for the JevForge org (one-time).
4. Edit the latest release → check **Publish this Action to the GitHub Marketplace** → choose categories → update release (requires 2FA; cannot run in CI).

Categories: **Continuous integration** + **Code quality**.

Trigger later releases from Actions → Release → Run workflow with version `X.Y.Z`.
