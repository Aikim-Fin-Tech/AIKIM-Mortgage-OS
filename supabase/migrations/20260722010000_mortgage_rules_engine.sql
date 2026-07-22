-- ============================================================================
-- AIKIM Mortgage OS — Sprint 6.2 Phase 1: Dynamic Mortgage Document Checklist
--
-- Scope: schema for the Mortgage Rules Engine — borrower profile fields on
-- loan_cases, document categories, mortgage rules + their required documents,
-- and the per-case generated checklist with a full audit trail of rule
-- changes. The matching ALGORITHM lives in TypeScript
-- (src/lib/mortgage-rules/), by explicit product decision — see
-- docs/decisions/0006-mortgage-rules-engine.md. This migration only adds the
-- database-driven RULE DATA and checklist storage; it contains zero
-- fabricated/example rule rows (see the ADR for an illustrative, NOT
-- executed, example).
--
-- No OCR, AI screening, DSR, or recommendation logic — still explicitly out
-- of scope, same as Sprint 6.1.
--
-- Audit note: as with the Sprint 6.1 migration, this session has no access to
-- a live schema export, so every ALTER/CREATE below is written defensively
-- (IF NOT EXISTS / IF EXISTS) and additive-only. Please verify against the
-- actual live schema before running.
--
-- Copy this entire file into the Supabase SQL Editor and run it once.
-- Idempotent: safe to re-run. Does not touch any existing row data.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Borrower profile fields on loan_cases (additive, nullable)
--
-- Deliberately on loan_cases, not customers, per product decision — a joint
-- applicant's profile is per-case, not carried across their other cases.
-- Free text, not an enum: the canonical value list is owned by the
-- application layer (src/lib/mortgage-rules/borrower-profile-options.ts),
-- not the database, so new profile values don't require a migration. This
-- means the TypeScript layer is the source of truth for *valid* values, and
-- mortgage_rules rows must be authored using those exact strings for matching
-- to work — documented clearly, not enforced by a DB constraint in Phase 1.
-- ----------------------------------------------------------------------------
alter table public.loan_cases
  add column if not exists nationality text,
  add column if not exists income_country text,
  add column if not exists employment_type text,
  add column if not exists income_structure text;

comment on column public.loan_cases.nationality is 'Borrower nationality, e.g. "Malaysian" or "Foreigner". Drives mortgage rule matching.';
comment on column public.loan_cases.income_country is 'Country the borrower''s income is earned in. Drives mortgage rule matching.';
comment on column public.loan_cases.employment_type is 'e.g. "Salaried", "Self-Employed". Drives mortgage rule matching.';
comment on column public.loan_cases.income_structure is 'e.g. "Fixed", "Variable", "Mixed". Drives mortgage rule matching.';

