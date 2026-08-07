-- ============================================================================
-- AIKIM Mortgage OS — Sprint 1.4 (Option A): Income Types reference table
--
-- Scope: CTO-approved "Option A" for the requested Sprint 1.4 — Income
-- Recognition + DSR Engine. Income Recognition, DSR, and Commitment
-- Knowledge already exist (Sprint 6.3B-1 through 6.3C, plus the Alpha-001
-- Mortgage Assessment feature built on top of them). This migration is
-- purely additive: one new reference table, genuinely missing from that
-- existing foundation.
--
-- public.income_types is a controlled taxonomy of income category labels
-- (10 rows, seeded below) — not bank-specific policy data, so it is fine to
-- seed directly, unlike bank rule percentages, which this repo never seeds
-- without a human-confirmed source (see
-- docs/decisions/0015-aikim-standard-baseline-seeding.md). It exists so
-- future rule authoring (income_recognition_rules, see the companion
-- migration 20260801020000_income_recognition_rules_income_type_link.sql)
-- can reference a typo-proof canonical vocabulary instead of only free text.
--
-- `updated_at` is beyond the original ask's bare spec — every other
-- reference table in this codebase (e.g. banks, bank_products) has one;
-- added here for consistency with that established shape.
--
-- `category` is free text, NOT CHECK-constrained to a closed set — no PRD or
-- prior decision in this codebase names it as a definitively closed
-- vocabulary. Same "open vocabulary, a new value is never a schema change"
-- posture already used for evidence.evidence_type / evidence.source_type
-- and commitment_recognition_rules.commitment_type (see
-- 20260726010000_income_knowledge_schema.sql's comment on
-- evidence.evidence_type for the house-style reasoning this echoes).
--
-- RLS is enabled and given exactly one SELECT policy in this same file
-- (rather than split into a companion RLS migration the way full domain
-- sprints do) — safe to bundle here because this is a brand-new table with
-- zero prior exposure window. Read-only for any authenticated user, the
-- exact posture and exact policy-naming convention banks / bank_products /
-- income_recognition_rules already use in
-- 20260726020000_income_knowledge_rls.sql. No insert/update/delete policy —
-- same "reference data, human-managed via SQL Editor for Phase 1" posture
-- as those three tables.
--
-- Idempotent: safe to re-run. Does not touch any existing row data. NOT
-- executed by this session — pending human review and manual execution in
-- the Supabase SQL Editor.
-- ============================================================================

create table if not exists public.income_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  category text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.income_types is
  'Controlled taxonomy of income category labels. Reference data, human-managed via SQL Editor for Phase 1 — see 20260801020000_income_recognition_rules_income_type_link.sql for how income_recognition_rules can optionally reference this table.';
comment on column public.income_types.category is
  'Open vocabulary (e.g. employment, variable, passive, director, self_employed, other). No CHECK constraint — same "a new value is never a schema change" posture as evidence.evidence_type / evidence.source_type and commitment_recognition_rules.commitment_type.';

alter table public.income_types enable row level security;

-- Seed: a controlled taxonomy of income category labels, not bank-specific
-- policy data — safe to seed directly per the file header above. `code` has
-- a UNIQUE constraint, so `on conflict (code) do nothing` is used here
-- instead of the `where not exists` idiom seen elsewhere in this repo;
-- both are idempotent, this is simply the simpler form given the
-- constraint already exists.
insert into public.income_types (code, name, category) values
  ('BASIC_SALARY', 'Basic Salary', 'employment'),
  ('OVERTIME', 'Overtime', 'employment'),
  ('ALLOWANCE_FIXED', 'Fixed Allowance', 'employment'),
  ('ALLOWANCE_VARIABLE', 'Variable Allowance', 'employment'),
  ('COMMISSION', 'Commission', 'variable'),
  ('BONUS', 'Bonus', 'variable'),
  ('RENTAL', 'Rental Income', 'passive'),
  ('DIRECTOR_FEE', 'Director''s Fee', 'director'),
  ('BUSINESS_INCOME', 'Business Income', 'self_employed'),
  ('OTHER_INCOME', 'Other Income', 'other')
on conflict (code) do nothing;

-- ----------------------------------------------------------------------------
-- RLS: read-only reference data for any authenticated user. Exact posture
-- and policy-naming convention as banks / bank_products /
-- income_recognition_rules (20260726020000_income_knowledge_rls.sql).
-- ----------------------------------------------------------------------------
drop policy if exists "income_types_select_authenticated" on public.income_types;
create policy "income_types_select_authenticated" on public.income_types
for select
using (auth.uid() is not null);
-- No insert/update/delete policy: reference data, human-managed via SQL
-- Editor for Phase 1, same posture as banks/bank_products/
-- income_recognition_rules.

-- ============================================================================
-- End of Sprint 1.4 (Option A) income_types migration.
-- ============================================================================
