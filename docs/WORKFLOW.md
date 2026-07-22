# Workflow (Case Timeline)

How the case Timeline is assembled — the automatically-recorded event history
requested for "Customer Created, Loan Created, Document Uploaded, OCR
Completed, Checklist Updated, Status Changed." Business context:
[MORTGAGE_ENGINE.md](MORTGAGE_ENGINE.md). Design reasoning:
[ADR 0009](decisions/0009-loan-processing-workflow.md).

## Why Not `audit_logs`

`public.audit_logs` already exists and is trigger-populated on `loan_cases`
changes, but its RLS restricts reads to `super_admin` only (a Sprint 4
decision, predating this documentation effort). The case Timeline must be
visible to the banker actually working the case, so it is a **new, purpose-built
table** (`loan_case_timeline_events`), not a reuse of `audit_logs`.

## Three Sources, Merged at Read Time

`getCaseTimeline(caseNumber)` (`src/lib/database/timeline.ts`) merges:

| Entry type | Source | Why |
|---|---|---|
| Customer Created | Synthesized from `customers.created_at` | Already exists, no need to duplicate |
| Loan Created | Synthesized from `loan_cases.created_at` | Already exists, no need to duplicate |
| Document Uploaded | Explicit row, `loan_case_timeline_events` | Recorded in `recordDocumentUpload` |
| OCR Completed | Explicit row, `loan_case_timeline_events` | Recorded in `extractDocumentData`, regardless of success/failure |
| Status Changed | Explicit row, `loan_case_timeline_events` | Recorded in `updateLoanCaseStatus` |
| Checklist Updated | Synthesized from `loan_case_required_document_events` | Already exists (Rule Engine, [RULE_ENGINE.md](RULE_ENGINE.md)) — not recorded twice |

Only 3 event types are ever actually written to `loan_case_timeline_events`:
`document_uploaded`, `ocr_completed`, `status_changed`. Everything else is
computed at read time from data that already exists elsewhere.

## Recording Helper

`recordTimelineEvent(supabase, loanCaseId, eventType, description, actorUserId)`
(`src/lib/timeline/record-timeline-event.ts`) — never throws, never blocks the
caller's primary action. A timeline write failure is logged, not surfaced as a
user-facing error, since by the time it runs the actual action (upload/OCR/
status change) has already succeeded.

## Status Change — First Capability of Its Kind

Before this workflow was built, a case's status could only be set at
creation. `updateLoanCaseStatus(caseNumber, newStatus)`
(`src/app/(app)/loan-cases/[id]/actions.ts`) is the first way to change it
afterward — a small `Select` control (`StatusChanger` component) on the case
header, `STAFF_ROLES`-gated, auto-submits on change and records a
`status_changed` timeline entry.

## Display

`CaseTimelineCard` (`src/components/loan-cases/detail/CaseTimelineCard.tsx`),
newest-first, on the Overview tab. The older `CaseActivityTimeline` component
(reads `audit_logs`, `super_admin`-only) still exists in the codebase but is
**no longer used on any page** — superseded, not deleted. See
[TODO.md](TODO.md).

## What's Done vs. TODO

**Done**: all 3 explicit event types wired in, both synthesized sources,
merged display, status-change capability.

**TODO**: no event type exists yet for document verify/reject (that workflow
isn't built at all — see [MORTGAGE_ENGINE.md](MORTGAGE_ENGINE.md)); consider
whether `CaseActivityTimeline.tsx` should eventually be deleted now that it's
dead code.
