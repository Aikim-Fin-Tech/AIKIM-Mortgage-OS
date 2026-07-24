-- ============================================================================
-- AIKIM Mortgage OS — Sprint 6.3C: Eligibility Engine (schema)
--
-- Scope: exactly TWO new tables, per the CTO-approved Mortgage Knowledge
-- Database blueprint (docs/product/mortgage-knowledge-database-prd.md
-- Section 3.9 / 3.10, "follow exactly") and the CTO's Sprint 6.3C
-- authorization ("Eligibility Engine Implementation", same discipline as
-- Sprint 6.3B-1 Income, 6.3B-2 Commitment, 6.3B-3 DSR, and 6.3B-4 Property
-- Rules):
--   eligibility_verdicts                     — Decision Knowledge
--   eligibility_verdict_derivation_results    — reasoning-chain join
--
-- banks, bank_products, evidence, and derivation_results already exist
-- (Sprint 6.3B-1, 20260726010000_income_knowledge_schema.sql) and are NOT
-- touched, recreated, or altered by this migration.
--
-- Deliberately NOT created here (future, separately-approved sprint):
--   ai_recommendations.
--
-- Architecturally different from every prior 6.3B slice: this sprint's core
-- deliverable is not these two tables alone, it's the atomic multi-table RPC
-- that writes to both of them together (create_eligibility_verdict), because
-- a partial failure between the two inserts would leave an orphaned verdict
-- with a broken reasoning chain — see the companion RPC migration
-- 20260730030000_eligibility_engine_rpc.sql for the full reasoning, and
-- docs/decisions/0004-atomic-multitable-writes-via-security-invoker-rpc.md
-- for the pattern this extends. Because of that, this domain gets a 3-file
-- split (schema / RLS / RPC) rather than every prior domain's 2-file split
-- (schema / RLS) — the RPC is a genuinely new kind of deliverable that
-- deserves its own reviewable step, same "small, reviewable steps" reasoning
-- that justified the original schema/RLS split.
--
-- Governance: per the DB PRD's Section 6 "Position on the persistence-vs-
-- recompute tension" (this Knowledge Base persists verdicts as frozen,
-- computation-time snapshots rather than recomputing live) and the later
-- "Frozen Decision Principle" note, both tables below are append-only, pure
-- historical facts — no "active/inactive" concept at all, stronger than the
-- deactivate-only pattern the rule tables (income_recognition_rules etc.)
-- use. No UPDATE/DELETE RLS policy is defined for either table (see the
-- companion RLS migration) — a re-evaluation is always a new
-- eligibility_verdicts row, never an edit to a past one, same posture as
-- derivation_results itself.
--
-- RLS is enabled below (`enable row level security`) but no policy is
-- defined here by design — see the companion migration
-- 20260730020000_eligibility_engine_rls.sql, run immediately after this one.
-- Until that second migration runs, both tables below are RLS-enabled with
-- zero policies, i.e. inaccessible to anyone but the table owner — never
-- silently open.
--
-- Audit note: as with every prior migration in this repo, this session has
-- no live database connection and cannot verify the current schema. Every
-- statement below is written defensively (IF NOT EXISTS / additive-only) and
-- touches zero existing rows or tables.
--
-- Copy this entire file into the Supabase SQL Editor and run it once, after
-- all prior migrations (including Income, Commitment, DSR, and Property
-- Rules Knowledge's migrations, since bank_products and derivation_results
-- must already exist). Idempotent: safe to re-run. Does not touch any
-- existing row data. NOT executed by this session — pending human review and
-- manual execution.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. eligibility_verdicts — the per-case, per-Bank-Product eligibility
--    verdict, persisted as a frozen, computation-time snapshot rather than
--    recomputed live (DB PRD Section 3.9). bank_product_id, not bank_id, is
--    the Eligibility Engine's unit of evaluation — per the architecture
--    doc's Section 3 resolution, reiterated in DB PRD Section 3.3.
--
--    `verdict` is a definitively closed 3-value set per the DB PRD (unlike
--    the open-vocabulary matching columns most of this Knowledge Base uses,
--    e.g. income_recognition_rules.income_source_type) — CHECK-constrained
--    accordingly, same "guard against typos at the data layer" posture as
--    income_recognition_rules_method_valid
--    (20260726010000_income_knowledge_schema.sql).
--
--    `requested_by_user_id` is resolved server-side inside the
--    create_eligibility_verdict RPC via auth.uid() -> user_profiles.id,
--    exactly like create_loan_case's `created_by` — it is never accepted as
--    a client-supplied parameter. See the RPC migration for the resolution
--    logic; the column here is simply the nullable FK target.
-- ----------------------------------------------------------------------------
create table if not exists public.eligibility_verdicts (
  id uuid primary key default gen_random_uuid(),
  loan_case_id uuid not null references public.loan_cases(id) on delete cascade,
  bank_product_id uuid not null references public.bank_products(id),
  verdict text not null,
  reasons jsonb not null,
  computed_at timestamptz not null default now(),
  requested_by_user_id uuid references public.user_profiles(id)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'eligibility_verdicts_verdict_valid'
  ) then
    alter table public.eligibility_verdicts
      add constraint eligibility_verdicts_verdict_valid
      check (verdict in ('eligible', 'not_eligible', 'eligible_with_conditions'));
  end if;
end $$;

