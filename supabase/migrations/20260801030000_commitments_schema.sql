-- ============================================================================
-- AIKIM Mortgage OS — Sprint 1.4 (Option A): commitments (case-scoped facts)
--
-- Scope: one new table, public.commitments, genuinely missing from the
-- existing Income/Commitment/DSR Knowledge foundation. The shared
-- public.evidence table (20260726010000_income_knowledge_schema.sql) has no
-- dedicated typed columns for lender / outstanding balance / verification
-- status / DSR-inclusion — representing a commitment there would mean
-- cramming all of that into one open `value` jsonb field with zero type
-- safety and no clean way to query "list this case's commitments". This
-- table does NOT replace or duplicate evidence (which keeps its existing
-- generic role across Income/Commitment/Property Rules) or
-- commitment_recognition_rules (the separate RULES table from Sprint
-- 6.3B-2, 20260727010000_commitment_knowledge_schema.sql, untouched by this
-- migration) — it is a new, purpose-built facts table sitting alongside
-- both.
--
-- Verified before writing this: public.customers and public.loan_cases
-- already exist and are referenced this exact way elsewhere (see
-- 20260716020000_create_loan_case_rpc.sql, p_customer_id/v_customer_id
-- handling and public.customers selects). public.documents already exists
-- (referenced by evidence.source_document_id in
-- 20260726010000_income_knowledge_schema.sql).
--
-- Open-vocabulary columns, not CHECK-constrained: commitment_type and
-- source. Same posture as commitment_recognition_rules.commitment_type
-- (which also has no CHECK constraint per its own migration's design note)
-- and evidence.source_type — a new value is never a schema change. source's
-- illustrative values (CCRIS, CTOS, BANK_STATEMENT, CUSTOMER_DECLARATION)
-- are documented via COMMENT ON COLUMN below, not a CHECK.
--
-- monthly_payment is `numeric not null` — the one figure every commitment
-- must have to be useful for DSR. outstanding_balance is nullable numeric —
-- sometimes known, sometimes not, at capture time. Both NUMERIC, never
-- floating point, per this repo's monetary-column convention.
--
-- included_in_dsr (default true) and verified (default false) are sensible
-- defaults for a newly-captured commitment pending review.
--
-- Mutability, and why this table's RLS shape differs from evidence's:
-- unlike evidence / derivation_results (strictly append-only, no
-- updated_at column at all — a correction is always a new row), this table
-- has updated_at and an UPDATE RLS policy. verified and included_in_dsr are
-- fields that get reviewed/toggled after initial capture (e.g. a staff
-- member confirms a commitment against CCRIS, or marks it excluded from
-- DSR), so this table is meant to be mutable in place — matching the
-- banks / bank_products / income_recognition_rules posture, not the
-- evidence / derivation_results posture.
--
-- RLS: same case-visibility pattern as evidence
-- (20260726020000_income_knowledge_rls.sql) — the exact EXISTS-against-
-- loan_cases idiom, and the exact STAFF_ROLES role list
-- ('super_admin', 'banker', 'property_agent', 'mortgage_outsource_agent').
-- Select + insert follow that pattern exactly, plus one additional UPDATE
-- policy (same EXISTS + STAFF_ROLES shape) since verified /
-- included_in_dsr / balances are expected to be corrected in place. This
-- repo has no column-level RLS anywhere, so no column-level restriction is
-- invented here — a full-row UPDATE policy for staff who can see the case
-- is the established pattern. No DELETE policy — matches the "no DELETE
-- policy anywhere in this Knowledge Base, ever" precedent.
--
-- Indexes: case_id (primary access pattern — "list this case's
-- commitments"), customer_id.
--
-- Idempotent: `create table if not exists`, `create index if not exists`,
-- `drop policy if exists` before every `create policy`. Does not touch any
-- existing row data or table. NOT executed by this session — pending human
-- review and manual execution in the Supabase SQL Editor.
-- ============================================================================

create table if not exists public.commitments (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.loan_cases(id) on delete cascade,
  customer_id uuid references public.customers(id),
  commitment_type text not null,
  lender text,
  outstanding_balance numeric,
  monthly_payment numeric not null,
  source text not null,
  source_document_id uuid references public.documents(id),
  included_in_dsr boolean not null default true,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.commitments is
  'Case-scoped commitment facts (existing loans/cards/etc.) for DSR purposes. New purpose-built facts table alongside evidence (generic Income/Commitment/Property Rules facts) and commitment_recognition_rules (the separate bank-policy RULES table, Sprint 6.3B-2) — not a replacement for either. Mutable in place (verified/included_in_dsr are reviewed/toggled after capture), unlike evidence''s append-only posture — see UPDATE RLS policy below.';
comment on column public.commitments.commitment_type is
  'Open vocabulary (e.g. housing loan, hire purchase/car loan, personal loan, credit card, other) — same posture as commitment_recognition_rules.commitment_type. No CHECK constraint; a new commitment type never requires a migration.';
comment on column public.commitments.source is
  'Open vocabulary, illustrative values: CCRIS, CTOS, BANK_STATEMENT, CUSTOMER_DECLARATION, or a future source. No CHECK constraint — same "a new value is never a schema change" posture as evidence.source_type.';
comment on column public.commitments.outstanding_balance is
  'Nullable: sometimes known, sometimes not, at capture time. NUMERIC, never floating point.';
comment on column public.commitments.monthly_payment is
  'The one figure every commitment must have to be useful for DSR. NUMERIC, never floating point.';
comment on column public.commitments.included_in_dsr is
  'Whether this commitment is currently counted toward DSR. Defaults true; toggled in place, e.g. when a borrower declares an intent to settle before drawdown.';
comment on column public.commitments.verified is
  'Whether this commitment has been confirmed (e.g. against CCRIS/CTOS or a bank statement). Defaults false; toggled in place after review.';

create index if not exists commitments_case_id_idx on public.commitments(case_id);
create index if not exists commitments_customer_id_idx on public.commitments(customer_id);

alter table public.commitments enable row level security;

-- ----------------------------------------------------------------------------
-- RLS — same case-visibility pattern as evidence
-- (20260726020000_income_knowledge_rls.sql): a select policy re-checking
-- the parent case's own visibility via EXISTS (so access can never be
-- broader than access to the case itself), an insert policy for
-- STAFF_ROLES doing the same re-check, plus an UPDATE policy (same shape)
-- since this table is mutable in place — see the header comment above for
-- why that differs from evidence's append-only posture. No DELETE policy.
-- ----------------------------------------------------------------------------
drop policy if exists "commitments_select" on public.commitments;
create policy "commitments_select" on public.commitments
for select
using (
  exists (
    select 1 from public.loan_cases lc
    where lc.id = commitments.case_id
  )
);

drop policy if exists "commitments_insert_staff" on public.commitments;
create policy "commitments_insert_staff" on public.commitments
for insert
with check (
  exists (
    select 1 from public.loan_cases lc
    where lc.id = commitments.case_id
  )
  and exists (
    select 1 from public.user_profiles up
    where up.auth_user_id = auth.uid()
      and up.role in ('super_admin', 'banker', 'property_agent', 'mortgage_outsource_agent')
  )
);

drop policy if exists "commitments_update_staff" on public.commitments;
create policy "commitments_update_staff" on public.commitments
for update
using (
  exists (
    select 1 from public.loan_cases lc
    where lc.id = commitments.case_id
  )
  and exists (
    select 1 from public.user_profiles up
    where up.auth_user_id = auth.uid()
      and up.role in ('super_admin', 'banker', 'property_agent', 'mortgage_outsource_agent')
  )
)
with check (
  exists (
    select 1 from public.loan_cases lc
    where lc.id = commitments.case_id
  )
  and exists (
    select 1 from public.user_profiles up
    where up.auth_user_id = auth.uid()
      and up.role in ('super_admin', 'banker', 'property_agent', 'mortgage_outsource_agent')
  )
);
-- No DELETE policy: matches the "no DELETE policy anywhere in this
-- Knowledge Base, ever" precedent (mortgage_rules, evidence,
-- derivation_results, eligibility_verdicts, etc.).

-- ============================================================================
-- End of Sprint 1.4 (Option A) commitments migration.
-- ============================================================================
