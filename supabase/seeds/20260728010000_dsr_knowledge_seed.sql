-- ============================================================================
-- AIKIM Mortgage OS — Sprint 6.3B-3: DSR Rules Knowledge — TEMPLATE seed,
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
-- DSR rule literally scoped to a bank named 'REPLACE_WITH_REAL_BANK_NAME',
-- which is obviously fake and harmless, by design, so this file can never
-- be mistaken for real confirmed bank policy if someone runs it before
-- editing it.
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
-- 20260728010000_dsr_knowledge_schema.sql, and
-- 20260728020000_dsr_knowledge_rls.sql must already have been run.
-- (Commitment Knowledge's migrations are not a prerequisite for this file
-- specifically, but are expected to already be run in this repo's actual
-- sequencing.)
--
-- REPLACE_WITH_REAL_BANK_NAME below is deliberately the same placeholder
-- name used in supabase/seeds/20260726010000_income_knowledge_seed.sql and
-- supabase/seeds/20260727010000_commitment_knowledge_seed.sql, so that if a
-- human fills in all three templates for the same real bank, this row
-- attaches to the same banks row those seeds create, rather than
-- accidentally creating a second, duplicate bank. This file does not
-- insert a banks or bank_products row itself — it assumes the Income
-- Knowledge seed (or an equivalent manually-run insert) has already
-- created that bank.
--
-- Idempotent: the INSERT below is guarded by a WHERE NOT EXISTS, so
-- re-running this file after it has already been filled in and run once is
-- safe and inserts nothing twice.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. dsr_rules — ONE illustrative rule, for the same real bank the Income
--    and Commitment Knowledge seed templates reference.
--
--    bank_product_id is left NULL (bank-wide default / wildcard) — replace
--    with a specific bank_products.id only if this bank's DSR treatment
--    genuinely differs per product.
--
--    income_tier_lower_bound and income_tier_upper_bound are both left
--    NULL — no income-tier restriction, i.e. this illustrative rule applies
--    to every income level for this bank/product. Unlike the prior two
--    seeds' choice of 'full_value' / 'full_instalment' (a genuinely safe,
--    no-invented-number method that both Income and Commitment Knowledge
--    happened to have available), DSR has no equivalent safe numeric
--    choice: max_dsr_percentage and stress_test_rate_buffer_percentage are
--    left NULL below and MUST stay NULL until a human supplies this bank's
--    real, confirmed DSR cap and stress-test buffer. Even a "plausible" or
--    "commonly cited" percentage here (e.g. a round number that merely
--    looks reasonable) would be indistinguishable from real, confirmed
--    bank policy to a future reader — the exact compliance risk DB PRD
--    Section 8 and this codebase's "real data only" principle both flag.
--    Do not fill these two columns in with a guess; only with a number a
--    human has confirmed against this bank's actual, current DSR policy.
-- ----------------------------------------------------------------------------
insert into public.dsr_rules (
  bank_id, bank_product_id, rule_name,
  max_dsr_percentage, stress_test_rate_buffer_percentage,
  income_tier_lower_bound, income_tier_upper_bound,
  description, is_active
)
select
  b.id, null, 'REPLACE_WITH_REAL_RULE_NAME',
  null, null,
  null, null,
  'REPLACE_WITH_REAL_DESCRIPTION — confirm this bank''s actual DSR cap and stress-test buffer before relying on this row. max_dsr_percentage and stress_test_rate_buffer_percentage are left NULL deliberately; do not fill them in with an invented or "plausible-looking" figure.',
  true
from public.banks b
where b.name = 'REPLACE_WITH_REAL_BANK_NAME'
  and not exists (
    select 1 from public.dsr_rules r
    where r.bank_id = b.id and r.rule_name = 'REPLACE_WITH_REAL_RULE_NAME'
  );

-- ============================================================================
-- End of template. Nothing above is real, confirmed bank policy until every
-- REPLACE_WITH_* value has been replaced by a human and reviewed — and, for
-- this table in particular, max_dsr_percentage / stress_test_rate_buffer_percentage
-- remain NULL until a human supplies a real, confirmed figure.
-- ============================================================================
