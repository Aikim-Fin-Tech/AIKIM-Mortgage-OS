# Mortgage Engine

How a loan case actually moves through AIKIM, end to end — the business-process
view. For the rule-matching mechanism specifically, see [RULE_ENGINE.md](RULE_ENGINE.md).
For the AI pieces, see [AI_ENGINE.md](AI_ENGINE.md). Full workflow detail:
[WORKFLOW.md](WORKFLOW.md). Business terminology: [docs/business/terminology.md](business/terminology.md).

## The Case Lifecycle

1. **Case created** — `create_loan_case` RPC, atomic: resolves the acting
   staff member, creates or reuses a customer, inserts the `loan_cases` row
   with a server-generated `case_number`.
2. **Borrower Profile set** — 4 fields (nationality, income country,
   employment type, income structure) on the case, edited via a card on the
   Overview tab.
3. **Checklist generated** — saving the profile triggers the Rule Engine
   (see [RULE_ENGINE.md](RULE_ENGINE.md)), producing a per-case required
   document list.
4. **Documents uploaded** — against the checklist's document types; OCR can
   be run on NRIC/salary slip uploads.
5. **Status progresses** — through the 7-state pipeline (below), manually
   changed via the case header's status control.
6. **Case reaches Approved or Rejected** — terminal states.

Every step above (except case creation itself) is recorded in the case
**Timeline** — see [WORKFLOW.md](WORKFLOW.md).

## Loan Status Pipeline

```
New → Waiting Document → Under Review → Ready to Submit → Submitted → Approved
                                                                    ↘ Rejected
```

Raw DB values are lowercase snake_case; `Rejected` is a terminal state
reachable from anywhere, not a pipeline step. Full enum history (including the
`on_hold` retirement): [DATABASE.md](DATABASE.md). Full reasoning:
[ADR 0009](decisions/0009-loan-processing-workflow.md).

## Loan Health Score

Deterministic, **no AI**, equal-weighted average of 4 factors (each 0-100):

| Factor | Formula |
|---|---|
| Document Completion | completed active checklist items / total active checklist items (100 if none required yet) |
| Required Fields | filled borrower-profile dimensions / 4 |
| OCR Success | successful extractions / OCR attempts (100 if none attempted — not attempting isn't a failure) |
| Workflow Progress | position in the status pipeline (`Rejected` counts as 100% — a reached decision, not a penalty for the outcome) |

Pure function: `src/lib/loan-health/calculate-health-score.ts`. Consumed by
`getLoanHealthScore()` (`src/lib/database/loan-health.ts`), which gathers the
real inputs by composing existing read functions rather than re-querying.

## Next Action Card (Rule-Based, Not AI)

Deliberately distinct from the AI Case Summary's AI-generated next-action
field (see [AI_ENGINE.md](AI_ENGINE.md)) — both exist on the Overview tab on
purpose, answering the same question via two different mechanisms.

Pure function: `src/lib/next-action/determine-next-action.ts`. Simplified
decision order:
1. `Rejected` → "Case closed."
2. `Approved` → "Proceed with disbursement."
3. No checklist generated yet → "Complete the Borrower Profile."
4. Missing documents → "Collect missing document(s): {list}."
5. `Submitted` → "Awaiting the bank's decision."
6. `Ready to Submit` → "Submit this case to the bank."
7. Otherwise → "Move this case to Ready to Submit."

"Estimated Completion" is a disclosed heuristic (fixed days per remaining
pipeline step), explicitly labeled in the UI as an estimate, not a commitment.

## Checklist Progress

"N / M Completed" — a glance-view on the Overview tab reading the exact same
`getRequiredDocuments` data shown in full on the Documents tab. The two views
can never disagree, by construction.

## What Ties It Together

Every one of these — Health Score, Next Action, Checklist Progress, Timeline —
reads from the same small set of composable functions
(`getLoanCaseDetails`, `getRequiredDocuments`, `getLoanCaseDocuments`,
`getCaseSummaryData`, `getCaseTimeline`) rather than each re-querying Supabase
independently. If you add a new case-level view, prefer composing these over
writing a new direct query.

## What's Done vs. TODO

**Done**: full pipeline, health score, next action, checklist progress,
timeline — all implemented and building clean.

**TODO**: link checklist completion to automatic stage transitions (not
built); document verify/reject workflow (not built, `document_status` exists
but nothing changes it after upload); Dashboard status-bucket view (needs
product input — see [TODO.md](TODO.md)).