comment on table public.eligibility_verdicts is
  'Per-case, per-bank-product eligibility verdict, persisted as a frozen computation-time snapshot (DB PRD Section 6 "Position on the persistence-vs-recompute tension" and the later "Frozen Decision Principle" note). Append-only — no UPDATE/DELETE RLS policy (see companion RLS migration). A re-evaluation is always a new row, never an edit to a past one.';
comment on column public.eligibility_verdicts.verdict is
  'Closed 3-value set (unlike this Knowledge Base''s usual open-vocabulary text columns) — CHECK-constrained to eligible | not_eligible | eligible_with_conditions per DB PRD Section 3.9.';
comment on column public.eligibility_verdicts.reasons is
  'Structured, human-readable list of reasons, so a rejection or condition traces to a specific rule/derivation result, not an opaque score.';
comment on column public.eligibility_verdicts.requested_by_user_id is
  'Resolved server-side inside create_eligibility_verdict via auth.uid() -> user_profiles.id — never a client-supplied parameter, exactly like create_loan_case.created_by. Nullable because a system recomputation may have no acting user.';

create index if not exists eligibility_verdicts_loan_case_id_idx on public.eligibility_verdicts(loan_case_id);
create index if not exists eligibility_verdicts_bank_product_id_idx on public.eligibility_verdicts(bank_product_id);

alter table public.eligibility_verdicts enable row level security;

-- ----------------------------------------------------------------------------
-- 2. eligibility_verdict_derivation_results — the reasoning-chain join
--    between one eligibility_verdicts row and every derivation_results row
--    that contributed to it (DB PRD Section 3.10) — the literal, queryable
--    reasoning chain the architecture doc's Explainable AI Architecture
--    (Section 6) requires.
--
--    ---------------------------------------------------------------------
--    Design note: derivation_result_id IS a real, enforced foreign key here
--    — a deliberate contrast with derivation_results.rule_id, which is a
--    deliberate NON-foreign-key (see the design note in
--    20260726010000_income_knowledge_schema.sql).
--
--    The reason the two are treated differently: derivation_results.rule_id
--    is a polymorphic reference across FOUR possible target tables
--    (income_recognition_rules / commitment_recognition_rules / dsr_rules /
--    property_rules, selected by `domain`), and Postgres cannot express one
--    FOREIGN KEY constraint pointing at four different tables — that's a
--    structural limitation, not a design preference. Here, by contrast,
--    derivation_result_id points at exactly ONE table
--    (public.derivation_results), and both eligibility_verdicts and
--    derivation_results already exist as real tables by the time this join
--    fires (eligibility_verdicts is created earlier in this same file;
--    derivation_results has existed since Sprint 6.3B-1). There is no
--    "target table doesn't exist yet" reason to leave this reference
--    unenforced, so it is a normal, standard FOREIGN KEY — a future reader
--    comparing the two join patterns should read this as "FK-enforced
--    wherever a single target table exists and is already live; unenforced
--    only where Postgres genuinely cannot express the constraint," not as
--    an inconsistency.
--    ---------------------------------------------------------------------
--
--    Append-only, same governance as eligibility_verdicts above — no
--    UPDATE/DELETE RLS policy (see companion RLS migration). This table is
--    written exclusively by the create_eligibility_verdict RPC (see
--    20260730030000_eligibility_engine_rpc.sql), never directly by a Server
--    Action .insert() call — but its RLS is authored to be correct and
--    complete on its own terms regardless (see the RLS migration's notes).
-- ----------------------------------------------------------------------------
create table if not exists public.eligibility_verdict_derivation_results (
  id uuid primary key default gen_random_uuid(),
  eligibility_verdict_id uuid not null references public.eligibility_verdicts(id),
  derivation_result_id uuid not null references public.derivation_results(id)
);

comment on table public.eligibility_verdict_derivation_results is
  'Reasoning-chain join: links one eligibility_verdicts row to every derivation_results row that contributed to it (DB PRD Section 3.10). Written exclusively by create_eligibility_verdict (20260730030000_eligibility_engine_rpc.sql) as part of one atomic transaction with the eligibility_verdicts insert. Append-only — no UPDATE/DELETE RLS policy.';
comment on column public.eligibility_verdict_derivation_results.derivation_result_id is
  'A real, enforced foreign key to public.derivation_results — unlike derivation_results.rule_id (a deliberate non-FK polymorphic reference across 4 possible tables), this join has exactly one target table, already live, so there is no reason to leave it unenforced. See the design note above this table''s CREATE TABLE statement.';

create index if not exists eligibility_verdict_derivation_results_verdict_id_idx on public.eligibility_verdict_derivation_results(eligibility_verdict_id);
create index if not exists eligibility_verdict_derivation_results_result_id_idx on public.eligibility_verdict_derivation_results(derivation_result_id);

alter table public.eligibility_verdict_derivation_results enable row level security;

-- ============================================================================
-- End of Sprint 6.3C Eligibility Engine schema migration.
-- RLS policies for these 2 tables are in the companion migration:
-- 20260730020000_eligibility_engine_rls.sql — run that immediately after this
-- file. The RPC that actually writes to these tables is in the third
-- migration, 20260730030000_eligibility_engine_rpc.sql, run last, since its
-- correctness depends on the RLS policies existing. Until both companion
-- migrations run, both tables above are enabled-RLS-with-zero-policies
-- (inaccessible to anyone but the table owner) and there is no way to write
-- to them at all.
-- ============================================================================
