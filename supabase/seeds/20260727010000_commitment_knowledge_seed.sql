-- ============================================================================
-- AIKIM Mortgage OS — Sprint 6.3B-2: Commitment Knowledge — TEMPLATE seed,
-- NOT real data.
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
-- commitment rule literally scoped to a bank named
-- 'REPLACE_WITH_REAL_BANK_NAME', which is obviously fake and harmless, by
-- design, so this file can never be mistaken for real confirmed bank policy
-- if someone runs it before editing it.
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
-- Prerequisite: 20260726010000_income_knowledge_schema.sql,
-- 20260726020000_income_knowledge_rls.sql,
-- 20260727010000_commitment_knowledge_schema.sql, and
-- 20260727020000_commitment_knowledge_rls.sql must already have been run.
--
-- REPLACE_WITH_REAL_BANK_NAME below is deliberately the same placeholder
-- name used in supabase/seeds/20260726010000_income_knowledge_seed.sql, so
-- that if a human fills in both templates for the same real bank, this
-- row attaches to the same banks row the Income Knowledge seed creates,
-- rather than accidentally creating a second, duplicate bank. This file
-- does not insert a banks or bank_products row itself — it assumes the
-- Income Knowledge seed (or an equivalent manually-run insert) has already
-- created that bank.
--
-- Idempotent: the INSERT below is guarded by a WHERE NOT EXISTS, so
-- re-running this file after it has already been filled in and run once is
-- safe and inserts nothing twice.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. commitment_recognition_rules — ONE illustrative rule, for the same
--    real bank the Income Knowledge seed template references.
--
--    commitment_type = 'credit_card' — an illustrative, common commitment
--    type; not asserted as the only or first rule a real bank would need.
--
--    recognition_method = 'full_instalment' deliberately — the safest
--    illustrative choice, mirroring the Income Knowledge seed's own choice
--    of 'full_value': it requires no invented recognition_percentage
--    (unlike 'percentage_of_limit', which would need a real, confirmed
--    percentage this document is not authorized to invent). This is NOT
--    asserted as this bank's actual credit-card commitment policy — a
--    human must confirm it before relying on this row.
--
--    recognition_percentage is left NULL — only meaningful for a
--    percentage-based recognition_method, not 'full_instalment'.
--
--    allows_to_be_settled_exclusion = false — the conservative default; a
--    human must confirm this bank's actual settlement-exclusion policy
--    before changing it to true.
--
--    bank_product_id is left NULL (bank-wide default / wildcard) — replace
--    with a specific bank_products.id only if this bank's credit-card
--    commitment treatment genuinely differs per product.
-- ----------------------------------------------------------------------------
insert into public.commitment_recognition_rules (
  bank_id, bank_product_id, rule_name, commitment_type,
  recognition_method, recognition_percentage,
  allows_to_be_settled_exclusion, description, is_active
)
select
  b.id, null, 'REPLACE_WITH_REAL_RULE_NAME', 'credit_card',
  'full_instalment', null,
  false,
  'REPLACE_WITH_REAL_DESCRIPTION — confirm this bank''s actual credit card commitment treatment before relying on this row.',
  true
from public.banks b
where b.name = 'REPLACE_WITH_REAL_BANK_NAME'
  and not exists (
    select 1 from public.commitment_recognition_rules r
    where r.bank_id = b.id and r.rule_name = 'REPLACE_WITH_REAL_RULE_NAME'
  );

-- ============================================================================
-- End of template. Nothing above is real, confirmed bank policy until every
-- REPLACE_WITH_* value has been replaced by a human and reviewed.
-- ============================================================================
