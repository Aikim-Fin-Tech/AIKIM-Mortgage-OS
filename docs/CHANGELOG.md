# Changelog

Derived from `git log` and the [ADR history](decisions/README.md) — this is
the authoritative record of what happened and when. Sprint numbers referenced
elsewhere in code comments (Sprint 4, 6, 6.5, 9A) predate this changelog and
are historical breadcrumbs, not verified against this record.

## Commit History (`git log --oneline`, oldest first)

```
d54eabf Initial Next.js project
6f73121 Phase 1 Complete - Project checkpoint before context reset
0f747d6 AIKIM Project Memory v1.0
5db4c99 Sprint 6.2 production database foundation
b859e97 Mortgage Knowledge Base PRD/Architecture baseline (Sprint 6.3)
8f43ee5 docs: add Mortgage Knowledge Database PRD baseline (Sprint 6.3A)
fa53682 feat: implement Income Knowledge (Sprint 6.3B-1)
336757d feat: implement Commitment Knowledge (Sprint 6.3B-2)
aa238f7 feat: implement DSR Rules Knowledge (Sprint 6.3B-3)
7e0bb5c feat: implement Property Rules Knowledge (Sprint 6.3B-4)
a644295 feat: implement Eligibility Engine (Sprint 6.3C), close Sprint 6.3
```

11 commits exist as of this pass. `main` is confirmed **pushed and up to
date with `origin/main`** — an earlier version of this document wrongly
claimed `6f73121` was unpushed; that claim was stale and is corrected here.
An earlier version of this document also described the Eligibility Engine
commit as still being finalized, with no hash yet assigned; it has since
landed as `a644295` (added to the `git log` block above and to the
Commit-by-Commit Breakdown below in this pass) — see
[ADR 0014](decisions/0014-eligibility-engine-implementation.md).

Since that commit landed, two further items have been authored
but are not yet reflected as their own commit-by-commit table rows below
(no confirmed commit hash as of this pass): (1) two further migrations,
`20260730040000_knowledge_rule_index_correction.sql` and
`20260731010000_aikim_standard_baseline_seed.sql` — added to the Migration
Files list below in this pass, which previously omitted both — see
[ADR 0015](decisions/0015-aikim-standard-baseline-seeding.md); and (2)
**Alpha-001 ("Mortgage Assessment")** — the first UI/invocation surface for
the Mortgage Knowledge Database: an orchestrating Server Action
(`src/lib/mortgage-assessment/actions.ts`, `runMortgageAssessment`) that
sequences the 5 already-existing domain Server Actions (Income, Commitment,
DSR, Property Rules, Eligibility) for one loan case against the "AIKIM
Standard"/"Standard Mortgage" baseline, plus a new "Assessment" tab on the
loan case detail page. Zero new business logic — pure orchestration.
Code-complete, `tsc`/`eslint`/`next build` clean, `security-reviewer`-passed
with no findings — **not yet exercised against a real case**, since the
tables its 5 domain calls depend on are not yet live (see Migration Files
below).

## Commit-by-Commit Breakdown

