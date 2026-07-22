# 0009. Loan Processing Workflow — status pipeline, timeline, and 3 no-AI scores

Status: Proposed (migration authored, not confirmed run against the live database)
Date: 2026-07-26

## Context

MVP Sprint Day 2: complete the loan processing workflow — a full status
pipeline, an automatically-recorded case timeline, checklist progress,
a rule-based Next Action card, and a Loan Health Score. Explicitly "no AI" for
the score, and this document treats that as the general tone for all of
today's new deterministic features, distinct from the AI Case Summary built
the prior day.

## Decisions

**`loan_status` is expanded, not replaced.** Target vocabulary: `new`,
`waiting_document`, `under_review`, `ready_to_submit`, `submitted`,
`approved`, `rejected`. `documents_pending` is renamed to `waiting_document`
(`ALTER TYPE ... RENAME VALUE` — every existing row's status is preserved,
nothing is rewritten). `on_hold` is **not removed** — Postgres has no cheap
way to drop an enum value, and this session can't confirm zero rows use it.
It stays valid at the database level, retired from the application (not
offered in any form/UI), and its display label folds into "Waiting Document"
(`STATUS_LABELS` in `loan-cases-data.ts`) so a legacy row still reads
sensibly rather than as an error.

**A first real status-change capability now exists**
(`updateLoanCaseStatus`, `StatusChanger` component on the case header) —
necessary for "Status Changed" timeline entries to ever fire, and the first
way to move a case through the pipeline after creation at all.

**The Timeline is a new, purpose-built table — not `audit_logs`.**
`audit_logs` is `super_admin`-only by RLS (a deliberate Sprint 4 decision);
this timeline must be visible to the banker working the case. Only 3 event
types are actually stored (`document_uploaded`, `ocr_completed`,
`status_changed`) — "Customer Created" and "Loan Created" are synthesized at
read time from `customers.created_at` / `loan_cases.created_at` (already
exist, no need to duplicate), and "Checklist Updated" is synthesized from
the existing `loan_case_required_document_events` table (Sprint 6.2 Phase 1)
rather than recording it a second time.

**Checklist progress and the Next Action Card are two distinct, small
components**, not one. Checklist progress ("N / M Completed") is a
glance-view of the same `getRequiredDocuments` data already shown in full on
the Documents tab — they can never disagree, since both read the same
function. The Next Action Card's "Current Progress" means *pipeline*
progress (position in `STATUS_PIPELINE_ORDER`), a different axis than
document completion.

**The Next Action Card is rule-based, not AI** — deliberately distinct from
the existing AI Case Summary card's "Next Action" field (Day 1). Both now
exist on the Overview tab; they answer a similar question from two different
mechanisms on purpose, not by accident. See `src/lib/next-action/determine-next-action.ts`.

**Loan Health Score**: equal-weighted average of 4 factors, each 0-100 —
Document Completion (active checklist rows completed / total), Required
Fields (borrower profile fields filled / 4), OCR Success (successful
extractions / attempts, 100 if none attempted yet — not attempting isn't a
failure), Workflow Progress (position in the status pipeline; `Rejected`
counts as 100%, since it's a reached decision, not a penalty for the
outcome). Pure function
(`src/lib/loan-health/calculate-health-score.ts`), no AI, no external call.

**Estimated Completion is a disclosed heuristic**, not a promise — a fixed
number of days per remaining pipeline step, explicitly labeled "a rough
estimate... not a commitment" in the UI.

## Consequences

- Every existing consumer of `LoanStatus` (dashboard, list, header, badges,
  the create-case Zod schema) was updated in this same change — a case that
  was `on_hold` before this ships will display as "Waiting Document" going
  forward, not an error, but its raw DB value is unchanged.
- `STATUS_LABELS` moved from 3 duplicated copies (dashboard.ts, loan-cases.ts,
  loan-case-details.ts) into one shared export in `loan-cases-data.ts` while
  this was already being touched — consolidation, not scope creep.
- The dead mock `loanCases` array in `loan-cases-data.ts` (already flagged in
  the roadmap as unused) was removed — it would not have type-checked under
  the new `LoanStatus` union and had zero real importers.

## Evidence

`supabase/migrations/20260725010000_loan_workflow.sql`,
`src/lib/loan-cases-data.ts`, `src/lib/timeline/*.ts`,
`src/lib/database/timeline.ts`, `src/lib/loan-health/*.ts`,
`src/lib/database/loan-health.ts`, `src/lib/next-action/determine-next-action.ts`,
`src/app/(app)/loan-cases/[id]/actions.ts` (`updateLoanCaseStatus`).
