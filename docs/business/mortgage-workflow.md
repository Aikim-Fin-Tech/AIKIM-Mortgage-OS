# Mortgage Case Lifecycle

The intended progression of a `loan_cases` row, per the schema's enums —
**Implemented** at the data-model level. The UI to drive transitions after creation
is **Planned** (does not exist yet) — see [banker-workflow.md](banker-workflow.md).

## Stages (`loan_stage`) — **Implemented**

1. `new_enquiry` — initial interest captured.
2. `document_collection` — gathering documents from the customer.
3. `credit_review` — internal creditworthiness/eligibility review.
4. `bank_submission` — submitted to the named bank for a decision.
5. `approved` — bank approved.

No `rejected` stage — rejection is a `status`, not a `stage`. No `cancelled` anywhere
in the schema.

## Statuses (`loan_status`) — **Implemented**

- `under_review`, `documents_pending`, `submitted`, `on_hold` — active.
- `approved`, `rejected` — decided (used for approval-rate math on the dashboard).

## Who can create a case — **Implemented**

`STAFF_ROLES` = `super_admin`, `banker`, `property_agent`, `mortgage_outsource_agent`.
Enforced by RLS (policy definitions not committed — see
[../architecture/database.md](../architecture/database.md)); mirrored in
`createLoanCase` for a friendlier error only.

## Case creation transaction (`create_loan_case` RPC) — **Implemented**

1. Resolve acting `user_profiles.id` from `auth.uid()`.
2. Look up an existing customer (RLS-checked) or insert a new one.
3. Insert `loan_cases` with a server-generated `case_number` (`ML-<year>-<n>`).
4. Existing trigger writes the `audit_logs` row — the RPC does not duplicate it.

Any step failing rolls back the whole transaction — no orphaned customer row.

## Documents relative to a case — **Implemented** (data), **Planned** (rules)

`documents.loan_case_id → loan_cases.id`, each with its own `document_status`,
independent of the case's `stage`/`status` — this relationship is live. No rule (app
or DB) currently links "all documents verified" to a stage transition — that link, if
wanted, is **Planned**, not implemented.

## Required document checklist — **Implemented** (Sprint 6.2 Phase 1)

A case's four borrower profile fields (`nationality`, `income_country`,
`employment_type`, `income_structure`), edited via the Overview tab's Borrower
Profile card, are matched against `mortgage_rules` to generate a required-document
checklist (`loan_case_required_documents`), shown on the Documents tab. See
[terminology.md](terminology.md) and
[../decisions/0006-mortgage-rules-engine.md](../decisions/0006-mortgage-rules-engine.md).
Not yet linked to `stage`/`status` transitions — that remains the open question
below, now with a concrete data source (the checklist's completion %) to drive it.

## Open questions (for `product-manager`, not yet answered by the code)

- Should stage/status transitions be role-restricted?
- Should `bank_submission` require all documents `verified` first?
- Is `rejected` reachable from every stage, or only after `bank_submission`?
