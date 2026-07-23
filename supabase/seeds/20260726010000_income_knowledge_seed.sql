-- ============================================================================
-- AIKIM Mortgage OS — Sprint 6.3B-1: Income Knowledge — TEMPLATE seed, NOT
-- real data.
--
-- ============================================================================
-- READ THIS BEFORE DOING ANYTHING WITH THIS FILE
--
-- This file is NOT a migration. It deliberately lives outside
-- supabase/migrations/, in supabase/seeds/, and is NEVER auto-run by any
-- tooling, script, or agent in this repo.
--
-- Every value below marked REPLACE_WITH_* is a placeholder. This script
-- seeds NOTHING meaningful as written — running it as-is would insert a
-- bank literally named 'REPLACE_WITH_REAL_BANK_NAME', which is obviously
-- fake and harmless, by design, so this file can never be mistaken for real
-- confirmed bank policy if someone runs it before editing it.
--
-- Per docs/product/mortgage-knowledge-database-prd.md Section 8: "no
-- migration should insert fabricated bank/product/rule rows... inventing
-- plausible-looking bank policy data would be indistinguishable from real
-- policy to whoever reads it later, and this project's discipline treats
-- that as a compliance risk." This file follows that discipline exactly —
-- it is a template for a human to fill in with real, confirmed bank data,
-- not a shortcut around it.
--
-- Like every migration in this repo: no agent ever executes this file. It
-- is authored for human review, and is only ever run manually, by a human,
-- in the Supabase SQL Editor — and only after every REPLACE_WITH_* value
-- below has been replaced with real, confirmed data (not a guess, not an
-- illustrative example, not something that "looks about right").
--
-- Prerequisite: 20260726010000_income_knowledge_schema.sql and
-- 20260726020000_income_knowledge_rls.sql must already have been run.
--
-- Idempotent: every INSERT below is an INSERT ... ON CONFLICT DO NOTHING /
-- guarded by a WHERE NOT EXISTS, so re-running this file after it has
-- already been filled in and run once is safe and inserts nothing twice.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. banks — ONE placeholder bank.
--
-- REPLACE_WITH_REAL_BANK_NAME must become the real, confirmed legal/trading
-- name of a bank AIKIM actually works with before this is run.
-- ----------------------------------------------------------------------------
insert into public.banks (name, short_code, is_active)
select 'REPLACE_WITH_REAL_BANK_NAME', 'REPLACE_WITH_REAL_SHORT_CODE', true
where not exists (
  select 1 from public.banks where name = 'REPLACE_WITH_REAL_BANK_NAME'
);

-- ----------------------------------------------------------------------------
-- 2. bank_products — ONE placeholder product for the bank above.
--
-- REPLACE_WITH_REAL_PRODUCT_NAME must become the real, confirmed name of
-- that bank's baseline home financing product before this is run.
-- ----------------------------------------------------------------------------
insert into public.bank_products (bank_id, product_name, financing_structure, is_active)
select b.id, 'REPLACE_WITH_REAL_PRODUCT_NAME', 'REPLACE_WITH_REAL_FINANCING_STRUCTURE', true
from public.banks b
where b.name = 'REPLACE_WITH_REAL_BANK_NAME'
  and not exists (
    select 1 from public.bank_products bp
    where bp.bank_id = b.id and bp.product_name = 'REPLACE_WITH_REAL_PRODUCT_NAME'
  );

-- ----------------------------------------------------------------------------
-- 3. income_recognition_rules — ONE illustrative rule, using the same
--    borrower profile as the already-approved Required Documents seed
--    (Malaysian / Malaysian / Employed / Basic Salary), per DB PRD Section 8.
--
--    recognition_method = 'full_value' deliberately, per DB PRD Section 8:
--    the one recognition method that requires no invented percentage or
--    averaging window, so this row does not cross the "no real bank policy
--    numbers" line even as an illustrative first real seed.
--
--    minimum_history_months = 3 mirrors the Required Documents seed's own
--    "3 months of salary slips" expectation (docs/decisions/0006-mortgage-rules-engine.md),
--    so the two seeds are consistent with each other — this is NOT itself
--    asserted as confirmed bank policy; a human must confirm this bank
--    actually requires 3 months before running this row for real.
--
--    bank_product_id is left NULL (bank-wide default / wildcard) — replace
--    with a specific bank_products.id only if this bank's treatment
--    genuinely differs per product.
-- ----------------------------------------------------------------------------
insert into public.income_recognition_rules (
  bank_id, bank_product_id, rule_name, income_source_type,
  nationality, income_country, employment_type, income_structure,
  recognition_method, minimum_history_months, description, is_active
)
select
  b.id, null, 'REPLACE_WITH_REAL_RULE_NAME', 'basic_salary',
  'Malaysian', 'Malaysian', 'Employed', 'Basic Salary',
  'full_value', 3,
  'REPLACE_WITH_REAL_DESCRIPTION — confirm this bank''s actual basic salary treatment before relying on this row.',
  true
from public.banks b
where b.name = 'REPLACE_WITH_REAL_BANK_NAME'
  and not exists (
    select 1 from public.income_recognition_rules r
    where r.bank_id = b.id and r.rule_name = 'REPLACE_WITH_REAL_RULE_NAME'
  );

-- ============================================================================
-- End of template. Nothing above is real, confirmed bank policy until every
-- REPLACE_WITH_* value has been replaced by a human and reviewed.
-- ============================================================================
