-- ============================================================================
-- AIKIM Mortgage OS — Sprint 6.2 Phase 2: Mortgage Rule Admin
--
-- Scope: schema additions to let a super_admin manage mortgage_rules,
-- mortgage_rule_documents, and document_categories through a UI, instead of
-- the SQL Editor. Builds on Sprint 6.2 Phase 1
-- (20260722010000_mortgage_rules_engine.sql) — additive only, reuses every
-- existing table. No OCR, AI screening, DSR, or recommendation logic.
--
-- Audit note: as with prior migrations, this session has no live schema
-- access, so every change below is defensive (IF NOT EXISTS / existence
-- checks before ADD CONSTRAINT) and additive-only. Verify against the actual
-- live schema before running — in particular, confirm Phase 1's migration
-- has actually been applied first, since this migration assumes
-- mortgage_rules / mortgage_rule_documents / document_categories exist.
--
-- Copy this entire file into the Supabase SQL Editor and run it once, after
-- 20260722010000_mortgage_rules_engine.sql. Idempotent: safe to re-run. Does
-- not touch any existing row data.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. mortgage_rules — versioning + effective-date columns (additive)
-- ----------------------------------------------------------------------------
alter table public.mortgage_rules
  add column if not exists description text,
  add column if not exists version int not null default 1,
  add column if not exists effective_from date,
  add column if not exists effective_to date;

comment on column public.mortgage_rules.description is 'Free-text admin note on why this rule exists / what it covers.';
comment on column public.mortgage_rules.version is 'Increments when a rule''s matching profile is meaningfully changed after it has been used, so historical loan_case_required_documents references stay interpretable.';
comment on column public.mortgage_rules.effective_from is 'Optional start date the rule applies from. NULL = no start restriction.';
comment on column public.mortgage_rules.effective_to is 'Optional end date. NULL = no end restriction.';

-- effective_to must not be earlier than effective_from (validation #10).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'mortgage_rules_effective_range_valid'
  ) then
    alter table public.mortgage_rules
      add constraint mortgage_rules_effective_range_valid
      check (effective_to is null or effective_from is null or effective_to >= effective_from);
  end if;
end $$;

-- Defensive: the wildcard convention is NULL, never ''. An empty string
-- would silently defeat both the matcher (src/lib/mortgage-rules/match-rule.ts
-- treats only NULL as wildcard) and the uniqueness index below (which
-- normalizes NULL, not '', for comparison).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'mortgage_rules_no_empty_string_wildcards'
  ) then
    alter table public.mortgage_rules
      add constraint mortgage_rules_no_empty_string_wildcards
      check (
        (nationality is null or nationality <> '') and
        (income_country is null or income_country <> '') and
        (employment_type is null or employment_type <> '') and
        (income_structure is null or income_structure <> '')
      );
  end if;
end $$;

-- Prevent duplicate *active* rules with the same exact profile + version
-- (validation #10). Kept alongside, not replacing, Phase 1's plain
-- unique(4 columns) constraint — that one still guards the non-versioned
-- case; this one adds version-awareness and NULL-safe (wildcard) comparison,
-- scoped to active rows only so historical/deactivated versions of the same
-- combination are allowed to coexist.
drop index if exists public.mortgage_rules_active_profile_version_idx;
create unique index mortgage_rules_active_profile_version_idx on public.mortgage_rules (
  coalesce(nationality, ''),
  coalesce(income_country, ''),
  coalesce(employment_type, ''),
  coalesce(income_structure, ''),
  version
)
where is_active;

-- ----------------------------------------------------------------------------
-- 2. mortgage_rule_documents — admin-manageable line-item fields (additive)
-- ----------------------------------------------------------------------------
alter table public.mortgage_rule_documents
  add column if not exists is_mandatory boolean not null default true,
  add column if not exists display_order int not null default 0,
  add column if not exists notes text;

comment on column public.mortgage_rule_documents.is_mandatory is 'False = required by policy but case can proceed without it (admin judgment call), true = blocks completion.';
comment on column public.mortgage_rule_documents.display_order is 'Manual ordering within a rule''s document list, set via the admin UI''s reorder action.';
comment on column public.mortgage_rule_documents.notes is 'Free-text admin note shown alongside this required document, e.g. special instructions.';

-- required_count >= 1, required_months >= 1 when supplied (validation #10).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'mortgage_rule_documents_required_count_valid'
  ) then
    alter table public.mortgage_rule_documents
      add constraint mortgage_rule_documents_required_count_valid
      check (required_count >= 1);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'mortgage_rule_documents_required_months_valid'
  ) then
    alter table public.mortgage_rule_documents
      add constraint mortgage_rule_documents_required_months_valid
      check (required_months is null or required_months >= 1);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 3. document_categories — Activate/Deactivate (additive)
