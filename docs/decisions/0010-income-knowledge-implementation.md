# 0010. Income Knowledge Implementation — Sprint 6.3B-1

Status: Proposed (migrations authored, not confirmed run against the live database)
Date: 2026-07-26

## Context

`docs/product/mortgage-knowledge-database-prd.md` is the CTO-approved blueprint
for an 11-table Mortgage Knowledge Database (Bank/Product Knowledge, Evidence
Layer, Derivation/Computation Knowledge across four domains, Eligibility
Engine, AI Recommendation). Sprint 6.3B-1 implements the first slice of it:
Income Knowledge. This ADR is not a re-statement of that already-approved
product spec — it records the technical decisions made while actually
building this slice, the same way [0006](0006-mortgage-rules-engine.md)
documents Mortgage Rules Engine's real implementation decisions rather than
re-litigating a brief.

## Decisions

**Scope: 5 tables, not the full 11-table blueprint.** `banks`, `bank_products`,
`income_recognition_rules`, `evidence`, and `derivation_results` — per the DB
PRD's Section 11 dependency diagram. `commitment_recognition_rules`,
`dsr_rules`, `property_rules`, `eligibility_verdicts`,
`eligibility_verdict_derivation_results`, and `ai_recommendations` are
deliberately not created. `evidence` and `derivation_results` are built now,
not deferred to a later domain's sprint, because they are the shared
foundation every future Derivation Knowledge domain (Commitment Knowledge,
Property Rules, DSR Rules) will also depend on — building them once here
avoids each future domain re-deciding the same shape.

**Migration split into two files, not this codebase's usual single-file
convention.** `20260726010000_income_knowledge_schema.sql` (table shape) and
`20260726020000_income_knowledge_rls.sql` (who can see it) are separate files
so a human reviewer can approve the shape of the data before approving access
to it — an explicit, small-reviewable-steps decision for this sprint's
higher-cardinality, higher-sensitivity tables, not a new house style being
declared for every future migration. Until the second file runs, every table
from the first is RLS-enabled with zero policies (inaccessible to anyone but
the table owner) — never silently open in between the two steps.

**`derivation_results.rule_id` is an app-validated plain `uuid`, no FK.**
`rule_id` conceptually points at whichever rule row (in
`income_recognition_rules` today; `commitment_recognition_rules`, `dsr_rules`,
or `property_rules` in future sprints, selected by `domain`) produced a given
result. The DB PRD flagged this as an open design note, naming two options:
(a) four nullable domain-specific reference columns, or (b) an unenforced
reference validated at the application layer. This sprint takes (b) — a
`NOT NULL uuid` with no `FOREIGN KEY` constraint, validated against `domain`
in TypeScript. Option (a) was rejected because three of the four target
tables (`commitment_recognition_rules`, `dsr_rules`, `property_rules`) don't
exist yet; using it would force this migration to invent stub tables purely
to have something for the FK to reference, schema for explicitly out-of-scope
domains. This extends [0006](0006-mortgage-rules-engine.md)'s precedent one
level further: not just "matching logic lives in TypeScript, not SQL," but
now "which table a reference even points at lives in TypeScript, not SQL,"
because the referenced schema itself doesn't fully exist yet.

**Two integrity guards added to `income_recognition_rules` beyond the PRD's
column list, in this table's first migration rather than deferred.**
`income_recognition_rules` reuses `mortgage_rules`' exact wildcard-if-null
matching shape (four borrower-profile columns, nullable-is-wildcard,
most-specific-wins), so it needs the same two guards `mortgage_rules` shipped
for that shape in its own Phase 2
(`20260723010000_mortgage_rule_admin.sql`):
`income_recognition_rules_no_empty_string_wildcards` (a `CHECK` that the four
matching columns are `NULL`, never `''`, guarding against silently defeating
both a future matcher and the uniqueness index below) and
`income_recognition_rules_active_profile_version_idx` (a partial unique index
preventing two active rules from sharing the same bank/product scope +
matching profile + version). Both are added here, in Phase 1, rather than
deferred to a later Phase 2 migration the way `mortgage_rules` did it —
possible because `version` (the column the second guard depends on) already
exists on `income_recognition_rules` from day one, unlike `mortgage_rules`,
which only got `version` in its own later Phase 2.