-- ----------------------------------------------------------------------------
-- 2. document_categories — groups document_types (e.g. "Identity", "Income
--    Proof", "Property") for the Required Documents section's Category column.
-- ----------------------------------------------------------------------------
create table if not exists public.document_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.document_categories enable row level security;

drop policy if exists "document_categories_select_authenticated" on public.document_categories;
create policy "document_categories_select_authenticated" on public.document_categories
for select
using (auth.uid() is not null);
-- No insert/update/delete policy: reference data, managed via SQL Editor for
-- Phase 1 (no admin UI yet — see docs/product/roadmap.md).

-- ----------------------------------------------------------------------------
-- 3. document_types gains an optional category (additive)
--
-- Reuses the existing document_types table from Sprint 4/6.1 rather than
-- inventing a second, parallel "document name" catalog — a required
-- document and an uploaded document are the same document_type_id, always
-- joinable, never able to drift apart.
-- ----------------------------------------------------------------------------
alter table public.document_types
  add column if not exists category_id uuid references public.document_categories(id);

-- ----------------------------------------------------------------------------
-- 4. mortgage_rules — one row per borrower-profile rule.
--
-- Each of the 4 matching columns may be NULL, meaning "matches any" for that
-- dimension (wildcard). The TypeScript matcher picks the matching rule with
-- the fewest wildcards (most specific) — see
-- src/lib/mortgage-rules/match-rule.ts. Known Phase 1 limitation: Postgres
-- treats NULL as always-distinct in a unique index, so this constraint does
-- not catch two fully-identical wildcard rules; rule data is human-curated
-- and low-volume, so this is an accepted gap for now, not a blocking issue.
-- ----------------------------------------------------------------------------
create table if not exists public.mortgage_rules (
  id uuid primary key default gen_random_uuid(),
  rule_name text not null,
  nationality text,
  income_country text,
  employment_type text,
  income_structure text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (nationality, income_country, employment_type, income_structure)
);

alter table public.mortgage_rules enable row level security;

drop policy if exists "mortgage_rules_select_authenticated" on public.mortgage_rules;
create policy "mortgage_rules_select_authenticated" on public.mortgage_rules
for select
using (auth.uid() is not null);
-- No insert/update/delete policy: same reference-data pattern as
-- document_categories — human-managed via SQL Editor for Phase 1.

-- ----------------------------------------------------------------------------
-- 5. mortgage_rule_documents — the documents a given rule requires.
--
-- required_count is what actually drives "Completed" (uploaded_count >=
-- required_count, computed live from public.documents — never stored, so it
-- can never go stale). required_months is a separate, display-only label
-- (e.g. "Last 3 months") for the Documents page's "Required Months" column —
-- it is not itself used in the completion calculation, since not every
-- document type is period-based (e.g. NRIC front+back has a required_count
-- of 2 and no required_months).
-- ----------------------------------------------------------------------------
create table if not exists public.mortgage_rule_documents (
  id uuid primary key default gen_random_uuid(),
  mortgage_rule_id uuid not null references public.mortgage_rules(id) on delete cascade,
  document_type_id uuid not null references public.document_types(id),
  required_count int not null default 1,
  required_months int,
  created_at timestamptz not null default now(),
  unique (mortgage_rule_id, document_type_id)
);

alter table public.mortgage_rule_documents enable row level security;

drop policy if exists "mortgage_rule_documents_select_authenticated" on public.mortgage_rule_documents;
create policy "mortgage_rule_documents_select_authenticated" on public.mortgage_rule_documents
for select
using (auth.uid() is not null);

-- ----------------------------------------------------------------------------
-- 6. loan_case_required_documents — the generated, per-case checklist.
--
-- `state` only stores what can't be derived from live data: whether this
-- requirement is currently active under the case's matched rule, or has been
-- superseded by a rule change ('not_required'). "Missing" vs "Completed" is
-- never stored here — it's computed at read time from a live count against
-- public.documents, so it can never drift out of sync with reality.
--
-- Regeneration never deletes a row that already has an uploaded document —
-- see src/lib/mortgage-rules/generate-required-documents.ts for the full
-- reconciliation logic (product decision, not enforced by the DB itself).
-- ----------------------------------------------------------------------------
create table if not exists public.loan_case_required_documents (
  id uuid primary key default gen_random_uuid(),
  loan_case_id uuid not null references public.loan_cases(id) on delete cascade,
  document_type_id uuid not null references public.document_types(id),
  mortgage_rule_id uuid references public.mortgage_rules(id),
  required_count int not null default 1,
  required_months int,
  state text not null default 'active' check (state in ('active', 'not_required')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (loan_case_id, document_type_id)
);

alter table public.loan_case_required_documents enable row level security;

-- Same visibility pattern as public.documents (Sprint 6.1): re-checks the
-- matching loan_cases row's own RLS via EXISTS, so this can never be
-- broader than access to the case itself.
drop policy if exists "loan_case_required_documents_select" on public.loan_case_required_documents;
create policy "loan_case_required_documents_select" on public.loan_case_required_documents
for select
using (
  exists (
    select 1 from public.loan_cases lc
    where lc.id = loan_case_required_documents.loan_case_id
  )
);

drop policy if exists "loan_case_required_documents_write_staff" on public.loan_case_required_documents;
create policy "loan_case_required_documents_write_staff" on public.loan_case_required_documents
for insert
with check (
  exists (
    select 1 from public.loan_cases lc
    where lc.id = loan_case_required_documents.loan_case_id
  )
  and exists (
    select 1 from public.user_profiles up
    where up.auth_user_id = auth.uid()
      and up.role in ('super_admin', 'banker', 'property_agent', 'mortgage_outsource_agent')
  )
);

drop policy if exists "loan_case_required_documents_update_staff" on public.loan_case_required_documents;
create policy "loan_case_required_documents_update_staff" on public.loan_case_required_documents
for update
using (
  exists (
    select 1 from public.loan_cases lc
    where lc.id = loan_case_required_documents.loan_case_id
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
    where lc.id = loan_case_required_documents.loan_case_id
  )
);

-- ----------------------------------------------------------------------------
-- 7. loan_case_required_document_events — append-only audit trail of every
--    rule-driven change to a case's checklist ("complete audit history of
--    every rule change", per product decision). Immutable: insert-only, no
--    update/delete policy, same spirit as public.audit_logs.
-- ----------------------------------------------------------------------------
create table if not exists public.loan_case_required_document_events (
  id uuid primary key default gen_random_uuid(),
  loan_case_id uuid not null references public.loan_cases(id) on delete cascade,
  document_type_id uuid not null references public.document_types(id),
  mortgage_rule_id uuid references public.mortgage_rules(id),
  event_type text not null check (event_type in ('added', 'marked_not_required', 'reactivated')),
  actor_user_id uuid references public.user_profiles(id),
  occurred_at timestamptz not null default now()
);

alter table public.loan_case_required_document_events enable row level security;

drop policy if exists "loan_case_required_document_events_select" on public.loan_case_required_document_events;
create policy "loan_case_required_document_events_select" on public.loan_case_required_document_events
for select
using (
  exists (
    select 1 from public.loan_cases lc
    where lc.id = loan_case_required_document_events.loan_case_id
  )
);

drop policy if exists "loan_case_required_document_events_insert_staff" on public.loan_case_required_document_events;
create policy "loan_case_required_document_events_insert_staff" on public.loan_case_required_document_events
for insert
with check (
  exists (
    select 1 from public.loan_cases lc
    where lc.id = loan_case_required_document_events.loan_case_id
  )
  and exists (
    select 1 from public.user_profiles up
    where up.auth_user_id = auth.uid()
      and up.role in ('super_admin', 'banker', 'property_agent', 'mortgage_outsource_agent')
  )
);

-- ============================================================================
-- End of Sprint 6.2 Phase 1 migration
-- ============================================================================
