# 0014. Eligibility Engine Implementation — Sprint 6.3C

Status: Proposed (migrations authored, not confirmed run against the live database)
Date: 2026-07-24

## Context

Sprints 6.3B-1 through 6.3B-4 ([0010](0010-income-knowledge-implementation.md)–
[0013](0013-property-rules-knowledge-implementation.md)) each implemented one
Derivation Knowledge domain — Income, Commitment, DSR, Property Rules — as a
single new table, always a plain Server Action `.insert()` into
`derivation_results`, never an RPC. Sprint 6.3C implements the Eligibility
Engine per DB PRD Sections 3.9/3.10 and the architecture doc's Section 6
("Explainable AI Architecture"): the Decision Knowledge layer that combines
those prior domains' outputs into a single per-case, per-bank-product
verdict. Following the same discipline 0013 established (see 0012's
"Correction note" for the mistake being avoided), this ADR is written only
now that schema, RLS, RPC, and the complete TypeScript service layer have
landed and passed both security review (including one high-severity fix) and
QA — not before. A closing review pass at Sprint 6.3C's actual close found
and fixed one further low-severity gap in the same guard (see "A second fix,
found during Sprint 6.3C closing review" below) — recorded here rather than
silently folded into the original fix, consistent with 0012's correction-note
precedent.

## Decisions

**Scope: TWO new tables**, `eligibility_verdicts` and
`eligibility_verdict_derivation_results` — the first sprint in this series
with a 2-table core scope, not 1. Unlike 0010–0013, there is no seeder this
sprint: both tables hold computed decisions and reasoning-chain links, not
reference/policy data, so there is nothing legitimate to pre-populate.

**This is the first sprint since `create_loan_case` (0004) to need a
`SECURITY INVOKER` RPC, and the first in the entire 6.3B/6.3C Knowledge Base
series to need one at all.** Every prior domain (0010–0013) was explicitly a
single-table insert needing no RPC. Creating one eligibility verdict means
writing to two tables atomically: the `eligibility_verdicts` row, plus one
`eligibility_verdict_derivation_results` join row per contributing
`derivation_results` id. A naive two-step client-side sequence risks exactly
the failure mode 0004 names: if the verdict insert succeeds but a later join
insert fails, the result is an orphaned verdict with a broken or incomplete
reasoning chain — defeating the entire purpose of the join table (DB PRD
Section 6's requirement that a verdict be reconstructable back to every
derivation result that produced it). `create_eligibility_verdict`
(`20260730030000_eligibility_engine_rpc.sql`) follows `create_loan_case`'s
exact pattern: `SECURITY INVOKER`, `auth.uid()` resolved server-side to
`requested_by_user_id` (never a client-supplied parameter), both inserts in
one implicit PL/pgSQL transaction so any failure rolls back everything
already executed in the call.

**`eligibility_verdict_derivation_results.derivation_result_id` is a real,
enforced foreign key** — the first genuinely-enforced polymorphic-adjacent
reference in this series, in deliberate contrast to
`derivation_results.rule_id`'s non-FK design (0010). `rule_id` cannot be a
real FK because it is a polymorphic reference across four possible target
tables selected by `domain`, and Postgres cannot express one FOREIGN KEY
pointing at four different tables — a structural limitation. Here,
`derivation_result_id` points at exactly one table, `derivation_results`,
already live by the time this join fires, so there is no structural reason
to leave it unenforced. A future reader comparing the two join patterns
should read this as "FK-enforced wherever a single target table exists and
is already live; unenforced only where Postgres genuinely cannot express the
constraint," not as an inconsistency.

**Both new tables are append-only with no UPDATE/DELETE RLS policy at
all** — stronger than the deactivate-only posture of the rule tables
(`income_recognition_rules`, `commitment_recognition_rules`, `dsr_rules`,
`property_rules`), per the DB PRD's "Frozen Decision Principle": a
re-evaluation is always a new `eligibility_verdicts` row, never an edit to a
past one. This matches `evidence`/`derivation_results`' own "no DELETE
policy at all, ever" precedent, extended here to also exclude UPDATE.

**`computeEligibility` combines a DSR result with Property Rules' ceilings
against two more external, caller-supplied inputs**, `propertyValue` and
`requestedTenureYears` — the third and fourth external inputs in this
series after DSR's `proposedInstalmentAmount` (0012), drawing the same "not
this domain's own data" boundary: `loan_cases` has no property-value or
requested-tenure columns, and neither function infers either value from
anything else.

**`reasons` is a structured array (`EligibilityReason[]`), not free
text** — `check`/`result`/`value`/`threshold`/`detail` fields, deliberately
machine-inspectable, per the DB PRD's explicit requirement that a rejection
or condition trace to a specific rule/derivation result, not an opaque
score. `check` is a closed 3-value union (`dsr` | `margin_of_finance` |
`tenure`) so a caller can exhaustively switch over it; `result` is `pass` |
`fail` | `not_configured`, with `not_configured` deliberately distinct from
`fail` — it means the underlying bank policy value has not been configured
yet, inconclusive rather than a genuine policy violation, and drives the
verdict's `eligible_with_conditions` outcome (any fail -> `not_eligible`; no
fails, at least one `not_configured` -> `eligible_with_conditions`; all pass
-> `eligible`).