**Seeder kept out of `supabase/migrations/`, in a new `supabase/seeds/`
directory, as a template with placeholder values only.**
`supabase/seeds/20260726010000_income_knowledge_seed.sql` inserts nothing
meaningful as written (`REPLACE_WITH_REAL_BANK_NAME` and similar
placeholders) — a human must edit every `REPLACE_WITH_*` value with real,
confirmed bank data before running it, and no tooling in this repo auto-runs
it. This follows the DB PRD's own Section 8 recommendation
("no migration should insert fabricated bank/product/rule rows") and this
codebase's "real data only" principle (`CLAUDE.md`), the same posture
`mortgage_rules` shipped with (zero seeded rules).

**No RPC for either write path.** `recordEvidence` and
`computeIncomeRecognition` (`src/lib/income-knowledge/actions.ts`) are both
plain Server Actions, not `SECURITY INVOKER` RPCs. Both are single-table
inserts (into `evidence` and `derivation_results` respectively) with RLS as
the real authorization boundary — `computeIncomeRecognition` reads several
tables to compute its result, but only ever writes one row. This is
consistent with `document_extractions`' existing insert pattern
([0008](0008-ocr-and-ai-case-summary.md)); [0004](0004-atomic-multitable-writes-via-security-invoker-rpc.md)'s
RPC pattern is reserved for genuine multi-table atomic writes, which neither
of these is.

**No UI this sprint.** An explicit CTO scope limit, not an oversight — the
TypeScript service layer (`src/lib/income-knowledge/*.ts`,
`src/lib/database/income-knowledge.ts`) is fully usable and unit-testable on
its own, just not wired into any page or route yet.

**Two fixes required during security review before this was considered
done:**
- Zod validation was initially omitted from both Server Actions, since
  neither has a `FormData` boundary this sprint (no page calls them yet).
  Added to match this codebase's existing boundary-validation convention
  (`src/app/(app)/loan-cases/new/actions.ts`,
  `src/app/(app)/settings/mortgage-rules/actions.ts`) — `recordEvidenceSchema`
  and `computeIncomeRecognitionSchema` now validate every typed argument
  before any database call.
- `derivation_results.input_evidence_ids` was fixed to persist only the
  `evidence` rows actually found and used
  (`evidenceRows.map((row) => row.id)`), never the raw caller-supplied
  `evidenceIds` array. Silently persisting an unverified id would let a typo,
  a wrong case's id, or an id RLS hid still get recorded as if it had
  contributed to the result — a correctness bug in the audit trail itself,
  which this table exists specifically to protect.

## Consequences

- `derivation_results.rule_id` cannot be joined against a single table by the
  database — any query needing the matched rule's full row must first read
  `domain`, then query the corresponding rule table in application code.
  Accepted, matching [0006](0006-mortgage-rules-engine.md)'s existing
  trade-off for `mortgage_rules` matching.
- The two-file migration split means the schema migration alone (if run in
  isolation and not immediately followed by the RLS migration) leaves all 5
  tables completely inaccessible, not merely under-secured — a safe failure
  mode, but one a human running these manually must not stop halfway through.
- `banks`, `bank_products`, and `income_recognition_rules` have no admin UI
  and no insert/update/delete RLS policy in this sprint — human-managed via
  the Supabase SQL Editor only, same Phase-1-before-Phase-2 posture
  `mortgage_rules` and `document_categories` shipped with. Writing real bank
  policy today means a human runs SQL by hand.
- `evidence.value` and `derivation_results.result_value` are untyped `jsonb`
  at the database layer, validated only by convention (e.g.
  `computeIncomeRecognition` assumes a numeric income figure) — a
  data-shape assumption this sprint's brief did not fully specify. Accepted
  for Phase 1; a stricter shape may be worth revisiting once Commitment
  Recognition and DSR start writing to the same shared tables with different
  value shapes.
- The remaining 6 tables of the DB PRD's blueprint (`commitment_recognition_rules`,
  `dsr_rules`, `property_rules`, `eligibility_verdicts`,
  `eligibility_verdict_derivation_results`, `ai_recommendations`) still do not
  exist. `derivation_results.domain`'s `CHECK` constraint already accepts
  their values (`commitment_recognition`, `property_rules`, `dsr`), so adding
  those rule tables in a future sprint needs no change to `derivation_results`
  itself — the intended benefit of building the shared foundation now.

## Evidence

`supabase/migrations/20260726010000_income_knowledge_schema.sql`,
`supabase/migrations/20260726020000_income_knowledge_rls.sql`,
`supabase/seeds/20260726010000_income_knowledge_seed.sql`,
`src/lib/income-knowledge/match-income-rule.ts`,
`src/lib/income-knowledge/recognize-income.ts`,
`src/lib/income-knowledge/actions.ts`,
`src/lib/income-knowledge/types.ts`,
`src/lib/database/income-knowledge.ts`,
`docs/product/mortgage-knowledge-database-prd.md`.
