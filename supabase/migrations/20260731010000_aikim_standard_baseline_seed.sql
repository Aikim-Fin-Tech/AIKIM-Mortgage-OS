-- ============================================================================
-- AIKIM Mortgage OS — AIKIM Standard Baseline Seed
--
-- Authorizing decision: docs/decisions/0015-aikim-standard-baseline-seeding.md
-- ("0015. AIKIM Standard Baseline Seeding"). Read that ADR in full before
-- touching this file — it is the binding spec for every row below, not just
-- background.
--
-- What this migration does: seeds exactly ONE canonical, explicitly-labeled
-- "house view" bank/product pair — `banks.name = 'AIKIM Standard'`,
-- `bank_products.product_name = 'Standard Mortgage'` — plus the initial rule
-- rows for all four Knowledge domains built in Sprints 6.3B-1 through 6.3B-4
-- (Income Recognition, Commitment Recognition, DSR Rules, Property Rules).
-- This is NOT a real bank. It exists so those four domains have a sane,
-- exercisable default without inventing a real bank's confirmed policy — see
-- ADR 0015's Decision section for the two-category test every row below
-- must satisfy ("well-supported mortgage knowledge" vs "bank-specific
-- underwriting policy that must never be invented").
--
-- This is a real, run-this migration under supabase/migrations/ — NOT one of
-- the REPLACE_WITH_* templates in supabase/seeds/, which remain untouched
-- and remain the correct mechanism for onboarding a specific real bank later
-- (ADR 0015, "sits alongside, and does not replace").
--
-- Every row below satisfies ADR 0015's two durable rules:
--   1. Self-identification — every `description` opens by stating this is an
--      AIKIM Standard house-view default, never phrased as a real bank's
--      confirmed policy.
--   2. Confidence basis — every `description` states inline whether the row
--      is a "verified regulatory/industry convention" (with a one-line
--      source) or an "AIKIM house judgment call" (no invented source).
-- The DSR carve-out (ADR 0015 rule 3) is honored exactly: every `dsr_rules`
-- row below has `max_dsr_percentage` and `stress_test_rate_buffer_percentage`
-- left NULL — framework (income-tier segmentation) only, no bank-specific
-- number. The one `property_rules` row for commercial/completed/
-- owner_occupied financing is treated the same way, per ADR 0015 rule 3's
-- explicit extension of the DSR carve-out to any figure "that would only be
-- true of one bank's own policy" — `margin_of_finance_percentage` and
-- `max_tenure_years` are left NULL on that row.
--
-- ============================================================================
-- KNOWN BLOCKING ISSUE — READ BEFORE RUNNING THIS FILE
--
-- This migration was authored by reviewing the actual, already-committed
-- schema (not assumed), and that review surfaced a pre-existing gap in three
-- of the four rule tables' partial unique indexes — a gap this migration
-- does NOT fix (fixing it is a schema change requiring its own human review
-- and is out of scope for a seed-only migration; not attempted here). A
-- human running this file should expect it to fail partway through unless
-- that gap is closed first. Every INSERT below is still correct, idempotent
-- SQL for the ADR-0015-approved dataset — the problem is entirely in the
-- three pre-existing indexes below, not in the data or the INSERT
-- statements themselves.
--
-- 1. income_recognition_rules_active_profile_version_idx
--    (defined in supabase/migrations/20260726010000_income_knowledge_schema.sql)
--    indexes (bank_id, bank_product_id, nationality, income_country,
--    employment_type, income_structure, version) — it does NOT include
--    income_source_type. All 6 AIKIM Standard income rules in Section 3
--    below share the exact same bank_id, bank_product_id (NULL),
--    nationality/income_country/employment_type/income_structure (all NULL,
--    per this baseline being a bank-wide default), and version (default 1)
--    — they differ ONLY by income_source_type, a column this index does not
--    see. The first income_recognition_rules INSERT below will succeed; the
--    second ("Fixed Allowance") and every one after it will fail with a
--    duplicate-key violation on this index, because as far as this index is
--    concerned they are indistinguishable from the first row.
--
-- 2. dsr_rules_active_profile_version_idx
--    (defined in supabase/migrations/20260728010000_dsr_knowledge_schema.sql)
--    indexes (bank_id, bank_product_id, version) ONLY — income_tier_lower_bound
--    and income_tier_upper_bound are not part of it at all. That migration's
--    own comment frames this as an "accepted gap" about *overlapping* tier
--    ranges, but the literal index is stricter than that comment implies: it
--    also blocks entirely non-overlapping, legitimately different tiers
--    (e.g. the three necessary income tiers in Section 6 below) from
--    coexisting under the same bank/product/version, because no tier-bound
--    column participates in the uniqueness check at all. The first dsr_rules
--    INSERT below will succeed; the second and third will fail the same way
--    as above.
--
-- 3. property_rules_active_profile_version_idx
--    (defined in supabase/migrations/20260729010000_property_rules_knowledge_schema.sql)
--    indexes (bank_id, bank_product_id, property_type, construction_status,
--    occupancy_intent, version) — it does NOT include
--    existing_property_count_min/existing_property_count_max. Two of the 5
--    AIKIM Standard property rules in Section 5 below (residential/
--    completed/owner_occupied, 1st/2nd property vs. 3rd+ property) are
--    identical on every indexed column and differ only by
--    existing_property_count_min/max. The 1st/2nd-property row will insert
--    successfully; the 3rd+-property row will fail the same way as above.
--
-- commitment_recognition_rules is NOT affected: its own index
-- (commitment_recognition_rules_active_profile_version_idx) already includes
-- commitment_type, and all 4 AIKIM Standard commitment rules below use a
-- distinct commitment_type, so Section 4 below inserts cleanly end to end.
--
-- Recommended remediation (not performed by this file): a separate,
-- human-reviewed schema migration widening these three indexes — add
-- income_source_type (required, no coalesce needed) to
-- income_recognition_rules_active_profile_version_idx; add
-- coalesce(income_tier_lower_bound::text, '') and
-- coalesce(income_tier_upper_bound::text, '') to
-- dsr_rules_active_profile_version_idx; add
-- coalesce(existing_property_count_min::text, '') and
-- coalesce(existing_property_count_max::text, '') to
-- property_rules_active_profile_version_idx. That migration is not authored
-- here — it is a schema-shape decision distinct from this file's seed-only
-- scope and needs its own review.
--
-- Because every INSERT below is individually guarded by its own
-- `WHERE NOT EXISTS` check (see each section), and each statement commits
-- independently in the Supabase SQL Editor (this file contains no explicit
-- BEGIN/COMMIT, matching every other migration in this repo), a partial run
-- is safe to leave as-is and safe to re-run later: whichever rows already
-- inserted successfully will be skipped on a re-run, and only the rows
-- blocked by the indexes above will still be missing until that index fix is
-- applied and this file is run again.
-- ============================================================================
--
-- Idempotent: every INSERT below is guarded by a WHERE NOT EXISTS check
-- keyed on a natural identifier (bank name, product name, or rule name
-- scoped to the bank), so re-running this file after it has already run
-- successfully inserts nothing twice. Touches zero existing row data — every
-- statement below is an INSERT guarded against its own prior effect, never
-- an UPDATE or DELETE.
--
-- Copy this entire file into the Supabase SQL Editor and run it once, after
-- all prior migrations (through 20260730030000_eligibility_engine_rpc.sql).
-- NOT executed by this session — pending human review and manual execution.
-- No PostgREST-visible function or view is added or changed by this
-- migration, so no `notify pgrst, 'reload schema';` is needed.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. banks — the AIKIM Standard canonical baseline bank. Not a real bank —
--    see the file header and ADR 0015.
-- ----------------------------------------------------------------------------
insert into public.banks (name, short_code, is_active)
select 'AIKIM Standard', 'AIKIM-STD', true
where not exists (
  select 1 from public.banks where name = 'AIKIM Standard'
);

-- ----------------------------------------------------------------------------
-- 2. bank_products — the single baseline product under AIKIM Standard.
-- ----------------------------------------------------------------------------
insert into public.bank_products (bank_id, product_name, product_code, financing_structure, is_active)
select b.id, 'Standard Mortgage', 'AIKIM-STD-MTG', 'conventional', true
from public.banks b
where b.name = 'AIKIM Standard'
  and not exists (
    select 1 from public.bank_products bp
    where bp.bank_id = b.id and bp.product_name = 'Standard Mortgage'
  );

-- ----------------------------------------------------------------------------
-- 3. income_recognition_rules — 6 bank-wide (bank_product_id NULL) rules, one
--    per income_source_type, all wildcarded on the 4 borrower-profile
--    columns (nationality/income_country/employment_type/income_structure =
--    NULL) so they apply regardless of borrower profile. See the "KNOWN
--    BLOCKING ISSUE" section above the file header — only the first of these
--    6 statements is expected to succeed against the current schema; the
--    other 5 will fail on income_recognition_rules_active_profile_version_idx
--    until that index is widened to include income_source_type.
-- ----------------------------------------------------------------------------
insert into public.income_recognition_rules (
  bank_id, bank_product_id, rule_name, income_source_type,
  nationality, income_country, employment_type, income_structure,
  recognition_method, haircut_percentage, averaging_window_months, minimum_history_months,
  description, is_active
)
select
  b.id, null, 'AIKIM Standard — Basic Salary', 'basic_salary',
  null, null, null, null,
  'full_value', null, null, 3,
  'AIKIM Standard house-view default — not a specific real bank''s confirmed policy. Confidence basis: AIKIM house judgment call, consistent with the existing Required Documents seed convention of 3 months of salary slips (see ADR 0006, docs/decisions/0006-mortgage-rules-engine.md). Basic salary is recognized at full value with a 3-month minimum history.',
  true
from public.banks b
where b.name = 'AIKIM Standard'
  and not exists (
    select 1 from public.income_recognition_rules r
    where r.bank_id = b.id and r.rule_name = 'AIKIM Standard — Basic Salary'
  );

insert into public.income_recognition_rules (
  bank_id, bank_product_id, rule_name, income_source_type,
  nationality, income_country, employment_type, income_structure,
  recognition_method, haircut_percentage, averaging_window_months, minimum_history_months,
  description, is_active
)
select
  b.id, null, 'AIKIM Standard — Fixed Allowance', 'fixed_allowance',
  null, null, null, null,
  'full_value', null, null, 3,
  'AIKIM Standard house-view default — not a specific real bank''s confirmed policy. Confidence basis: AIKIM house judgment call. A contractually fixed allowance is recognized at full value, with the same 3-month minimum history as basic salary.',
  true
from public.banks b
where b.name = 'AIKIM Standard'
  and not exists (
    select 1 from public.income_recognition_rules r
    where r.bank_id = b.id and r.rule_name = 'AIKIM Standard — Fixed Allowance'
  );

insert into public.income_recognition_rules (
  bank_id, bank_product_id, rule_name, income_source_type,
  nationality, income_country, employment_type, income_structure,
  recognition_method, haircut_percentage, averaging_window_months, minimum_history_months,
  description, is_active
)
select
  b.id, null, 'AIKIM Standard — Commission (Averaged)', 'commission',
  null, null, null, null,
  'rolling_average', null, 12, 12,
  'AIKIM Standard house-view default — not a specific real bank''s confirmed policy. Confidence basis: AIKIM house judgment call. Variable commission income is smoothed via a 12-month rolling average rather than a haircut, with a 12-month minimum history required to compute it.',
  true
from public.banks b
where b.name = 'AIKIM Standard'
  and not exists (
    select 1 from public.income_recognition_rules r
    where r.bank_id = b.id and r.rule_name = 'AIKIM Standard — Commission (Averaged)'
  );

insert into public.income_recognition_rules (
  bank_id, bank_product_id, rule_name, income_source_type,
  nationality, income_country, employment_type, income_structure,
  recognition_method, haircut_percentage, averaging_window_months, minimum_history_months,
  description, is_active
)
select
  b.id, null, 'AIKIM Standard — Bonus (Averaged)', 'bonus',
  null, null, null, null,
  'rolling_average', null, 24, 24,
  'AIKIM Standard house-view default — not a specific real bank''s confirmed policy. Confidence basis: AIKIM house judgment call. A 24-month averaging window and matching 24-month minimum history are used because that span reliably captures at least two annual bonus payout cycles.',
  true
from public.banks b
where b.name = 'AIKIM Standard'
  and not exists (
    select 1 from public.income_recognition_rules r
    where r.bank_id = b.id and r.rule_name = 'AIKIM Standard — Bonus (Averaged)'
  );

insert into public.income_recognition_rules (
  bank_id, bank_product_id, rule_name, income_source_type,
  nationality, income_country, employment_type, income_structure,
  recognition_method, haircut_percentage, averaging_window_months, minimum_history_months,
  description, is_active
)
select
  b.id, null, 'AIKIM Standard — Rental Income', 'rental',
  null, null, null, null,
  'percentage_haircut', 30, null, 6,
  'AIKIM Standard house-view default — not a specific real bank''s confirmed policy. Confidence basis: AIKIM house judgment call, reflecting a commonly-cited Malaysian market convention for vacancy/collection risk on rental income — not independently regulatory-verified. Rental income is recognized at 70% of its stated value (a 30% haircut), with a 6-month minimum history.',
  true
from public.banks b
where b.name = 'AIKIM Standard'
  and not exists (
    select 1 from public.income_recognition_rules r
    where r.bank_id = b.id and r.rule_name = 'AIKIM Standard — Rental Income'
  );

insert into public.income_recognition_rules (
  bank_id, bank_product_id, rule_name, income_source_type,
  nationality, income_country, employment_type, income_structure,
  recognition_method, haircut_percentage, averaging_window_months, minimum_history_months,
  description, is_active
)
select
  b.id, null, 'AIKIM Standard — Business/Self-Employed', 'business_self_employed',
  null, null, null, null,
  'rolling_average', null, 24, 24,
  'AIKIM Standard house-view default — not a specific real bank''s confirmed policy. Mixed confidence basis: the 24-month minimum history is a verified regulatory/industry convention (2 years of tax filing history — Form B/BE — is a well-established Malaysian self-employed mortgage documentation requirement); treating this income as pure 24-month rolling averaging with no additional haircut is, separately, an AIKIM house judgment call and a known simplification.',
  true
from public.banks b
where b.name = 'AIKIM Standard'
  and not exists (
    select 1 from public.income_recognition_rules r
    where r.bank_id = b.id and r.rule_name = 'AIKIM Standard — Business/Self-Employed'
  );

-- ----------------------------------------------------------------------------
-- 4. commitment_recognition_rules — 4 bank-wide (bank_product_id NULL)
--    rules, one per commitment_type. Not affected by the index gap
--    described above — commitment_type is part of this table's unique
--    index and every row here uses a distinct value.
-- ----------------------------------------------------------------------------
insert into public.commitment_recognition_rules (
  bank_id, bank_product_id, rule_name, commitment_type,
  recognition_method, recognition_percentage, allows_to_be_settled_exclusion,
  description, is_active
)
select
  b.id, null, 'AIKIM Standard — Credit Card', 'credit_card',
  'percentage_of_limit', 5, true,
  'AIKIM Standard house-view default — not a specific real bank''s confirmed policy. Confidence basis: verified industry convention — 5% of outstanding credit limit as the assumed monthly commitment is a near-universal Malaysian banking convention.',
  true
from public.banks b
where b.name = 'AIKIM Standard'
  and not exists (
    select 1 from public.commitment_recognition_rules r
    where r.bank_id = b.id and r.rule_name = 'AIKIM Standard — Credit Card'
  );

insert into public.commitment_recognition_rules (
  bank_id, bank_product_id, rule_name, commitment_type,
  recognition_method, recognition_percentage, allows_to_be_settled_exclusion,
  description, is_active
)
select
  b.id, null, 'AIKIM Standard — Personal Loan', 'personal_loan',
  'full_instalment', null, true,
  'AIKIM Standard house-view default — not a specific real bank''s confirmed policy. Confidence basis: AIKIM house judgment call — structural, not a bank-specific figure: a personal loan is counted at its full stated monthly instalment, with no invented percentage.',
  true
from public.banks b
where b.name = 'AIKIM Standard'
  and not exists (
    select 1 from public.commitment_recognition_rules r
    where r.bank_id = b.id and r.rule_name = 'AIKIM Standard — Personal Loan'
  );

insert into public.commitment_recognition_rules (
  bank_id, bank_product_id, rule_name, commitment_type,
  recognition_method, recognition_percentage, allows_to_be_settled_exclusion,
  description, is_active
)
select
  b.id, null, 'AIKIM Standard — Hire Purchase', 'hire_purchase',
  'full_instalment', null, true,
  'AIKIM Standard house-view default — not a specific real bank''s confirmed policy. Confidence basis: AIKIM house judgment call — structural, same treatment as the Personal Loan rule: a hire purchase instalment is counted at its full stated monthly amount, with no invented percentage.',
  true
from public.banks b
where b.name = 'AIKIM Standard'
  and not exists (
    select 1 from public.commitment_recognition_rules r
    where r.bank_id = b.id and r.rule_name = 'AIKIM Standard — Hire Purchase'
  );

insert into public.commitment_recognition_rules (
  bank_id, bank_product_id, rule_name, commitment_type,
  recognition_method, recognition_percentage, allows_to_be_settled_exclusion,
  description, is_active
)
select
  b.id, null, 'AIKIM Standard — Existing Mortgage', 'existing_mortgage',
  'full_instalment', null, true,
  'AIKIM Standard house-view default — not a specific real bank''s confirmed policy. Confidence basis: AIKIM house judgment call — structural, same treatment as the Personal Loan and Hire Purchase rules: an existing mortgage instalment is counted at its full stated monthly amount, with no invented percentage.',
  true
from public.banks b
where b.name = 'AIKIM Standard'
  and not exists (
    select 1 from public.commitment_recognition_rules r
    where r.bank_id = b.id and r.rule_name = 'AIKIM Standard — Existing Mortgage'
  );

-- ----------------------------------------------------------------------------
-- 5. property_rules — 5 bank-wide (bank_product_id NULL) rules. See the
--    "KNOWN BLOCKING ISSUE" section above the file header — the 1st/2nd-
--    property and 3rd+-property rows below (both residential/completed/
--    owner_occupied) are identical on every column
--    property_rules_active_profile_version_idx checks, and differ only by
--    existing_property_count_min/max, which is not part of that index. The
--    1st/2nd-property row is expected to insert successfully; the 3rd+
--    row is expected to fail until that index is widened.
-- ----------------------------------------------------------------------------
insert into public.property_rules (
  bank_id, bank_product_id, rule_name,
  property_type, construction_status, occupancy_intent,
  existing_property_count_min, existing_property_count_max,
  margin_of_finance_percentage, max_tenure_years,
  description, is_active
)
select
  b.id, null, 'AIKIM Standard — Residential, Completed, Owner-Occupied, 1st/2nd Property',
  'residential', 'completed', 'owner_occupied',
  0, 1,
  90, 35,
  'AIKIM Standard house-view default — not a specific real bank''s confirmed policy. Mixed confidence basis: the 35-year maximum tenure is a verified regulatory convention (Bank Negara Malaysia''s stated 35-year maximum home loan tenure guideline); the 90% margin of finance is, separately, an AIKIM house judgment call reflecting standard market practice for a 1st/2nd housing loan, where no BNM cap applies at this tier.',
  true
from public.banks b
where b.name = 'AIKIM Standard'
  and not exists (
    select 1 from public.property_rules r
    where r.bank_id = b.id and r.rule_name = 'AIKIM Standard — Residential, Completed, Owner-Occupied, 1st/2nd Property'
  );

insert into public.property_rules (
  bank_id, bank_product_id, rule_name,
  property_type, construction_status, occupancy_intent,
  existing_property_count_min, existing_property_count_max,
  margin_of_finance_percentage, max_tenure_years,
  description, is_active
)
select
  b.id, null, 'AIKIM Standard — Residential, Completed, Owner-Occupied, 3rd+ Property',
  'residential', 'completed', 'owner_occupied',
  2, null,
  70, 35,
  'AIKIM Standard house-view default — not a specific real bank''s confirmed policy. Confidence basis: verified regulatory convention — both figures are BNM''s own published rules: the November 2010 measure capping margin of finance at 70% for the 3rd and subsequent outstanding housing loan, and BNM''s 35-year maximum tenure guideline. Known modeling simplification: BNM''s rule counts by outstanding housing loans recorded on CCRIS, not literally properties owned — existing_property_count is the closest available schema proxy, not an exact match.',
  true
from public.banks b
where b.name = 'AIKIM Standard'
  and not exists (
    select 1 from public.property_rules r
    where r.bank_id = b.id and r.rule_name = 'AIKIM Standard — Residential, Completed, Owner-Occupied, 3rd+ Property'
  );

insert into public.property_rules (
  bank_id, bank_product_id, rule_name,
  property_type, construction_status, occupancy_intent,
  existing_property_count_min, existing_property_count_max,
  margin_of_finance_percentage, max_tenure_years,
  description, is_active
)
select
  b.id, null, 'AIKIM Standard — Residential, Under Construction, Owner-Occupied, 1st/2nd Property',
  'residential', 'under_construction', 'owner_occupied',
  0, 1,
  90, 35,
  'AIKIM Standard house-view default — not a specific real bank''s confirmed policy. Confidence basis: AIKIM house judgment call, extrapolated from the completed-property 1st/2nd-property rule above — the margin-of-finance cap is a function of loan count, not construction status, though construction status typically affects the disbursement schedule (progressive drawdown), which this table does not separately model.',
  true
from public.banks b
where b.name = 'AIKIM Standard'
  and not exists (
    select 1 from public.property_rules r
    where r.bank_id = b.id and r.rule_name = 'AIKIM Standard — Residential, Under Construction, Owner-Occupied, 1st/2nd Property'
  );

insert into public.property_rules (
  bank_id, bank_product_id, rule_name,
  property_type, construction_status, occupancy_intent,
  existing_property_count_min, existing_property_count_max,
  margin_of_finance_percentage, max_tenure_years,
  description, is_active
)
select
  b.id, null, 'AIKIM Standard — Residential, Completed, Investment',
  'residential', 'completed', 'investment',
  null, null,
  80, 35,
  'AIKIM Standard house-view default — not a specific real bank''s confirmed policy. Confidence basis: AIKIM house judgment call — non-owner-occupied residential financing is commonly priced a notch below owner-occupied financing as a risk-management convention, not a BNM-mandated figure.',
  true
from public.banks b
where b.name = 'AIKIM Standard'
  and not exists (
    select 1 from public.property_rules r
    where r.bank_id = b.id and r.rule_name = 'AIKIM Standard — Residential, Completed, Investment'
  );

-- Commercial financing carve-out (ADR 0015 rule 3, extended beyond DSR):
-- margin_of_finance_percentage and max_tenure_years are deliberately left
-- NULL below. Do not populate them with a guessed number — see the
-- description text this row carries and ADR 0015 rule 3.
insert into public.property_rules (
  bank_id, bank_product_id, rule_name,
  property_type, construction_status, occupancy_intent,
  existing_property_count_min, existing_property_count_max,
  margin_of_finance_percentage, max_tenure_years,
  description, is_active
)
select
  b.id, null, 'AIKIM Standard — Commercial, Completed, Owner-Occupied',
  'commercial', 'completed', 'owner_occupied',
  null, null,
  null, null,
  'AIKIM Standard house-view default — not a specific real bank''s confirmed policy. Per ADR 0015 rule 3''s stricter carve-out, commercial financing margins vary widely by real bank (a commonly-cited range of 70-85%) with no single defensible AIKIM house convention, analogous to why dsr_rules bank-specific thresholds stay NULL. margin_of_finance_percentage and max_tenure_years are deliberately left NULL until a human supplies a real, bank-confirmed figure — do not populate these two columns with a guessed number.',
  true
from public.banks b
where b.name = 'AIKIM Standard'
  and not exists (
    select 1 from public.property_rules r
    where r.bank_id = b.id and r.rule_name = 'AIKIM Standard — Commercial, Completed, Owner-Occupied'
  );

-- ----------------------------------------------------------------------------
-- 6. dsr_rules — 3 bank-wide (bank_product_id NULL) rows, framework only.
--    max_dsr_percentage and stress_test_rate_buffer_percentage are NULL on
--    every row below, exactly per ADR 0015 rule 3 — non-negotiable, do not
--    populate them with any figure. See the "KNOWN BLOCKING ISSUE" section
--    above the file header — all 3 rows below are identical on every column
--    dsr_rules_active_profile_version_idx checks (that index does not
--    include income_tier_lower_bound/income_tier_upper_bound at all), so
--    only the first row is expected to insert successfully until that index
--    is widened.
-- ----------------------------------------------------------------------------
insert into public.dsr_rules (
  bank_id, bank_product_id, rule_name,
  max_dsr_percentage, stress_test_rate_buffer_percentage,
  income_tier_lower_bound, income_tier_upper_bound,
  description, is_active
)
select
  b.id, null, 'AIKIM Standard — DSR (Income < RM3,000)',
  null, null,
  null, 3000,
  'AIKIM Standard house-view default — not a specific real bank''s confirmed policy. Framework only: income-tier segmentation is a structural convention, not a bank-specific number. max_dsr_percentage and stress_test_rate_buffer_percentage remain NULL until a human supplies real, bank-confirmed figures; do not fill them with an invented or "plausible-looking" figure.',
  true
from public.banks b
where b.name = 'AIKIM Standard'
  and not exists (
    select 1 from public.dsr_rules r
    where r.bank_id = b.id and r.rule_name = 'AIKIM Standard — DSR (Income < RM3,000)'
  );

insert into public.dsr_rules (
  bank_id, bank_product_id, rule_name,
  max_dsr_percentage, stress_test_rate_buffer_percentage,
  income_tier_lower_bound, income_tier_upper_bound,
  description, is_active
)
select
  b.id, null, 'AIKIM Standard — DSR (Income RM3,000–RM10,000)',
  null, null,
  3000, 10000,
  'AIKIM Standard house-view default — not a specific real bank''s confirmed policy. Framework only: income-tier segmentation is a structural convention, not a bank-specific number. max_dsr_percentage and stress_test_rate_buffer_percentage remain NULL until a human supplies real, bank-confirmed figures; do not fill them with an invented or "plausible-looking" figure.',
  true
from public.banks b
where b.name = 'AIKIM Standard'
  and not exists (
    select 1 from public.dsr_rules r
    where r.bank_id = b.id and r.rule_name = 'AIKIM Standard — DSR (Income RM3,000–RM10,000)'
  );

insert into public.dsr_rules (
  bank_id, bank_product_id, rule_name,
  max_dsr_percentage, stress_test_rate_buffer_percentage,
  income_tier_lower_bound, income_tier_upper_bound,
  description, is_active
)
select
  b.id, null, 'AIKIM Standard — DSR (Income ≥ RM10,000)',
  null, null,
  10000, null,
  'AIKIM Standard house-view default — not a specific real bank''s confirmed policy. Framework only: income-tier segmentation is a structural convention, not a bank-specific number. max_dsr_percentage and stress_test_rate_buffer_percentage remain NULL until a human supplies real, bank-confirmed figures; do not fill them with an invented or "plausible-looking" figure.',
  true
from public.banks b
where b.name = 'AIKIM Standard'
  and not exists (
    select 1 from public.dsr_rules r
    where r.bank_id = b.id and r.rule_name = 'AIKIM Standard — DSR (Income ≥ RM10,000)'
  );

-- ============================================================================
-- End of AIKIM Standard Baseline Seed migration.
--
-- Re-read the "KNOWN BLOCKING ISSUE" section above the file header before
-- running this in the Supabase SQL Editor: 5 of the 18 rule-row INSERT
-- statements above (5 of 6 in Section 3, 1 of 5 in Section 5, 2 of 3 in
-- Section 6) are expected to fail against the current schema's partial
-- unique indexes, which is a pre-existing gap this migration discovered but
-- does not fix. banks, bank_products, and all of Section 4
-- (commitment_recognition_rules) are unaffected and expected to insert
-- cleanly. This file's WHERE NOT EXISTS guards make it safe to re-run after
-- a corrective index-widening migration is authored, reviewed, and run.
-- ============================================================================
