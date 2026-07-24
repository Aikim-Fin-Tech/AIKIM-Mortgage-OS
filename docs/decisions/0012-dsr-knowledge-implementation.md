# 0012. DSR Rules Knowledge Implementation — Sprint 6.3B-3

Status: Proposed (migrations authored, not confirmed run against the live database)
Date: 2026-07-28

## Context

Sprint 6.3B-1 ([0010](0010-income-knowledge-implementation.md)) implemented
Income Knowledge and built the domain-agnostic Evidence Layer (`evidence`,
`derivation_results`). Sprint 6.3B-2
([0011](0011-commitment-knowledge-implementation.md)) implemented Commitment
Knowledge as the first real test of that domain-agnostic bet, reusing both
tables unmodified. Sprint 6.3B-3 implements the third slice, DSR Rules
Knowledge, and is the second confirmation of that bet — again zero changes
to `banks`, `bank_products`, `evidence`, or `derivation_results`. This ADR
is not a re-statement of the DB PRD's already-approved Section 3.6 spec —
it records the technical decisions made while actually building this slice
end-to-end, in particular where its matching shape diverges from both prior
domains and where it becomes the first domain to consume another domain's
`derivation_results` output.

## Decisions

**Scope: exactly ONE new table**, `dsr_rules`. `banks`, `bank_products`,
`evidence`, and `derivation_results` (all built in Sprint 6.3B-1) are reused
unmodified — no schema change to any of them.
`derivation_results.domain`'s `CHECK` constraint already accepted `dsr` as
of that migration, so this domain needed zero changes to the shared
Evidence Layer tables to start writing into it.

**`dsr_rules` matches on a numeric range, not a wildcard-equality
dimension — the first table in this Knowledge Base to do so.**
`income_recognition_rules` matches on 4 borrower-profile wildcard columns;
`commitment_recognition_rules` matches on one required exact-match column
(`commitment_type`) plus the shared `bank_id`/`bank_product_id` scoping;
`dsr_rules` has neither — its third matching dimension,
`income_tier_lower_bound`/`income_tier_upper_bound`, is a half-open numeric
range test (`lower IS NULL OR income >= lower` AND
`upper IS NULL OR income < upper`), not an equality-or-wildcard test. This
is recorded as an inline design note directly above the `CREATE TABLE`
statement in `20260728010000_dsr_knowledge_schema.sql`, and again as
per-column `COMMENT ON COLUMN` text on both bound columns.
`src/lib/dsr-knowledge/match-dsr-rule.ts` follows through on that note: it
deliberately does not reuse the coalesce-to-empty-string/equality-wildcard
helper every prior matcher (`match-income-rule.ts`,
`match-commitment-rule.ts`) shares, since a range test is a different
operation from an equality-or-wildcard test — that helper would be the
wrong tool for this dimension. Specificity/most-specific-wins is extended
to 3 dimensions (`bankProductId !== null`, `incomeTierLowerBound !== null`,
`incomeTierUpperBound !== null` each contribute a point), the same "fewer
wildcards wins" spirit as the other two matchers, generalized.

**DSR is the first domain in this Knowledge Base to consume another
domain's `derivation_results` output rather than raw `evidence`.**
`src/lib/dsr-knowledge/actions.ts`'s `computeDsrForCase` reads
`derivation_results` rows produced by Income Recognition
(`domain = 'income_recognition'`) and Commitment Recognition
(`domain = 'commitment_recognition'`), sums each domain's contributing rows,
and only then matches a `dsr_rules` row against the resulting recognized-
income figure. It correctly handles that the two upstream domains' `result_value`
shapes differ — a bare number for `income_recognition`, an object
(`result_value.recognizedAmount`) for `commitment_recognition`, per 0011's
domain-specific-shape precedent — rather than assuming a single shape across
both.

