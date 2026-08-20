-- ============================================================================
-- AIKIM Mortgage OS — Banker Pilot: Malaysian / Salaried / Fixed-Income
-- Baseline Document Checklist Seed
--
-- Scope: the first real mortgage_rules row (plus its 7 mortgage_rule_documents
-- line items) for the 5 waiting Banker pilot users, and the 2 document_types
-- rows it depends on that do not exist in production yet. This is real,
-- product-confirmed data authored from an explicit, in-session product
-- decision (Aug 2026) — not fabricated or illustrative.
--
-- Confirmed borrower-profile scenario and mappings (product-confirmed, this
-- session): Malaysian citizen, income earned in Malaysia, salaried
-- employment, basic/fixed salary only.
--   - "Employed" -> employment_type = 'Salaried' (existing option; no new
--     enum value added, per explicit instruction).
--   - "Basic salary only" -> income_structure = 'Fixed' (existing option;
--     no new enum value added, per explicit instruction).
-- See src/lib/mortgage-rules/borrower-profile-options.ts for the canonical
-- option lists these 4 values are drawn from.
--
-- Confirmed live production schema for public.document_types (read directly
-- by the user via information_schema.columns immediately before this file
-- was authored — not assumed): id uuid not null default gen_random_uuid(),
-- name text nullable, description text nullable, is_required boolean not
-- null default true, created_at/updated_at timestamptz not null default
-- now(), category_id uuid nullable default null, ocr_kind text nullable
-- default null. is_required predates this repository's migration history
-- (same class of table as the banks/bank_products discovery documented in
-- docs/architecture/database.md) and is referenced by zero application code
-- (grep -rn "is_required" src/ returns nothing) — the 2 new rows below
-- explicitly set it to true (its own default) for auditability, not because
-- any code path reads it.
--
-- Confirmed via a read-only production diagnostic run by the user
-- immediately before this file was authored:
--   - document_types: 7 live rows, all with category_id NULL. The 6
--     OCR-eligible rows are correctly tagged (nric, salary_slip,
--     bank_statement, epf_statement, employment_letter, ea_form); "Sale and
--     Purchase Agreement (SPA)" is NULL by design. Confirms
--     20260802010000_document_screening_confidence_validation.sql and
--     20260803010000_document_types_ocr_kind_tagging.sql have both taken
--     effect in production.
--   - document_categories: 0 live rows. category_id stays NULL on both new
--     document_types rows below, the same precedent
--     20260803010000_document_types_ocr_kind_tagging.sql set for its "EA
--     Form" row — categorization is a separate, later judgment call.
--   - "Latest 1 Year Income Tax Filing (LHDN)" and "CTOS / CCRIS Credit
--     Report": 0 matches by exact name — confirmed absent, safe to insert.
--   - mortgage_rules: 0 rows. mortgage_rule_documents: 0 rows. This is the
--     first row in both tables.
--
-- ocr_kind on both new document_types rows is explicitly NULL — the current
-- OCR provider does not support either document kind; they must not be
-- represented as OCR-enabled until implementation and acceptance testing
-- exist for them (explicit product decision, this session).
--
-- IMPORTANT — mortgage_rules idempotency constraint, verified against
-- 20260722010000_mortgage_rules_engine.sql: this table carries a PLAIN
-- (non-partial) unique constraint on exactly (nationality, income_country,
-- employment_type, income_structure) — unlike the Phase 2 partial index
-- (mortgage_rules_active_profile_version_idx), this one is NOT scoped to
-- active rows and does NOT include version. Once the row below exists, no
-- second row can ever be inserted with this exact 4-value profile, active or
-- not, any version. A future revision to this rule's document list must
-- UPDATE this same row in place (e.g. bump version via the Rule Admin UI),
-- never insert a new row with an identical profile.
--
-- The new mortgage_rules row is inserted with is_active = false. This is an
-- assumption, not explicitly specified in the approved scope — it mirrors
-- this codebase's own convention (src/app/(app)/settings/mortgage-rules/
-- actions.ts's duplicateRuleAction: "Starts inactive ... so the admin
-- reviews before it can collide with another active rule"). A super_admin
-- reviews and flips it Active via the existing, already-built Rule Admin UI
-- once this migration has been run — that UI action is zero-risk and
-- reversible; this file deliberately does not do it. rule_name and
-- description text below are final, product-confirmed values (this
-- session), not placeholders.
--
-- Idempotent: every section below is guarded (name-existence checks with
-- fail-loud ambiguity handling, "insert ... where not exists" for the rule
-- and its line items). Safe to re-run; a second run changes zero rows and
-- raises notices instead of errors for anything already in place.
--
-- Transactional: wrapped in an explicit begin;/commit; — any exception
-- anywhere below (including a raise exception inside a do $$ ... $$ block)
-- aborts the entire transaction, so a failure partway through (e.g. an
-- ambiguous or missing document_types row) cannot leave a partially-seeded
-- rule.
--
-- Runs via the Supabase SQL Editor (superuser/service context), so it is not
-- blocked by document_types having no INSERT RLS policy of its own, or by
-- mortgage_rules/mortgage_rule_documents' super_admin-only insert policies
-- (supabase/migrations/20260723010000_mortgage_rule_admin.sql) — the same
-- posture every other seed migration in this repository relies on.
--
-- Copy this entire file into the Supabase SQL Editor and run it once, after
-- confirming 20260722010000_mortgage_rules_engine.sql and
-- 20260723010000_mortgage_rule_admin.sql have both been executed (already
-- confirmed — see docs/AI_HANDOVER.md) and after confirming
-- 20260802010000_document_screening_confidence_validation.sql and
-- 20260803010000_document_types_ocr_kind_tagging.sql (confirmed by the
-- user's own diagnostic query results, this session). Does not touch any
-- other existing row. NOT executed by this session — pending human review
-- and manual execution.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. document_types — create the 2 missing types. Idempotent and
--    ambiguity-safe: matches the normalized-name pattern established by
--    20260803010000_document_types_ocr_kind_tagging.sql (lower(trim(name))),
--    since document_types.name carries no unique constraint in this schema.
-- ----------------------------------------------------------------------------
do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.document_types
    where lower(trim(name)) = lower(trim('Latest 1 Year Income Tax Filing (LHDN)'));

  if v_count = 0 then
    insert into public.document_types (name, is_required, category_id, ocr_kind)
    values ('Latest 1 Year Income Tax Filing (LHDN)', true, null, null);
  elsif v_count = 1 then
    raise notice 'banker_pilot_document_checklist_seed: "Latest 1 Year Income Tax Filing (LHDN)" already exists — skipping insert.';
  else
    raise exception 'banker_pilot_document_checklist_seed: % rows normalized-matching "Latest 1 Year Income Tax Filing (LHDN)" found — refusing to proceed ambiguously, resolve duplicates first.', v_count;
  end if;
end $$;

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.document_types
    where lower(trim(name)) = lower(trim('CTOS / CCRIS Credit Report'));

  if v_count = 0 then
    insert into public.document_types (name, is_required, category_id, ocr_kind)
    values ('CTOS / CCRIS Credit Report', true, null, null);
  elsif v_count = 1 then
    raise notice 'banker_pilot_document_checklist_seed: "CTOS / CCRIS Credit Report" already exists — skipping insert.';
  else
    raise exception 'banker_pilot_document_checklist_seed: % rows normalized-matching "CTOS / CCRIS Credit Report" found — refusing to proceed ambiguously, resolve duplicates first.', v_count;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 2. mortgage_rules — one baseline rule. See header for the is_active=false
--    and idempotency-constraint notes.
-- ----------------------------------------------------------------------------
insert into public.mortgage_rules (
  rule_name, description,
  nationality, income_country, employment_type, income_structure,
  version, is_active
)
select
  'Malaysia Salaried Fixed Income — Pilot Baseline',
  'Baseline required-document checklist for Malaysian salaried applicants earning fixed income in Malaysia.',
  'Malaysian', 'Malaysia', 'Salaried', 'Fixed',
  1, false
where not exists (
  select 1 from public.mortgage_rules
  where nationality = 'Malaysian'
    and income_country = 'Malaysia'
    and employment_type = 'Salaried'
    and income_structure = 'Fixed'
);

-- ----------------------------------------------------------------------------
-- 3. mortgage_rule_documents — the 7 required line items. Resolves each
--    document_type_id by normalized name (no live UUIDs were available to
--    hardcode) and fails loudly, before inserting anything in this section,
--    if any of the 7 names does not resolve to exactly one document_types
--    row — including the 2 rows section 1 is responsible for creating first.
-- ----------------------------------------------------------------------------
do $$
declare
  v_rule_id uuid;
  v_name text;
  v_count int;
  v_names text[] := array[
    'NRIC / Identification Copy',
    'Employment Confirmation Letter',
    'Latest 3 Months Payslip',
    'Bank Statement',
    'EPF Statement',
    'Latest 1 Year Income Tax Filing (LHDN)',
    'CTOS / CCRIS Credit Report'
  ];
begin
  select id into v_rule_id from public.mortgage_rules
    where nationality = 'Malaysian'
      and income_country = 'Malaysia'
      and employment_type = 'Salaried'
      and income_structure = 'Fixed';

  if v_rule_id is null then
    raise exception 'banker_pilot_document_checklist_seed: baseline mortgage_rules row not found after section 2 — aborting.';
  end if;

  foreach v_name in array v_names loop
    select count(*) into v_count from public.document_types where lower(trim(name)) = lower(trim(v_name));
    if v_count = 0 then
      raise exception 'banker_pilot_document_checklist_seed: document_types row "%" not found — aborting.', v_name;
    elsif v_count > 1 then
      raise exception 'banker_pilot_document_checklist_seed: % rows normalized-matching "%" found — refusing to proceed ambiguously.', v_count, v_name;
    end if;
  end loop;
end $$;

insert into public.mortgage_rule_documents (
  mortgage_rule_id, document_type_id, required_count, required_months, is_mandatory, display_order
)
select r.id, dt.id, x.required_count, x.required_months, true, x.display_order
from public.mortgage_rules r
cross join (values
  ('NRIC / Identification Copy',             1, null::int, 1),
  ('Employment Confirmation Letter',          1, null::int, 2),
  ('Latest 3 Months Payslip',                 3, 3,         3),
  ('Bank Statement',                          3, 3,         4),
  ('EPF Statement',                           1, null::int, 5),
  ('Latest 1 Year Income Tax Filing (LHDN)',  1, 12,        6),
  ('CTOS / CCRIS Credit Report',              1, null::int, 7)
) as x(type_name, required_count, required_months, display_order)
join public.document_types dt on lower(trim(dt.name)) = lower(trim(x.type_name))
where r.nationality = 'Malaysian'
  and r.income_country = 'Malaysia'
  and r.employment_type = 'Salaried'
  and r.income_structure = 'Fixed'
  and not exists (
    select 1 from public.mortgage_rule_documents mrd
    where mrd.mortgage_rule_id = r.id and mrd.document_type_id = dt.id
  );

commit;

-- ============================================================================
-- Rollback (NOT executed by this migration — documented for a human to run
-- manually if this needs to be reverted).
--
-- 1. The 7 line items are always safe to delete — RULE_ENGINE.md confirms
--    mortgage_rule_documents rows carry no historical reference from case
--    data (loan_case_required_documents.mortgage_rule_id points at the rule,
--    not at these rows):
--
--   delete from public.mortgage_rule_documents
--     where mortgage_rule_id = (
--       select id from public.mortgage_rules
--       where nationality = 'Malaysian' and income_country = 'Malaysia'
--         and employment_type = 'Salaried' and income_structure = 'Fixed'
--     );
--
-- 2. The mortgage_rules row itself: this codebase's design principle is "no
--    hard delete of a mortgage_rules row, ever" (no DELETE RLS policy
--    exists at the application layer). Prefer deactivating it instead
--    (harmless — it is created inactive already):
--
--   update public.mortgage_rules set is_active = false
--     where nationality = 'Malaysian' and income_country = 'Malaysia'
--       and employment_type = 'Salaried' and income_structure = 'Fixed';
--
--    A true hard delete is only safe (and only possible — an FK from
--    loan_case_required_documents will block it once any case has used it)
--    immediately after this migration, before any pilot case has run against
--    it. Confirm zero loan_case_required_documents/loan_case_required_
--    document_events rows reference it first:
--
--   delete from public.mortgage_rules
--     where nationality = 'Malaysian' and income_country = 'Malaysia'
--       and employment_type = 'Salaried' and income_structure = 'Fixed';
--
-- 3. The 2 new document_types rows — same caveat as the EA Form rollback in
--    20260803010000_document_types_ocr_kind_tagging.sql: confirm no
--    documents / mortgage_rule_documents / loan_case_required_documents /
--    loan_case_required_document_events row references either before
--    deleting:
--
--   delete from public.document_types where name in (
--     'Latest 1 Year Income Tax Filing (LHDN)',
--     'CTOS / CCRIS Credit Report'
--   );
-- ============================================================================

-- ============================================================================
-- Verification (NOT executed by this migration — for a human to run manually
-- after applying the migration above):
--
--   select mr.id as rule_id, mr.rule_name, mr.is_active, mr.version,
--          mrd.display_order, dt.name as document_type, dt.ocr_kind,
--          mrd.required_count, mrd.required_months, mrd.is_mandatory
--   from public.mortgage_rules mr
--   join public.mortgage_rule_documents mrd on mrd.mortgage_rule_id = mr.id
--   join public.document_types dt on dt.id = mrd.document_type_id
--   where mr.nationality = 'Malaysian' and mr.income_country = 'Malaysia'
--     and mr.employment_type = 'Salaried' and mr.income_structure = 'Fixed'
--   order by mrd.display_order;
--
-- Expected result: 7 rows, display_order 1-7 in exactly the order listed in
-- this file's section 3, is_mandatory = true on every row, is_active = false
-- on the rule (until a super_admin activates it via the Rule Admin UI), and
-- ocr_kind = NULL on both "Latest 1 Year Income Tax Filing (LHDN)" and
-- "CTOS / CCRIS Credit Report".
-- ============================================================================
