# 0006. Mortgage Rules Engine — matching in TypeScript, rule data in the database

Status: Proposed (migration authored, not confirmed run against the live database)
Date: 2026-07-22

## Context

Sprint 6.2 Phase 1 needs to generate a per-case required-document checklist
from four borrower profile fields (nationality, income country, employment
type, income structure), without hardcoding which documents are required for
which combination. The brief also states this engine is the foundation for
future OCR, AI document screening, DSR calculation, eligibility, bank-product
matching, and recommendation work — none of which are in scope for this
sprint, but the architecture should not need a rewrite to add them later.

## Decision

**Rule data lives in the database; the matching algorithm lives in
TypeScript.** This was an explicit product decision (not the author's
default recommendation, which was a `SECURITY INVOKER` Postgres RPC matching
the Sprint 6.1 `create_loan_case` pattern — see
[0004](0004-atomic-multitable-writes-via-security-invoker-rpc.md)). The
reasoning: future extensions (OCR, AI calls, DSR, recommendation) fundamentally
cannot live inside a Postgres function, so building the matcher as a
TypeScript service now, designed for extension, avoids a rewrite later.

Concretely:
- `mortgage_rules` / `mortgage_rule_documents` store the actual rule data —
  no document requirement is ever hardcoded in TypeScript.
- `src/lib/mortgage-rules/match-rule.ts` is a pure, dependency-free function
  implementing wildcard/most-specific-wins matching: a rule field of `null`
  matches any value for that dimension; among every matching rule, the one
  with the fewest wildcards wins; ties break to the most recently updated rule.
- `src/lib/mortgage-rules/generate-required-documents.ts` orchestrates
  reading the matched rule's documents and reconciling them into
  `loan_case_required_documents`, called from
  `src/app/(app)/loan-cases/[id]/actions.ts` after the profile form saves.

**Completion is computed live, never stored.** `loan_case_required_documents`
only stores what can't be derived (`state`: `active` vs `not_required`).
Whether a requirement is "Completed" or "Missing" is computed at read time by
counting matching rows in `public.documents` against `required_count` — so it
can never drift out of sync with what's actually been uploaded.

**Regeneration never deletes.** A document type no longer required by the
current rule is marked `not_required`, never removed — its row (and any
uploaded document against it) survives. A full audit trail of every
add/mark-not-required/reactivate transition is written to
`loan_case_required_document_events`.

**`document_types` (Sprint 6.1) is extended, not duplicated.** A new
`document_categories` table groups it via an additive `category_id` column,
so a required document and an uploaded document are always the same
`document_type_id` — never two catalogs that can drift apart.

## Consequences

- Not atomic: a TypeScript service calling Supabase multiple times can't wrap
  them in one database transaction the way a `SECURITY INVOKER` RPC could.
  Every step is written to be idempotent, so re-saving the profile self-heals
  any partial failure — accepted trade-off for Phase 1, given the extensibility
  requirement above.
- The 4 profile fields are free text on `loan_cases`, validated at the
  application layer against `src/lib/mortgage-rules/borrower-profile-options.ts`,
  not a database enum or lookup table — the exact value vocabulary was not
  specified in the brief and is flagged there for product review. Rule
  authors must use these exact strings for matching to work.
- `mortgage_rules`, `mortgage_rule_documents`, and `document_categories` have
  no admin UI in Phase 1 — they're human-managed via the Supabase SQL Editor,
  same posture as `document_types` today. **No rule data is seeded by the
  migration** — ships with an honest empty state until real rules are entered
  (see "No mock data" in the sprint brief and `CLAUDE.md`).
- Known Phase 1 gap: `mortgage_rules`' unique constraint on the 4 matching
  columns doesn't catch two fully-identical wildcard rules, since Postgres
  treats `NULL` as always-distinct in a unique index. Accepted for now — rule
  data is low-volume and human-curated.

## Illustrative example (NOT executed, NOT part of the migration)

Shown only to make the row shapes concrete for whoever authors real rules —
this is fabricated example data, not a real Malaysian mortgage policy, and
must not be run as-is against any environment:

```sql
-- example only — do not run
insert into document_categories (name, display_order) values
  ('Identity', 1), ('Income Proof', 2);

insert into document_types (name, category_id) values
  ('NRIC', (select id from document_categories where name = 'Identity')),
  ('Salary Slip', (select id from document_categories where name = 'Income Proof')),
  ('EPF Statement', (select id from document_categories where name = 'Income Proof'));

insert into mortgage_rules (rule_name, nationality, employment_type) values
  ('Malaysian salaried — baseline', 'Malaysian', 'Salaried');

insert into mortgage_rule_documents (mortgage_rule_id, document_type_id, required_count, required_months)
select r.id, dt.id, 2, null from mortgage_rules r, document_types dt
  where r.rule_name = 'Malaysian salaried — baseline' and dt.name = 'NRIC';
-- (2 = front + back, no "months" concept for an identity document)

insert into mortgage_rule_documents (mortgage_rule_id, document_type_id, required_count, required_months)
select r.id, dt.id, 3, 3 from mortgage_rules r, document_types dt
  where r.rule_name = 'Malaysian salaried — baseline' and dt.name = 'Salary Slip';
-- (3 = last 3 months' payslips)
```

## Evidence

`supabase/migrations/20260722010000_mortgage_rules_engine.sql`,
`src/lib/mortgage-rules/*.ts`,
`src/app/(app)/loan-cases/[id]/actions.ts`,
`src/lib/database/required-documents.ts`.
