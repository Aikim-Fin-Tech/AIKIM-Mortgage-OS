# Changelog

Derived from `git log` and the [ADR history](decisions/README.md) — this is
the authoritative record of what happened and when. Sprint numbers referenced
elsewhere in code comments (Sprint 4, 6, 6.5, 9A) predate this changelog and
are historical breadcrumbs, not verified against this record.

## Commit History (`git log --oneline`)

```
6f73121 Phase 1 Complete - Project checkpoint before context reset
d54eabf Initial Next.js project
```

Only 2 commits exist. Everything described in this documentation set beyond
the bare `create-next-app` scaffold is contained in the single `6f73121`
checkpoint commit (156 files changed). **This commit has not been pushed to
`origin/main`.**

## What `6f73121` Contains, by Feature (chronological within the commit)

| # | Feature | ADR |
|---|---|---|
| 1 | AIKIM Development OS foundation — `CLAUDE.md`, `docs/` structure, `.claude/agents/` | — |
| 2 | Supabase backend + auth + RLS-first design (retroactively documented) | [0001](decisions/0001-use-supabase-for-backend-and-auth.md), [0002](decisions/0002-rls-as-sole-authorization-boundary.md) |
| 3 | Next.js 16 `proxy.ts` session boundary (retroactively documented) | [0003](decisions/0003-nextjs16-proxy-as-session-boundary.md) |
| 4 | Atomic multi-table writes via `create_loan_case` RPC (retroactively documented) | [0004](decisions/0004-atomic-multitable-writes-via-security-invoker-rpc.md) |
| 5 | Sprint 6.1 — Document Management MVP (upload/preview/download/delete) | [0005](decisions/0005-document-storage-model.md) |
| 6 | Sprint 6.2 Phase 1 — Borrower Profile + Mortgage Rules Engine + generated checklist | [0006](decisions/0006-mortgage-rules-engine.md) |
| 7 | Sprint 6.2 Phase 2 — Mortgage Rule Admin (**frozen** after completion) | [0007](decisions/0007-mortgage-rule-admin.md) |
| 8 | MVP Sprint — OCR (Gemini 2.5 Pro) + AI Case Summary | [0008](decisions/0008-ocr-and-ai-case-summary.md) |
| 9 | MVP Sprint Day 2 — Loan Status pipeline, Timeline, Checklist Progress, Next Action, Loan Health Score | [0009](decisions/0009-loan-processing-workflow.md) |
| 10 | This documentation consolidation pass (`/docs` memory package) | — |

## Migration Files (chronological, none executed — see [DATABASE.md](DATABASE.md))

1. `20260716000000_loan_case_creation.sql`
2. `20260716010000_fix_create_loan_case_rpc.sql`
3. `20260716020000_create_loan_case_rpc.sql`
4. `20260721010000_document_management_mvp.sql`
5. `20260722010000_mortgage_rules_engine.sql`
6. `20260723010000_mortgage_rule_admin.sql`
7. `20260724010000_ocr_document_extraction.sql`
8. `20260725010000_loan_workflow.sql`

## Notable Reversals / Corrections

- **Sprint 6.2 Phase 2 (Mortgage Rule Admin) was explicitly frozen** the day
  after it shipped, to prioritize a Banker MVP (OCR, AI Summary, Dashboard,
  WhatsApp). Not a bug fix — a deliberate scope pivot. See [ROADMAP.md](ROADMAP.md).
- **`documents_pending` was renamed to `waiting_document`** (not dropped) in
  the loan status pipeline expansion — existing rows preserved.
- **`on_hold` was kept, not removed**, from `loan_status` — Postgres cannot
  cheaply drop an enum value and no live-row check was possible.
- **The dead mock `loanCases` array** in `src/lib/loan-cases-data.ts` was
  removed when it would no longer type-check under the expanded `LoanStatus`
  union (it had zero real importers by that point).
- **3 duplicated `STATUS_LABELS` copies** (across `dashboard.ts`,
  `loan-cases.ts`, `loan-case-details.ts`) were consolidated into one shared
  export while those files were already being touched for the status
  pipeline change.
