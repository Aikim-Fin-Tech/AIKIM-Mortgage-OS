# 0011. Commitment Knowledge Implementation — Sprint 6.3B-2

Status: Proposed (migrations authored, not confirmed run against the live database)
Date: 2026-07-27

## Context

Sprint 6.3B-1 ([0010](0010-income-knowledge-implementation.md)) implemented
Income Knowledge as the first slice of the CTO-approved 11-table Mortgage
Knowledge Database (`docs/product/mortgage-knowledge-database-prd.md`), and
deliberately built the Evidence Layer (`evidence`, `derivation_results`)
domain-agnostic so every future Derivation Knowledge domain could reuse it.
Sprint 6.3B-2 implements the second slice, Commitment Knowledge, and is the
first real test of that bet. This ADR is not a re-statement of the DB PRD's
already-approved Section 3.5 spec — it records the technical decisions made
while actually building this slice, and in particular where this slice
diverges from 0010's precedent rather than mirroring it.

## Decisions

**Scope: exactly ONE new table**, `commitment_recognition_rules`. `banks`,
`bank_products`, `evidence`, and `derivation_results` (all built in Sprint
6.3B-1) are reused unmodified — no schema change to any of them. This is
0010's domain-agnostic foundation paying off directly:
`derivation_results.domain`'s `CHECK` constraint already accepted
`commitment_recognition` as of that migration, so this domain needed zero
changes to the shared Evidence Layer tables to start writing into it.

**`commitment_recognition_rules` deliberately does not mirror
`income_recognition_rules`' shape.** It has no borrower-profile wildcard
columns (nationality / income_country / employment_type /
income_structure) — per DB PRD Section 3.5, matching here is `bank_id`
(required, exact) + `bank_product_id` (nullable, wildcard) +
`commitment_type` (required, exact) only, a materially simpler matcher
(`src/lib/commitment-knowledge/match-commitment-rule.ts`) with no
`BorrowerProfile` involved at all. It also carries no `CHECK` constraint on
`commitment_type` or `recognition_method`, unlike
`income_recognition_rules.recognition_method`'s `CHECK`: the DB PRD
introduces both columns' vocabularies with illustrative language ("e.g."),
not a definitively closed set the way it names income's three treatment
shapes. `recognize-commitment.ts` reflects this directly — it handles known
`recognition_method` values and returns a clear `{ error }` for anything
else, rather than an exhaustive-switch/`default: throw` pattern, because an
unrecognized method here is an expected, open-vocabulary outcome, not a
programmer error the way an unhandled income treatment shape would be.

**The integrity guard is scoped to this table's actual matching
dimensions, not copy-pasted from income's.**
`commitment_recognition_rules_active_profile_version_idx` is a partial
unique index over `bank_id`, `bank_product_id`, `commitment_type`, and
`version` — this table's real matching profile — rather than
`income_recognition_rules_active_profile_version_idx`'s four
borrower-profile columns, which have no equivalent here. No
empty-string-wildcard `CHECK` guard was added, unlike
`income_recognition_rules_no_empty_string_wildcards`: this table's only
nullable matching column, `bank_product_id`, is a `uuid` with no
empty-string failure mode, and `commitment_type` is not a wildcard at all
(required, exact match). Copying that guard here would defend against a
failure mode this table's column shape cannot produce.

**`recordEvidence` was reused as-is from
`src/lib/income-knowledge/actions.ts`, not duplicated.** This is the direct,
concrete payoff of the Evidence Layer being domain-agnostic, per the CTO's
own Sprint 6.3B-1 feedback that `derivation_results` should stay
domain-agnostic "so Income, Commitment, Property, and future Knowledge
domains all write into the same derivation pipeline." One minor naming
smell results: `recordEvidence` now lives under a path named
`income-knowledge` despite being shared across domains — flagged as a
future cleanup candidate, not addressed this sprint, to keep the diff
minimal per the CTO's "small, reviewable steps" instruction.

**A new concept `income_recognition_rules` didn't need: the "to be settled"
exclusion.** `recognizeCommitment` checks `isToBeSettled &&
rule.allowsToBeSettledExclusion` before any `recognitionMethod` logic —
income has no equivalent concept. A security-review pass found the initial
implementation would zero out a recognized amount with no persisted trace
of *why* it was zero (indistinguishable from a legitimate zero-balance
`full_instalment` computation). Fixed by changing
`derivation_results.result_value` for this domain from a bare number
(income's shape) to `{ recognizedAmount, isToBeSettled,
settlementExclusionApplied }`. This is a considered, domain-specific
divergence in what `result_value` holds, not an inconsistency —
`result_value`'s whole design, per 0010, is "shape varies by domain."

**No RPC.** `computeCommitmentRecognition`
(`src/lib/commitment-knowledge/actions.ts`) is a plain Server Action, same
reasoning as `computeIncomeRecognition` in 0010: it reads several tables but
writes a single row into `derivation_results`, so RLS is the real
authorization boundary and
[0004](0004-atomic-multitable-writes-via-security-invoker-rpc.md)'s RPC
pattern does not apply.

**No UI this sprint.** Same explicit CTO scope limit as Sprint 6.3B-1 — the
TypeScript service layer
(`src/lib/commitment-knowledge/*.ts`,
`src/lib/database/commitment-knowledge.ts`) is usable and unit-testable on
its own, not wired into any page or route yet.

**One security-review finding, already covered above:** the
`isToBeSettled`/`settlementExclusionApplied` persistence fix. Unlike 0010's
review, no Zod-validation, bank/product cross-check, or
audit-trail-id-integrity fixes were needed here — all three of those
patterns (`computeCommitmentRecognitionSchema`, the `bank_products`
cross-check, and persisting only the verified `evidenceRow.id`) were applied
proactively by the implementing agent from the start, confirmed correct on
review.

## Consequences

- `commitment_recognition_rules` has no admin UI and no insert/update/delete
  RLS policy this sprint — human-managed via the Supabase SQL Editor only,
  the same Phase-1-before-Phase-2 posture `income_recognition_rules`
  shipped with.
- `derivation_results.result_value`'s shape now visibly diverges by domain
  in practice, not just in theory: a bare number for `income_recognition`,
  an object for `commitment_recognition`. Any future code reading
  `result_value` generically (e.g. a cross-domain report) must branch on
  `domain` before interpreting it — accepted, the intended trade-off of
  `result_value` being untyped `jsonb` (0010's Consequences already flagged
  this as likely once a second domain landed).
- `recordEvidence`'s location under `src/lib/income-knowledge/` is now
  slightly misleading given two domains call it — a naming cleanup
  candidate for a future sprint, not a functional problem today.
- 4 of the DB PRD's remaining tables (`dsr_rules`, `property_rules`,
  `eligibility_verdicts`, `eligibility_verdict_derivation_results`,
  `ai_recommendations`) still do not exist. `derivation_results.domain`
  already accepts `dsr` and `property_rules`, so those future domains can
  land the same way this one did: one new rule table, zero changes to the
  shared Evidence Layer.

## Evidence

`supabase/migrations/20260727010000_commitment_knowledge_schema.sql`,
`supabase/migrations/20260727020000_commitment_knowledge_rls.sql`,
`src/lib/commitment-knowledge/types.ts`,
`src/lib/commitment-knowledge/match-commitment-rule.ts`,
`src/lib/commitment-knowledge/recognize-commitment.ts`,
`src/lib/commitment-knowledge/actions.ts`,
`src/lib/database/commitment-knowledge.ts`,
`docs/product/mortgage-knowledge-database-prd.md`.
