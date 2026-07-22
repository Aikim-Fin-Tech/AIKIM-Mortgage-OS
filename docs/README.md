# AIKIM Mortgage OS — Documentation Index

**New here? Read [AI_HANDOVER.md](AI_HANDOVER.md) first**, then
[PROJECT_SUMMARY.md](PROJECT_SUMMARY.md). Everything else in this index is
depth you can reach from there.

## Memory Package (top-level, this directory)

| File | Purpose |
|---|---|
| [AI_HANDOVER.md](AI_HANDOVER.md) | The condensed context-reset package — read this first |
| [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) | Executive summary, 5-minute read |
| [CURRENT_STATUS.md](CURRENT_STATUS.md) | Build health + feature status table |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Frontend/backend/database/AI/deployment architecture |
| [DATABASE.md](DATABASE.md) | All tables, RLS, migrations — the full inventory |
| [AI_ENGINE.md](AI_ENGINE.md) | What the product actually uses AI for (and what it doesn't) |
| [MORTGAGE_ENGINE.md](MORTGAGE_ENGINE.md) | Business-process view of a loan case's lifecycle |
| [RULE_ENGINE.md](RULE_ENGINE.md) | Mortgage rule matching — technical internals |
| [WORKFLOW.md](WORKFLOW.md) | Case Timeline mechanics |
| [PROMPTS.md](PROMPTS.md) | Exact, current AI prompt text |
| [API_REFERENCE.md](API_REFERENCE.md) | Every Server Action, RPC, and read function |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Deployment status (none yet) and checklist |
| [ROADMAP.md](ROADMAP.md) | Phased plan to production |
| [TODO.md](TODO.md) | All technical debt, open questions, known issues |
| [CHANGELOG.md](CHANGELOG.md) | Commit and migration history |
| [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) | How to actually work on this repo |

## Detailed / Original Docs (kept as the source of truth for fine-grained detail)

The files above are concise summaries that link into these for full depth —
they are not superseded, and are kept in sync as the ground truth for
anything the top-level files summarize.

### `product/` — Product Management
- [vision.md](product/vision.md) — mission, roles, principles
- [roadmap.md](product/roadmap.md) — sprint-by-sprint build history (more
  granular than the top-level [ROADMAP.md](ROADMAP.md))

### `architecture/` — System Design
- [overview.md](architecture/overview.md) — stack, request boundary, data flow
- [database.md](architecture/database.md) — original, most granular schema doc
- [security.md](architecture/security.md) — authorization model, PII handling

### `business/` — Domain Knowledge
- [banker-workflow.md](business/banker-workflow.md) — how a banker uses the product
- [mortgage-workflow.md](business/mortgage-workflow.md) — case lifecycle from the schema's point of view
- [terminology.md](business/terminology.md) — glossary
- [bank-rules.md](business/bank-rules.md) — how banks are represented (free text, not a table)
- [product-vision.md](business/product-vision.md) — longer-horizon, unscoped direction

### `engineering/` — How to Build
- [coding-standards.md](engineering/coding-standards.md)
- [git-workflow.md](engineering/git-workflow.md)
- [review-checklist.md](engineering/review-checklist.md)
- [testing-strategy.md](engineering/testing-strategy.md) — no automated tests exist yet
- [release-checklist.md](engineering/release-checklist.md)
- [ai-development-workflow.md](engineering/ai-development-workflow.md) — the 8-agent collaboration model

### `api/` — API Surface
- [overview.md](api/overview.md) — original version of [API_REFERENCE.md](API_REFERENCE.md)

### `decisions/` — Architecture Decision Records
- [README.md](decisions/README.md) — index + process
- 0001 through 0009 — every non-trivial technical decision, with reasoning
  and evidence. See [CHANGELOG.md](CHANGELOG.md) for which ADR maps to which
  feature.

## Root-Level Files (outside `docs/`)

| File | Purpose |
|---|---|
| `/README.md` | Project entry point — setup instructions, links into this index |
| `/CLAUDE.md` | Governing rules for Claude Code agents working on this repo |
| `/AGENTS.md` | Next.js 16 breaking-changes warning, imported by `CLAUDE.md` |
| `/.claude/agents/*.md` | The 8 development-time agent role definitions |
| `/.claude/settings.json` | Permission guardrails (blocks migration execution, package installs, etc.) |

## Status Legend (used throughout this documentation set)

**Implemented** — live in code today, verified by reading the source.
**Not Started** — no code exists.
**Frozen** — built and working, explicitly paused, not abandoned.
**Out of Scope** — explicitly excluded until separately approved.
**TODO** — a known gap, listed in [TODO.md](TODO.md).
