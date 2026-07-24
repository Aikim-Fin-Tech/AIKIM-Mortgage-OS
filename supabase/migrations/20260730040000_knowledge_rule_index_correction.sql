-- ============================================================================
-- AIKIM Mortgage OS — Knowledge Rule Index Correction
--
-- What this fixes: three pre-existing partial unique indexes
-- (income_recognition_rules_active_profile_version_idx,
-- dsr_rules_active_profile_version_idx,
-- property_rules_active_profile_version_idx) each omit a column that is
-- part of its own table's actual matching profile, per that table's own
-- design notes and COMMENT ON COLUMN text written when each table was first
-- created. This was discovered while authoring
-- supabase/migrations/20260731010000_aikim_standard_baseline_seed.sql (see
-- that file's "KNOWN BLOCKING ISSUE" section, and ADR
-- docs/decisions/0015-aikim-standard-baseline-seeding.md): that migration
-- inserts multiple AIKIM Standard rule rows per bank that are identical on
-- every column each index currently checks and differ ONLY on the column
-- each index is missing — so 5 of its 18 rule-row INSERTs fail with a
-- duplicate-key violation against the current, too-narrow indexes, even
-- though the rows are legitimately distinct rules.
--
-- This migration widens the three indexes to include the missing column(s),
-- exactly per the remediation
-- 20260731010000_aikim_standard_baseline_seed.sql's own header already
-- specifies. It does not touch the seed migration itself — that file's data
-- is correct as-is; its own WHERE NOT EXISTS guards make it safe to re-run
-- once these indexes are widened, and it will then insert all 18 rows
-- cleanly.
--
-- Why this is safe with zero data migration: widening a partial unique
-- index (adding a column to what it checks) can only ever make the
-- constraint LESS restrictive — a combination that was previously
-- disallowed under the narrower index may now be allowed, but nothing that
-- was previously allowed becomes disallowed. Per the established project
-- state, no rule data exists in the live database yet beyond, at most, a
-- single row per table (these Knowledge Base tables are still pre-seed as
-- of this migration; 20260731010000_aikim_standard_baseline_seed.sql is the
-- first attempt to populate them beyond that). Zero existing rows can
-- therefore violate the new, wider constraint, so no backfill, no
-- duplicate-cleanup step, and no data migration of any kind is required —
-- this is a pure index-shape correction.
--
-- Scope: this migration touches ONLY these 3 indexes. It does not create,
-- alter, or drop any table, column, RLS policy, function, or any other
-- database object, and it does not modify or depend on any change to
-- src/lib/income-knowledge/match-income-rule.ts or any other application
-- code. In particular, the income-matcher correctness gap (the matcher
-- itself does not currently consider income_source_type when selecting a
-- rule) is a separate, already-identified application-layer issue,
-- explicitly deferred by the CTO to a later, separately-scoped sprint
-- (Sprint 6.3E) — this migration fixes only the database-level
-- duplicate-key/idempotency problem blocking seeding, and must not be read
-- as having fixed, or attempted to fix, rule-matching correctness.
--
-- Idempotent: every index below is `drop index if exists` immediately
-- followed by `create unique index` — the same idiom this repo's own prior
-- migrations already use the first time each of these three indexes was
-- defined (20260726010000_income_knowledge_schema.sql,
-- 20260728010000_dsr_knowledge_schema.sql,
-- 20260729010000_property_rules_knowledge_schema.sql). Dropping a
-- nonexistent index via IF EXISTS is a no-op; index creation itself is not
-- separately wrapped in IF NOT EXISTS in those files either, so this
-- migration matches that established pattern exactly rather than inventing
-- a new one. Touches zero existing row data.
--
-- Must run BEFORE 20260731010000_aikim_standard_baseline_seed.sql — that
-- migration's timestamp (20260731010000) deliberately sorts after this
-- file's (20260730040000) so that running migrations in filename order
-- applies this correction first. Without this migration, 5 of that seed
-- migration's 18 INSERTs will fail with a duplicate-key violation, exactly
-- as documented in that file's own header.
--
-- Copy this entire file into the Supabase SQL Editor and run it once, after
-- 20260730030000_eligibility_engine_rpc.sql and before
-- 20260731010000_aikim_standard_baseline_seed.sql. NOT executed by this
-- session — pending human review and manual execution. No PostgREST-visible
-- function or view is added or changed by this migration, so no
-- `notify pgrst, 'reload schema';` is needed.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. income_recognition_rules_active_profile_version_idx
--    (originally defined in
--    supabase/migrations/20260726010000_income_knowledge_schema.sql)
--
--    income_source_type is added as a plain, unwrapped column reference —
--    it is `not null` on income_recognition_rules (same as bank_id, which
--    already appears unwrapped in this same index), so it needs no
--    coalesce() to be NULL-safe. Placed immediately after bank_product_id,
--    matching income_recognition_rules' own column order (income_source_type
--    is the first matching dimension declared on the table, right after
--    bank_id/bank_product_id/rule_name).
--
--    All other columns and their order are unchanged from the original
--    definition.
-- ----------------------------------------------------------------------------
drop index if exists public.income_recognition_rules_active_profile_version_idx;
create unique index income_recognition_rules_active_profile_version_idx on public.income_recognition_rules (
  bank_id,
  coalesce(bank_product_id::text, ''),
  income_source_type,
  coalesce(nationality, ''),
  coalesce(income_country, ''),
  coalesce(employment_type, ''),
  coalesce(income_structure, ''),
  version
)
where is_active;

