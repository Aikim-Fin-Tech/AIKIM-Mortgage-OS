# Git Workflow

## Current reality

- Single `main` branch. No branch protection, no CI pipeline observed in this repo.
- History so far is a single initial commit plus uncommitted work — no established
  branching pattern yet to preserve.

## Recommended workflow

> **Status: Planned/Recommended.** Not currently enforced by tooling.

- One feature branch per change, named `<type>/<short-description>`
  (e.g. `feat/documents-upload`, `fix/dashboard-audit-count`).
- Open a PR into `main`; do not push directly to `main` once this is adopted.
- PR description states: what changed, why, and which
  [Definition of Done](../../CLAUDE.md#definition-of-done) items were satisfied.
- Squash-merge to keep `main` history readable.

## Commit messages

- Present tense, imperative ("Add documents upload action", not "Added...").
- Explain *why*, not just *what* — the diff already shows what changed.

## What never happens, regardless of branch strategy

- No force-push to `main`.
- No direct schema execution from any branch — see
  [Migration Policy](../../CLAUDE.md#migration-policy).
- No commit of `.env.local` or any secret.
