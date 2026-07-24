-- ============================================================================
-- AIKIM Mortgage OS — Sprint 6.3B-4: Property Rules Knowledge (schema)
--
-- Scope: exactly ONE new table, per the CTO-approved Mortgage Knowledge
-- Database blueprint (docs/product/mortgage-knowledge-database-prd.md
-- Section 3.7, "follow exactly") and the CTO's Sprint 6.3B-4 authorization
-- ("Property Rules Knowledge Implementation", same discipline as Sprint
-- 6.3B-1 Income, 6.3B-2 Commitment, and 6.3B-3 DSR):
--   property_rules                           — Derivation Knowledge
--                                               (property)
--
-- banks, bank_products, evidence, and derivation_results already exist
-- (Sprint 6.3B-1, 20260726010000_income_knowledge_schema.sql) and are NOT
-- touched, recreated, or altered by this migration. derivation_results'
-- `domain` CHECK constraint already accepts 'property_rules' as of that
-- migration — no change to derivation_results is needed here.
--
-- Deliberately NOT created here (future, separately-approved sprints):
--   eligibility_verdicts, eligibility_verdict_derivation_results,
--   ai_recommendations.
--
-- Shape note — this table deliberately combines both patterns seen in the
-- three prior rule tables, rather than matching either one exactly (read
-- this before assuming symmetry with any single prior table — see ADR
-- 0010/0011/0012 for those tables' precedents, and DB PRD Section 3.7 vs
-- 3.4/3.5/3.6 for why this one differs from all three):
--
--   1. property_type / construction_status / occupancy_intent — THREE
--      required, exact-match text dimensions, same treatment as
--      commitment_recognition_rules.commitment_type
--      (20260727010000_commitment_knowledge_schema.sql): open text, NOT
--      CHECK-constrained. See the design note immediately below the CREATE
--      TABLE statement for why.
--
--   2. existing_property_count_min / existing_property_count_max — a
--      numeric-range matching dimension, like dsr_rules'
--      income_tier_lower_bound / income_tier_upper_bound
--      (20260728010000_dsr_knowledge_schema.sql) — but a DELIBERATELY
--      DIFFERENT bound convention (inclusive-inclusive, not half-open). See
--      the design note further below for the full reasoning.
--
-- RLS is enabled below (`enable row level security`) but no policy is
-- defined here by design — see the companion migration
-- 20260729020000_property_rules_knowledge_rls.sql, run immediately after
-- this one. Until that second migration runs, this table is RLS-enabled
-- with zero policies, i.e. inaccessible to anyone but the table owner —
-- never silently open.
--
-- Audit note: as with every prior migration in this repo, this session has
-- no live database connection and cannot verify the current schema. Every
-- statement below is written defensively (IF NOT EXISTS / additive-only) and
-- touches zero existing rows or tables.
--
-- Copy this entire file into the Supabase SQL Editor and run it once, after
-- all prior migrations (including Income, Commitment, and DSR Knowledge's
-- migrations). Idempotent: safe to re-run. Does not touch any existing row
-- data. NOT executed by this session — pending human review and manual
-- execution.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. property_rules — margin-of-finance, tenure, and eligibility constraints
--    that vary by the property being financed, per bank/product (DB PRD
--    Section 3.7).
--
--    Reuses the same bank_id (required, exact) / bank_product_id (nullable,
--    wildcard, most-specific-wins) scoping every other rule table uses —
--    the same algorithm src/lib/mortgage-rules/match-rule.ts,
--    src/lib/income-knowledge/match-income-rule.ts,
--    src/lib/commitment-knowledge/match-commitment-rule.ts, and
--    src/lib/dsr-knowledge/match-dsr-rule.ts already implement, to be
--    extended by a future src/lib/property-rules-knowledge/match-property-rule.ts
--    (not part of this migration; schema only).
--
--    ---------------------------------------------------------------------
--    Design note 1: why no CHECK constraint on property_type,
--    construction_status, or occupancy_intent, even though all three are
--    required (NOT NULL, never a wildcard).
--
--    This follows commitment_recognition_rules.commitment_type's precedent
--    exactly (20260727010000_commitment_knowledge_schema.sql), not
--    income_recognition_rules.recognition_method's (which IS
--    CHECK-constrained). recognition_method got a CHECK constraint because
--    the DB PRD names it as a definitively closed set of three mechanically
--    distinct treatment shapes. DB PRD Section 3.7 instead lists
--    property_type ("Residential, commercial, land, other"),
--    construction_status ("Completed vs. under construction/progressive
--    drawdown"), and occupancy_intent ("Owner-occupied vs. investment") the
--    same way it listed commitment_type — a domain-classification list,
--    illustrative of the shape a real bank's policy takes, not a
--    mechanically closed set the way recognition_method's three treatment
--    methods are. All three end up open text, maintained by
--    application-layer convention, same posture as
--    commitment_recognition_rules.commitment_type and
--    income_recognition_rules.income_source_type — a new property type, a
--    new construction-status value (e.g. a bank later distinguishing
--    "progressive_drawdown" from a plain "under_construction"), or a new
--    occupancy classification never requires a migration.
--
--    All three are still required (NOT NULL) — DB PRD Section 3.7 does not
--    describe any of the three as ever wildcardable; a property_rules row
--    with no property_type, construction_status, or occupancy_intent
--    opinion would not be a meaningful rule.
--    ---------------------------------------------------------------------
-- ----------------------------------------------------------------------------
create table if not exists public.property_rules (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid not null references public.banks(id),
  bank_product_id uuid references public.bank_products(id),
  rule_name text not null,
  property_type text not null,
  construction_status text not null,
  occupancy_intent text not null,
  existing_property_count_min integer,
  existing_property_count_max integer,
  margin_of_finance_percentage numeric,
  max_tenure_years integer,
  description text,
  version integer not null default 1,
  is_active boolean not null default true,
  effective_from date,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.property_rules is
  'Margin-of-finance, tenure, and eligibility constraints that vary by the property being financed, per bank/product (DB PRD Section 3.7). Matching is bank_id (required) + bank_product_id (nullable wildcard) + three required exact-match text dimensions (property_type, construction_status, occupancy_intent) + an optional INCLUSIVE-INCLUSIVE numeric range (existing_property_count_min/max) — see the design notes above this table''s CREATE TABLE statement, and existing_property_count_min''s comment, for why this range uses different bound semantics from dsr_rules'' half-open income-tier range. Deactivate-only, no DELETE policy (see companion RLS migration).';
comment on column public.property_rules.property_type is
  'Required, exact match (never a wildcard) — e.g. residential, commercial, land, other. Open vocabulary maintained by application-layer convention, not a database enum — same posture as commitment_recognition_rules.commitment_type. A new property type never requires a migration.';
comment on column public.property_rules.construction_status is
  'Required, exact match (never a wildcard) — e.g. completed, under_construction/progressive_drawdown. Open vocabulary, not a database enum — same posture as property_type above. A new construction-status value never requires a migration.';
comment on column public.property_rules.occupancy_intent is
  'Required, exact match (never a wildcard) — e.g. owner_occupied, investment. Open vocabulary, not a database enum — same posture as property_type/construction_status above. A new occupancy classification never requires a migration.';
comment on column public.property_rules.margin_of_finance_percentage is
  'Not populated with a real figure by this migration — requires real bank policy input, same posture as dsr_rules.max_dsr_percentage.';
comment on column public.property_rules.max_tenure_years is
  'Not populated with a real figure by this migration — requires real bank policy input.';
comment on column public.property_rules.version is
  'Same purpose as income_recognition_rules.version / commitment_recognition_rules.version / dsr_rules.version / mortgage_rules.version: increments when a rule''s matching profile changes after it has been used, so historical derivation_results references stay interpretable.';

-- ----------------------------------------------------------------------------
-- Design note 2: existing_property_count_min / existing_property_count_max
-- are a NUMERIC RANGE matching dimension, like dsr_rules'
-- income_tier_lower_bound / income_tier_upper_bound — but with
-- DELIBERATELY DIFFERENT bound semantics. Read this before assuming the two
-- range-typed rule tables in this Knowledge Base share one convention; they
-- do not.
--
-- dsr_rules' income-tier bounds are a HALF-OPEN range:
--   (lower IS NULL OR income >= lower) AND (upper IS NULL OR income < upper)
-- appropriate for a CONTINUOUS DECIMAL value (recognized income) — a
-- half-open partition (e.g. [0, 5000), [5000, 10000), ...) is the standard
-- way to tile a continuous range into non-overlapping tiers without a
-- boundary value belonging to two tiers at once.
--
-- existing_property_count_min / existing_property_count_max instead
-- describe a DISCRETE INTEGER COUNT (how many properties the borrower
-- already has financed) and use an INCLUSIVE-INCLUSIVE range instead:
--   (existing_property_count_min IS NULL OR count >= existing_property_count_min)
--   AND (existing_property_count_max IS NULL OR count <= existing_property_count_max)
-- A discrete count has no "boundary value shared between two tiers"
-- problem a half-open range exists to solve — a rule for "0 to 1 existing
-- properties" and a rule for "2 to 3 existing properties" tile the integer
-- line exactly with both bounds inclusive; there is no fractional count
-- that could fall ambiguously between them the way a continuous income
-- figure could sit exactly on a half-open tier boundary. Using a half-open
-- convention here (upper bound exclusive) would force an off-by-one
-- authoring habit for every property_rules row (writing max=4 to mean "up
-- to and including 3") that has no counterpart in how DB PRD Section 3.7
-- describes this column ("the range of the borrower's existing
-- financed-property count this rule applies to") — inclusive-inclusive is
-- the natural reading of a count range, half-open is not.
--
-- A future src/lib/property-rules-knowledge/match-property-rule.ts must
-- implement the inclusive-inclusive comparison above, not reuse
-- src/lib/dsr-knowledge/match-dsr-rule.ts's half-open range-matching helper
-- as-is. This is schema-only intent recorded here for that future
-- TypeScript task — no matching logic is implemented by this migration.
-- ----------------------------------------------------------------------------
comment on column public.property_rules.existing_property_count_min is
  'INCLUSIVE lower bound of a discrete integer count range — NOT dsr_rules.income_tier_lower_bound''s half-open convention. A rule matches a given existing-financed-property count when (existing_property_count_min IS NULL OR count >= existing_property_count_min). NULL means no restriction on this side. Deliberately inclusive-inclusive (not half-open) because this is a discrete integer count, not a continuous decimal value — see the design note above this column for the full reasoning distinguishing it from dsr_rules'' bound semantics.';
comment on column public.property_rules.existing_property_count_max is
  'INCLUSIVE upper bound: a rule matches when (existing_property_count_max IS NULL OR count <= existing_property_count_max). NULL means no restriction on this side. See existing_property_count_min''s comment for the full inclusive-inclusive-vs-half-open reasoning — the two columns together define an inclusive integer range, not a half-open one.';

-- Prevent duplicate *active* rules sharing the same bank/product scope +
-- exact-match profile + version. Same purpose as
-- income_recognition_rules_active_profile_version_idx /
-- commitment_recognition_rules_active_profile_version_idx /
-- dsr_rules_active_profile_version_idx, scoped to THIS table's actual exact-
-- match dimensions: bank_id, bank_product_id, property_type,
-- construction_status, occupancy_intent, version. bank_product_id is
-- NULL-safe (wildcard) via coalesce, same convention as every other rule
-- table's index; property_type/construction_status/occupancy_intent are all
-- required (never NULL) so they need no coalesce. Scoped to active rows
-- only so historical/deactivated versions of the same combination may
-- coexist.
--
-- Accepted Phase 1 gap, explicitly NOT solved here — same shape as
-- dsr_rules' accepted gap: this index does NOT catch two active rules
-- sharing an identical bank/product/property_type/construction_status/
-- occupancy_intent/version but with OVERLAPPING existing-property-count
-- ranges — e.g. one rule for [0, 1] and another for [1, 3] could both be
-- active simultaneously, and a borrower with 1 existing property would
-- technically match both. Postgres unique indexes cannot express a
-- range-overlap exclusion constraint over these two nullable columns
-- without a dedicated `EXCLUDE USING gist` constraint (a materially
-- different mechanism than every other rule table's btree unique index),
-- and this migration's brief scopes count-range-overlap prevention out —
-- not attempted here. This mirrors the exact same accepted-gap precedent
-- already documented for dsr_rules
-- (20260728010000_dsr_knowledge_schema.sql) and, before that, for
-- mortgage_rules in Sprint 6.2 Phase 1
-- (20260722010000_mortgage_rules_engine.sql: "Postgres treats NULL as
-- always-distinct in a unique index, so this constraint does not catch two
-- fully-identical wildcard rules; rule data is human-curated and
-- low-volume, so this is an accepted gap for now, not a blocking issue.").
-- Same reasoning applies here: property rule data is human-curated and
-- low-volume, so existing-property-count-range overlap prevention is an
-- accepted gap for now, not a blocking issue.
drop index if exists public.property_rules_active_profile_version_idx;
create unique index property_rules_active_profile_version_idx on public.property_rules (
  bank_id,
  coalesce(bank_product_id::text, ''),
  property_type,
  construction_status,
  occupancy_intent,
  version
)
where is_active;

create index if not exists property_rules_bank_id_idx on public.property_rules(bank_id);
create index if not exists property_rules_bank_product_id_idx on public.property_rules(bank_product_id);

alter table public.property_rules enable row level security;

-- ============================================================================
-- End of Sprint 6.3B-4 Property Rules Knowledge schema migration.
-- RLS policy for this table is in the companion migration:
-- 20260729020000_property_rules_knowledge_rls.sql — run that immediately
-- after this file, otherwise the table above is enabled-RLS-with-zero-
-- policies (inaccessible to everyone but the table owner).
--
-- derivation_results.domain already accepts 'property_rules' as of
-- 20260726010000_income_knowledge_schema.sql — no change needed there.
-- derivation_results.rule_id remains the app-validated, non-FK polymorphic
-- reference documented in that migration; a property_rules-domain
-- derivation_results row's rule_id now has a real target table
-- (property_rules) to be validated against in application code, same
-- discipline as income_recognition, commitment_recognition, and dsr today.
-- ============================================================================