-- ----------------------------------------------------------------------------
-- 2. dsr_rules_active_profile_version_idx
--    (originally defined in
--    supabase/migrations/20260728010000_dsr_knowledge_schema.sql)
--
--    income_tier_lower_bound / income_tier_upper_bound are added, each
--    wrapped in coalesce(..._bound::text, ''), matching this same index's
--    existing coalesce(bank_product_id::text, '') treatment — both are
--    nullable numeric columns. This does not change, and does not attempt
--    to solve, that migration's already-documented "accepted Phase 1 gap"
--    (this index still does not catch two active rules with OVERLAPPING
--    income-tier ranges for the same bank/product/version — an
--    EXCLUDE USING gist constraint would be required for that, and remains
--    explicitly out of scope here, same as it was there). This change only
--    lets legitimately DIFFERENT, non-overlapping tiers coexist, which the
--    prior index incorrectly blocked outright.
-- ----------------------------------------------------------------------------
drop index if exists public.dsr_rules_active_profile_version_idx;
create unique index dsr_rules_active_profile_version_idx on public.dsr_rules (
  bank_id,
  coalesce(bank_product_id::text, ''),
  coalesce(income_tier_lower_bound::text, ''),
  coalesce(income_tier_upper_bound::text, ''),
  version
)
where is_active;

-- ----------------------------------------------------------------------------
-- 3. property_rules_active_profile_version_idx
--    (originally defined in
--    supabase/migrations/20260729010000_property_rules_knowledge_schema.sql)
--
--    existing_property_count_min / existing_property_count_max are added,
--    each wrapped in coalesce(..._count_min::text, '') /
--    coalesce(..._count_max::text, ''), matching this same index's existing
--    coalesce(bank_product_id::text, '') treatment — both are nullable
--    integer columns. As with dsr_rules above, this does not change, and
--    does not attempt to solve, that migration's already-documented
--    "accepted Phase 1 gap" (this index still does not catch two active
--    rules with OVERLAPPING existing-property-count ranges for an otherwise
--    identical scope). This change only lets legitimately DIFFERENT,
--    non-overlapping count ranges coexist, which the prior index incorrectly
--    blocked outright.
-- ----------------------------------------------------------------------------
drop index if exists public.property_rules_active_profile_version_idx;
create unique index property_rules_active_profile_version_idx on public.property_rules (
  bank_id,
  coalesce(bank_product_id::text, ''),
  property_type,
  construction_status,
  occupancy_intent,
  coalesce(existing_property_count_min::text, ''),
  coalesce(existing_property_count_max::text, ''),
  version
)
where is_active;

-- ============================================================================
-- End of Knowledge Rule Index Correction migration.
--
-- After this migration is run, re-running (or, if not yet run, running for
-- the first time) 20260731010000_aikim_standard_baseline_seed.sql is
-- expected to insert all 18 of that migration's rule rows cleanly, per that
-- file's own "KNOWN BLOCKING ISSUE" section and WHERE NOT EXISTS guards.
-- ============================================================================