**`input_evidence_ids: []` with derivation-result lineage moved into
`result_value` instead — a considered decision, not an omission.**
`derivation_results.input_evidence_ids` is documented specifically as
holding `evidence.id` values. Because `dsr`-domain rows are computed from
other `derivation_results` rows, not `evidence` rows, `computeDsrForCase`
sets `input_evidence_ids` to `[]` and instead embeds
`incomeDerivationResultIds`/`commitmentDerivationResultIds` inside
`result_value`. A security-review pass on the TypeScript layer flagged that
this fact was undiscoverable from the database side alone (the column's
original comment says nothing about a domain-specific exception), so
`20260728010000_dsr_knowledge_schema.sql`'s `comment on column
derivation_results.input_evidence_ids` was extended to state this exception
at the schema level too — not left as an application-code-only fact.

**`computeDsr` treats the proposed instalment as an opaque input and does
not compute an amortization/stress-tested figure — a real scope boundary,
recorded as a decision, not just an implementation detail.**
`src/lib/dsr-knowledge/compute-dsr.ts` computes `dsrRatio =
(totalRecognizedCommitments + proposedInstalmentAmount) /
totalRecognizedIncome * 100` and a `passed` boolean (`null` if
`maxDsrPercentage` isn't configured on the matched rule). It deliberately
does not derive `proposedInstalmentAmount` itself from a loan amount,
tenure, and rate — `loan_cases` has no such columns today, and correctly
applying `stressTestRateBufferPercentage` requires redoing an amortization
calculation, not linearly scaling the instalment number. That percentage is
therefore surfaced only as informational pass-through in the result, never
applied to the arithmetic. This means DSR does not do what a naive reading
of "DSR calculation" might expect (compute the instalment itself) — it
computes the ratio given an instalment supplied by the caller.

**No RPC, still no UI — for a different reason than originally stated.**
`computeDsrForCase` is a single-table insert into `derivation_results` (it
reads several tables but writes one row), so a plain Server Action is the
correct, minimal pattern here — same reasoning as `computeIncomeRecognition`
/ `computeCommitmentRecognition` in 0010/0011; no RPC applies. There is
still no admin UI this sprint (same explicit CTO scope limit as 0010/0011),
but — unlike this ADR's original version — that is not because the sprint
stopped at schema: the full TypeScript service layer
(`src/lib/dsr-knowledge/*.ts`, `src/lib/database/dsr-knowledge.ts`) was
built, security-reviewed, and QA-verified in the same unit of work. All
three integrity fixes 0010 and 0011 each needed at least one of (Zod
validation, bank/product cross-check, audit-trail id verification) were
applied proactively from the start this sprint and confirmed correct by
security review — no fixes were required.

**The integrity guard covers bank_id/bank_product_id/version, deliberately
NOT the income-tier range — and that gap is named explicitly, not left
implicit.** `dsr_rules_active_profile_version_idx` mirrors
`commitment_recognition_rules_active_profile_version_idx`'s shape (scoped
to this table's real matching dimensions, not copy-pasted from income's
four-column guard), but a partial unique btree index cannot express
"reject two active rows whose numeric ranges overlap" — that requires a
materially different mechanism (`EXCLUDE USING gist`), which this
migration's brief explicitly does not authorize building. The migration
file documents this gap inline, quoting the exact accepted-gap precedent
`mortgage_rules` already established in Sprint 6.2 Phase 1 for its own
NULL-uniqueness limitation ("rule data is human-curated and low-volume, so
this is an accepted gap for now, not a blocking issue") and applying the
same reasoning to DSR's income-tier overlap case. This is a conscious,
named Phase 1 gap, not an oversight discovered later.

**No `max_dsr_percentage` or `stress_test_rate_buffer_percentage` seeded,
even illustratively.** Both prior seeds (`recognition_method = 'full_value'`
for Income, `recognition_method = 'full_instalment'` for Commitment) found
a genuinely safe, no-invented-number illustrative choice — a *method* name
requiring no accompanying percentage. DSR has no equivalent: any populated
`max_dsr_percentage` or `stress_test_rate_buffer_percentage`, even a
"round, commonly-cited" figure, would be indistinguishable from real,
confirmed bank policy to a future reader. `supabase/seeds/20260728010000_dsr_knowledge_seed.sql`
leaves both columns `NULL` and says so explicitly in its own comments,
rather than following the pattern of finding *a* safe illustrative value —
because for this table, no such value exists.

## Consequences

- `dsr_rules` has no admin UI and no insert/update/delete RLS policy this
  sprint — human-managed via the Supabase SQL Editor only, the same
  Phase-1-before-Phase-2 posture `income_recognition_rules` and
  `commitment_recognition_rules` shipped with.
- Two active `dsr_rules` rows with overlapping income-tier ranges for the
  same bank/product/version are not rejected by the database — an accepted
  Phase 1 gap, consistent with `mortgage_rules`' own NULL-uniqueness gap.
  If DSR rule volume grows materially, revisiting this with a
  `tstzrange`/`numrange` `EXCLUDE` constraint is a future, separately-scoped
  option, not attempted here.
- `dsr` is now the one domain in `derivation_results` whose lineage is not
  discoverable via `input_evidence_ids` — a future reader of that table
  (a report, a debugging session, a future domain author) must know to look
  inside `result_value.incomeDerivationResultIds`/
  `commitmentDerivationResultIds` for `domain = 'dsr'` rows instead. This is
  now documented at both the schema level (the `input_evidence_ids` column
  comment) and here, but it is a real asymmetry a generic
  `derivation_results` reader must account for, not a cosmetic detail.
- DSR's numerator is only as good as whatever `proposedInstalmentAmount` a
  caller supplies — since no amortization/stress-test module exists yet,
  `computeDsrForCase` cannot independently verify or derive that figure, and
  a caller passing a wrong or stale instalment amount will produce a
  DSR ratio that is arithmetically correct but substantively meaningless.
  This is a real limitation of what DSR can currently compute, not just an
  implementation footnote — a future amortization module is a prerequisite
  for DSR to be trustworthy end-to-end, not an optional enhancement.
- 3 of the DB PRD's remaining tables (`property_rules`, `eligibility_verdicts`,
  `eligibility_verdict_derivation_results`, `ai_recommendations` — 4,
  actually) still do not exist. `derivation_results.domain` already accepts
  `property_rules`, so that future domain can land the same way this one
  did: one new rule table, zero changes to the shared Evidence Layer.

## Correction note

This ADR's first version was written after only the schema/RLS/seed step of
this sprint had landed, and its Decisions section incorrectly stated the
sprint was schema-only with no TypeScript matcher, Server Action, or admin
surface. The sprint continued in the same unit of work: the full TypeScript
layer described above was then built, security-reviewed, and QA-verified.
A security-review pass on that layer flagged the ADR as contradicting the
actual implementation, and this version corrects it. No decisions described
here were reversed — the schema-only decisions from the first version stand
unchanged; only the ADR's claim about where the sprint stopped was wrong.

## Evidence

`supabase/migrations/20260728010000_dsr_knowledge_schema.sql`,
`supabase/migrations/20260728020000_dsr_knowledge_rls.sql`,
`supabase/seeds/20260728010000_dsr_knowledge_seed.sql`,
`src/lib/dsr-knowledge/types.ts`,
`src/lib/dsr-knowledge/match-dsr-rule.ts`,
`src/lib/dsr-knowledge/compute-dsr.ts`,
`src/lib/dsr-knowledge/actions.ts`,
`src/lib/database/dsr-knowledge.ts`,
`docs/product/mortgage-knowledge-database-prd.md`.