-- ----------------------------------------------------------------------------
alter table public.document_categories
  add column if not exists is_active boolean not null default true;

-- ----------------------------------------------------------------------------
-- 4. RLS — super_admin-only writes. Phase 1 left these 3 tables read-only for
--    everyone (human-managed via SQL Editor); this is the first migration
--    that lets the application write to them at all.
--
-- No DELETE policy on mortgage_rules, ever — "prefer deactivate over hard
-- delete" / "do not delete rules already used by loan cases" is enforced at
-- the database level here, not just as an application convention.
-- ----------------------------------------------------------------------------
drop policy if exists "mortgage_rules_insert_super_admin" on public.mortgage_rules;
create policy "mortgage_rules_insert_super_admin" on public.mortgage_rules
for insert
with check (
  exists (
    select 1 from public.user_profiles up
    where up.auth_user_id = auth.uid() and up.role = 'super_admin'
  )
);

drop policy if exists "mortgage_rules_update_super_admin" on public.mortgage_rules;
create policy "mortgage_rules_update_super_admin" on public.mortgage_rules
for update
using (
  exists (
    select 1 from public.user_profiles up
    where up.auth_user_id = auth.uid() and up.role = 'super_admin'
  )
)
with check (
  exists (
    select 1 from public.user_profiles up
    where up.auth_user_id = auth.uid() and up.role = 'super_admin'
  )
);

drop policy if exists "mortgage_rule_documents_insert_super_admin" on public.mortgage_rule_documents;
create policy "mortgage_rule_documents_insert_super_admin" on public.mortgage_rule_documents
for insert
with check (
  exists (
    select 1 from public.user_profiles up
    where up.auth_user_id = auth.uid() and up.role = 'super_admin'
  )
);

drop policy if exists "mortgage_rule_documents_update_super_admin" on public.mortgage_rule_documents;
create policy "mortgage_rule_documents_update_super_admin" on public.mortgage_rule_documents
for update
using (
  exists (
    select 1 from public.user_profiles up
    where up.auth_user_id = auth.uid() and up.role = 'super_admin'
  )
)
with check (
  exists (
    select 1 from public.user_profiles up
    where up.auth_user_id = auth.uid() and up.role = 'super_admin'
  )
);

-- DELETE is allowed here (unlike mortgage_rules) — removing a required-document
-- line item from a rule is explicitly in scope ("add, edit, remove, and
-- reorder"), and these rows carry no historical reference from case data
-- (loan_case_required_documents.mortgage_rule_id points at the rule, not at
-- mortgage_rule_documents rows).
drop policy if exists "mortgage_rule_documents_delete_super_admin" on public.mortgage_rule_documents;
create policy "mortgage_rule_documents_delete_super_admin" on public.mortgage_rule_documents
for delete
using (
  exists (
    select 1 from public.user_profiles up
    where up.auth_user_id = auth.uid() and up.role = 'super_admin'
  )
);

drop policy if exists "document_categories_insert_super_admin" on public.document_categories;
create policy "document_categories_insert_super_admin" on public.document_categories
for insert
with check (
  exists (
    select 1 from public.user_profiles up
    where up.auth_user_id = auth.uid() and up.role = 'super_admin'
  )
);

drop policy if exists "document_categories_update_super_admin" on public.document_categories;
create policy "document_categories_update_super_admin" on public.document_categories
for update
using (
  exists (
    select 1 from public.user_profiles up
    where up.auth_user_id = auth.uid() and up.role = 'super_admin'
  )
)
with check (
  exists (
    select 1 from public.user_profiles up
    where up.auth_user_id = auth.uid() and up.role = 'super_admin'
  )
);
-- No DELETE policy on document_categories either — Activate/Deactivate only,
-- consistent with document_types referencing category_id.

-- ============================================================================
-- End of Sprint 6.2 Phase 2 schema migration
-- ============================================================================