| # | Commit | Feature | ADR |
|---|---|---|---|
| 1 | `d54eabf` | Bare `create-next-app` scaffold | — |
| 2 | `6f73121` | AIKIM Development OS foundation — `CLAUDE.md`, `docs/` structure, `.claude/agents/`; Supabase backend + auth + RLS-first design (retroactively documented); Next.js 16 `proxy.ts` session boundary (retroactively documented); atomic multi-table writes via `create_loan_case` RPC (retroactively documented); Sprint 6.1 Document Management MVP; Sprint 6.2 Phase 1 Borrower Profile + Mortgage Rules Engine + generated checklist; Sprint 6.2 Phase 2 Mortgage Rule Admin (**frozen** after completion); MVP Sprint — OCR (Gemini 2.5 Pro) + AI Case Summary; MVP Sprint Day 2 — Loan Status pipeline, Timeline, Checklist Progress, Next Action, Loan Health Score; this documentation consolidation pass (`/docs` memory package) | [0001](decisions/0001-use-supabase-for-backend-and-auth.md), [0002](decisions/0002-rls-as-sole-authorization-boundary.md), [0003](decisions/0003-nextjs16-proxy-as-session-boundary.md), [0004](decisions/0004-atomic-multitable-writes-via-security-invoker-rpc.md), [0005](decisions/0005-document-storage-model.md), [0006](decisions/0006-mortgage-rules-engine.md), [0007](decisions/0007-mortgage-rule-admin.md), [0008](decisions/0008-ocr-and-ai-case-summary.md), [0009](decisions/0009-loan-processing-workflow.md) |
| 3 | `0f747d6` | AIKIM Project Memory v1.0 — documentation/context-reset package pass | — |
| 4 | `5db4c99` | Sprint 6.2 production database foundation | — |
| 5 | `b859e97` | Mortgage Knowledge Base PRD/Architecture baseline (Sprint 6.3) — initial docs baseline predating the PRD's Sprint 6.3A commit | — |
| 6 | `8f43ee5` | Mortgage Knowledge Database PRD baseline (Sprint 6.3A) — see [mortgage-knowledge-database-prd.md](product/mortgage-knowledge-database-prd.md) | — |
| 7 | `fa53682` | Sprint 6.3B-1 — Income Knowledge Implementation. 5 new tables (`banks`, `bank_products`, `income_recognition_rules`, `evidence`, `derivation_results`); `src/lib/income-knowledge/`; no UI | [0010](decisions/0010-income-knowledge-implementation.md) |
| 8 | `336757d` | Sprint 6.3B-2 — Commitment Knowledge Implementation. 1 new table (`commitment_recognition_rules`); `src/lib/commitment-knowledge/`; no UI | [0011](decisions/0011-commitment-knowledge-implementation.md) |
| 9 | `aa238f7` | Sprint 6.3B-3 — DSR Rules Knowledge Implementation. 1 new table (`dsr_rules`); `src/lib/dsr-knowledge/`; no UI | [0012](decisions/0012-dsr-knowledge-implementation.md) |
| 10 | `7e0bb5c` | Sprint 6.3B-4 — Property Rules Knowledge Implementation. 1 new table (`property_rules`); `src/lib/property-rules-knowledge/`; no UI | [0013](decisions/0013-property-rules-knowledge-implementation.md) |
| 11 | `a644295` | Sprint 6.3C — Eligibility Engine Implementation. 2 new tables (`eligibility_verdicts`, `eligibility_verdict_derivation_results`) plus a new `SECURITY INVOKER` RPC, `create_eligibility_verdict` (this codebase's second multi-table RPC after `create_loan_case`); `src/lib/eligibility-engine/`; no dedicated UI at the time — see the Alpha-001 note above the Commit History block, and the "5 domains have no UI" correction below | [0014](decisions/0014-eligibility-engine-implementation.md) |

## Migration Files (chronological)

All 21 migration files authored to date, in order (items 20–21 were
authored after the rest of this list but were omitted from it until this
pass — corrected here). **Only the 6 marked "Executed" have been run
against the live database** — every other file (including all 13
Sprint-6.3-era files) is authored SQL only, pending manual human review and
execution in the Supabase SQL Editor. See
[docs/architecture/database.md](architecture/database.md).

1. `20260716000000_loan_case_creation.sql` — Superseded, never run
2. `20260716010000_fix_create_loan_case_rpc.sql` — Superseded, never run
3. `20260716020000_create_loan_case_rpc.sql` — **Executed**
4. `20260721010000_document_management_mvp.sql` — **Executed**
5. `20260722010000_mortgage_rules_engine.sql` — **Executed**
6. `20260723010000_mortgage_rule_admin.sql` — **Executed**
7. `20260724010000_ocr_document_extraction.sql` — **Executed**
8. `20260725010000_loan_workflow.sql` — **Executed**
9. `20260726010000_income_knowledge_schema.sql` — Not executed
10. `20260726020000_income_knowledge_rls.sql` — Not executed
11. `20260727010000_commitment_knowledge_schema.sql` — Not executed
12. `20260727020000_commitment_knowledge_rls.sql` — Not executed
13. `20260728010000_dsr_knowledge_schema.sql` — Not executed
14. `20260728020000_dsr_knowledge_rls.sql` — Not executed
15. `20260729010000_property_rules_knowledge_schema.sql` — Not executed
16. `20260729020000_property_rules_knowledge_rls.sql` — Not executed
17. `20260730010000_eligibility_engine_schema.sql` — Not executed
18. `20260730020000_eligibility_engine_rls.sql` — Not executed
19. `20260730030000_eligibility_engine_rpc.sql` — Not executed
20. `20260730040000_knowledge_rule_index_correction.sql` — Not executed
21. `20260731010000_aikim_standard_baseline_seed.sql` — Not executed

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
- **This document previously claimed only 2 commits existed and that
  `6f73121` was unpushed** — both false; corrected in this pass against
  `git log --oneline` directly.
- **Sprint 6.3B-4 (Property Rules Knowledge) fixed one real gap**: the
  initial implementation matched `evidence` rows to their intended field
  only by id, with no check that a row was actually the *kind* of fact it
  was being used as. Fixed with an `evidence_type` discriminator check. A
  second, lower-severity gap — no casing/whitespace canonicalization
  between how evidence values are recorded and how `property_rules` rows
  are authored — was found and recorded, not code-fixed (fails closed, but
  can spuriously block a legitimate case). See
  [ADR 0013](decisions/0013-property-rules-knowledge-implementation.md).
- **Sprint 6.3C (Eligibility Engine) fixed two real gaps** before being
  considered complete: (high severity) `create_eligibility_verdict`'s only
  original guard on `p_derivation_result_ids` was a bare foreign-key
  existence check, not subject to RLS, allowing a direct RPC caller to link
  an unrelated case's `derivation_results` row into a verdict's reasoning
  chain — fixed with a scoped, RLS-subject `SELECT`; (lower severity, found
  in closing review) that same fix scoped by case/product but omitted
  `domain`, allowing a same-case/product but wrong-domain derivation result
  to be linked in — fixed by adding the `domain` check. One trust boundary
  (the RPC verifies reasoning-chain *scope*, not verdict *content*
  correctness) was explicitly accepted, not fixed. See
  [ADR 0014](decisions/0014-eligibility-engine-implementation.md) and
  [docs/architecture/security.md](architecture/security.md).
- **This document's Migration Files list previously omitted 2 already-
  authored files** — `20260730040000_knowledge_rule_index_correction.sql`
  and `20260731010000_aikim_standard_baseline_seed.sql` — corrected in this
  pass. Separately, the "5 domains have no UI" framing used elsewhere in
  this project's docs is now stale: Alpha-001 ("Mortgage Assessment") gives
  all 5 a single orchestrating invocation surface, though none has a
  dedicated UI of its own.