**The central lesson of this sprint — a security-review finding and its
fix.** The RPC's only original guard on `p_derivation_result_ids` was a bare
foreign key existence check on
`eligibility_verdict_derivation_results.derivation_result_id`. That check
proves a given id exists *somewhere* in `derivation_results` — it does NOT
prove the row belongs to the `loan_case_id`/`bank_product_id` being
evaluated. Worse, this is a structural Postgres fact, not an oversight:
foreign key constraint checks are internal system checks and are not subject
to RLS on the referenced table. Because this RPC is `grant execute to
authenticated`, ANY authenticated staff-role caller invoking it directly
(bypassing the intended TypeScript caller,
`src/lib/eligibility-engine/actions.ts`) could have linked a
`derivation_results` row from a completely unrelated case into a verdict's
reasoning chain — undermining the entire purpose of the join table, and
leaving `actions.ts`'s TypeScript-side checks as the sole guard, which ADR
0002 (RLS as the sole authorization boundary) treats as insufficient on its
own.

Fixed by adding a scoped `SELECT` inside the RPC, genuinely subject to
`derivation_results`' own RLS, verifying each id belongs to the
`loan_case_id`/`bank_product_id` being evaluated before the corresponding
join row is inserted — mirroring `create_loan_case`'s existing
validate-by-selecting-it-back pattern for `p_customer_id` in existing-customer
mode. If any id fails to resolve, the function raises immediately and, per
the RPC's atomicity guarantee, the whole transaction — including the
already-inserted `eligibility_verdicts` row — rolls back.

This is recorded as a **generalizable principle for any future RPC in this
codebase**: an RPC parameter that references another table by id must be
scope-validated via a real, RLS-subject `SELECT`, never trusted via a bare
foreign key constraint alone. A foreign key constraint proves existence, not
visibility or relevance.

**A second, explicitly accepted trust boundary — recorded, not fixed.** Even
after the fix, the RPC still trusts `p_verdict`/`p_reasons` *content* from
the caller. It now verifies that a verdict can be written referencing
genuinely-relevant derivation results — a referential/scope guarantee — not
that the verdict's substance is correct (e.g. that "eligible" actually
follows from the linked derivation results). Recomputing the verdict in SQL
was explicitly rejected as a fix, since it would reverse this Knowledge
Base's established architecture that matching/derivation logic lives in
TypeScript, not SQL (0006 and every subsequent domain ADR). This is recorded
the same way 0013 recorded its unresolved evidence-casing gap: an accepted,
named limitation requiring `src/lib/eligibility-engine/actions.ts` to remain
the only real caller that computes verdict content — a discipline enforced
by code review and convention, not a database-level guarantee.

**A second fix, found during Sprint 6.3C closing review.** The scope-validation
`SELECT` added by the first fix checked `loan_case_id`/`bank_product_id` but
not `domain`. `src/lib/eligibility-engine/actions.ts` only ever resolves and
passes `dsr`/`property_rules` domain `derivation_results` ids — but a caller
invoking the RPC directly could have passed an `income_recognition` or
`commitment_recognition` result id from the *same* case/product. That id
would have passed the case/product check and been linked into
`eligibility_verdict_derivation_results` as if it had contributed to the
verdict — a narrower defect than the first fix (no cross-case boundary is
crossed), but it still undermines the specific guarantee this join table
exists for: that every linked row genuinely contributed to the verdict.
Fixed by adding `and domain in ('dsr', 'property_rules')` to the same
`SELECT`.

**A third, lower-severity fix.** `compute-eligibility.ts` initially dropped
raw inputs (`propertyValue`/`requestedLoanAmount`/`requestedTenureYears`)
from some `not_configured` reason branches. Fixed so every branch of every
check — pass, fail, and `not_configured` alike — captures its raw inputs, so
a persisted verdict's `reasons` alone are always sufficient to reconstruct
exactly what was actually evaluated, the Frozen Decision Principle's actual
goal.

**No UI this sprint** — same explicit CTO scope limit as every prior sprint
in this series (0010–0013).

## Consequences

- `eligibility_verdicts` and `eligibility_verdict_derivation_results` have no
  UPDATE/DELETE RLS policy at all — a re-evaluation is always a new
  `eligibility_verdicts` row, and `eligibility_verdict_derivation_results` is
  written exclusively as part of `create_eligibility_verdict`'s one atomic
  transaction. Neither table can be edited after insert by any RLS-gated
  path.
- `create_eligibility_verdict` is now this codebase's second `SECURITY
  INVOKER` multi-table RPC (after `create_loan_case`), and the reference
  implementation for the "scope-validate every id parameter via a real
  RLS-subject SELECT, not a bare FK" principle — now generalized in
  [docs/architecture/security.md](../architecture/security.md) to "scope
  every dimension that matters, not just the obvious parent id," after the
  closing review's `domain` finding. Any future RPC accepting an array of
  ids referencing another table must apply the same pattern from the start.
- Eligibility verdict correctness still depends on
  `src/lib/eligibility-engine/actions.ts` being the only real caller that
  computes `p_verdict`/`p_reasons` — the RPC verifies referential/scope
  integrity of the derivation results cited, not the substantive correctness
  of the verdict itself. This is an accepted, named limitation, not resolved
  this sprint, consistent with this Knowledge Base's TypeScript-side
  matching/derivation architecture (0006).
- All DB PRD tables for the Mortgage Knowledge Database's Derivation and
  Decision Knowledge layers now exist except `ai_recommendations` — a
  future, separately-scoped sprint.

## Evidence

`supabase/migrations/20260730010000_eligibility_engine_schema.sql`,
`supabase/migrations/20260730020000_eligibility_engine_rls.sql`,
`supabase/migrations/20260730030000_eligibility_engine_rpc.sql`,
`src/lib/eligibility-engine/types.ts`,
`src/lib/eligibility-engine/compute-eligibility.ts`,
`src/lib/eligibility-engine/actions.ts`,
`src/lib/database/eligibility-engine.ts`,
`docs/product/mortgage-knowledge-database-prd.md` Section 3.9/3.10,
`docs/product/mortgage-knowledge-architecture.md` Section 6.
