# AGENTS.md — Project Working Notes

## Fork branch strategy

This repository is maintained as a personal fork of upstream `craft-ai-agents/craft-agents-oss`.

Branch conventions:

- `main` should stay close to `upstream/main` and should not be used as the long-lived personal customization branch.
- Keep independent changes on focused feature branches, for example:
  - `feat/openconnector-source-template`
  - `feat/session-status-refactor`
- Use `personal/integration` as the long-lived personal integration branch.
  - Merge stable personal feature branches into `personal/integration`.
  - Use this branch for day-to-day personal builds/testing.
  - Rebase/merge upstream updates deliberately and validate the integrated result.

Operational rules:

- Do not force-push or reset `main` without explicit user confirmation.
- Before moving personal changes off `main`, make sure they are preserved on feature branches and/or `personal/integration`.
- Prefer opening or updating feature branches first, then merging them into `personal/integration` after validation.
- When committing, include the Craft Agent co-author trailer:

```text
Co-Authored-By: Craft Agent <agents-noreply@craft.do>
```
