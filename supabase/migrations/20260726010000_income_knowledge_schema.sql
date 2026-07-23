-- ============================================================================
-- AIKIM Mortgage OS — Sprint 6.3B-1: Income Knowledge (schema)
--
-- Scope: the first implemented slice of the CTO-approved Mortgage Knowledge
-- Database blueprint (docs/product/mortgage-knowledge-database-prd.md,
-- "follow exactly"). Five tables only, per that document's Section 11
-- dependency diagram:
--   banks, bank_products                    — Bank / Product Knowledge Layer
--   income_recognition_rules                — Derivation Knowledge (income)
--   evidence, derivation_results             — shared foundation every future
--                                              domain (Commitment Knowledge,
--                                              Property Rules, DSR Rules)
--                                              will also depend on
--
-- Deliberately NOT created here (future, separately-approved sprints):
--   commitment_recognition_rules, dsr_rules, property_rules,
--   eligibility_verdicts, eligibility_verdict_derivation_results,
--   ai_recommendations.
--
-- RLS is enabled on every table below (`enable row level security`) but no
-- policy is defined here by design — see the companion migration
-- 20260726020000_income_knowledge_rls.sql, run immediately after this one.
-- Until that second migration runs, every table below is RLS-enabled with
-- zero policies, i.e. inaccessible to anyone but the table owner — never
-- silently open.
--
-- Audit note: as with every prior migration in this repo, this session has
-- no live database connection and cannot verify the current schema. Every
-- statement below is written defensively (IF NOT EXISTS / additive-only) and
-- touches zero existing rows or tables.
--
-- Copy this entire file into the Supabase SQL Editor and run it once, after
-- all prior migrations. Idempotent: safe to re-run. Does not touch any
-- existing row data. NOT executed by this session — pending human review and
-- manual execution.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. banks — the structured replacement for today's unconstrained free-text
--    bank_name (loan_cases, bankers). Bank identity anchor for every
--    bank-scoped rule domain (DB PRD Section 3.2).
--
--    Standard Temporal Knowledge trio (is_active / effective_from /
--    effective_to), same shape mortgage_rules already ships. No `version`
--    column here — a bank is an entity being deactivated, not a policy value
--    being revised (DB PRD Section 5).
-- ----------------------------------------------------------------------------
create table if not exists public.banks (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  short_code text,
  is_active boolean not null default true,
  effective_from date,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.banks is
  'Bank identity anchor (Bank Knowledge Layer). Deactivate-only, no DELETE policy (see companion RLS migration) — a case evaluated against a now-deactivated bank must stay explainable.';

alter table public.banks enable row level security;

-- ----------------------------------------------------------------------------
-- 2. bank_products — a specific mortgage product offered by a bank. The unit
--    the (future) Eligibility Engine evaluates a case against, per the
--    architecture doc's Product Knowledge Layer (DB PRD Section 3.3).
-- ----------------------------------------------------------------------------
create table if not exists public.bank_products (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid not null references public.banks(id),
  product_name text not null,
  product_code text,
  financing_structure text,
  is_active boolean not null default true,
  effective_from date,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.bank_products is
  'A specific mortgage product belonging to exactly one bank. No real product names/terms are seeded — see supabase/seeds/20260726010000_income_knowledge_seed.sql.';
comment on column public.bank_products.financing_structure is
  'Open vocabulary (e.g. conventional/Islamic). No real classification scheme asserted by this migration.';

create index if not exists bank_products_bank_id_idx on public.bank_products(bank_id);

alter table public.bank_products enable row level security;

-- ----------------------------------------------------------------------------
-- 3. income_recognition_rules — converts a raw income Evidence fact into a
--    recognized figure usable by DSR, scoped to a bank (and optionally
--    overridden per product) and to a borrower-profile combination
--    (DB PRD Section 3.4).
--
--    Reuses the exact four wildcard-if-null borrower-profile matching
--    columns (nationality, income_country, employment_type,
--    income_structure) and the exact wildcard/most-specific-wins convention
--    mortgage_rules already established (20260722010000_mortgage_rules_engine.sql)
--    — no new matching vocabulary is invented. bank_product_id is the same
--    kind of nullable-is-wildcard column: null = this bank's default
--    treatment, a specific value overrides it for that product only.
--
--    recognition_method is constrained to the three treatment shapes the
--    PRD named (full_value | percentage_haircut | rolling_average) — same
--    "TypeScript vocabulary is the source of truth, this CHECK just guards
--    against typos at the data layer" posture as
--    document_types.ocr_kind (20260724010000_ocr_document_extraction.sql).
--    No haircut percentage, averaging window, or minimum-history figure is
--    seeded as if it were confirmed bank policy anywhere in this migration.
--
--    Same wildcard-matching shape as mortgage_rules also means it needs the
--    same two integrity guards mortgage_rules shipped for that shape
--    (20260723010000_mortgage_rule_admin.sql) — added here, in Phase 1,
--    rather than deferred to a later Phase 2 migration, because `version`
--    (the column that makes the second guard meaningful) already exists on
--    this table from day one, unlike mortgage_rules where `version` only
--    arrived in its own Phase 2.
-- ----------------------------------------------------------------------------
create table if not exists public.income_recognition_rules (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid not null references public.banks(id),
  bank_product_id uuid references public.bank_products(id),
  rule_name text not null,
  income_source_type text not null,
  nationality text,
  income_country text,
  employment_type text,
  income_structure text,
  recognition_method text not null,
  haircut_percentage numeric,
  averaging_window_months integer,
  minimum_history_months integer,
  description text,
  version integer not null default 1,
  is_active boolean not null default true,
  effective_from date,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'income_recognition_rules_method_valid'
  ) then
    alter table public.income_recognition_rules
      add constraint income_recognition_rules_method_valid
      check (recognition_method in ('full_value', 'percentage_haircut', 'rolling_average'));
  end if;
end $$;

-- Defensive: the wildcard convention is NULL, never ''. An empty string would
-- silently defeat both a future matcher (mirroring
-- src/lib/mortgage-rules/match-rule.ts, which treats only NULL as wildcard)
-- and the uniqueness index below (which normalizes NULL, not '', for
-- comparison). Same guard as mortgage_rules_no_empty_string_wildcards
-- (20260723010000_mortgage_rule_admin.sql), applied to the same 4 columns.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'income_recognition_rules_no_empty_string_wildcards'
  ) then
    alter table public.income_recognition_rules
      add constraint income_recognition_rules_no_empty_string_wildcards
      check (
        (nationality is null or nationality <> '') and
        (income_country is null or income_country <> '') and
        (employment_type is null or employment_type <> '') and
        (income_structure is null or income_structure <> '')
      );
  end if;
end $$;

-- Prevent duplicate *active* rules sharing the same bank/product scope +
-- matching profile + version — same purpose as
-- mortgage_rules_active_profile_version_idx (20260723010000_mortgage_rule_admin.sql),
-- scoped one level further by bank_id/bank_product_id since here the
-- profile alone isn't unique, only unique *within* a bank/product scope.
-- NULL-safe (wildcard) comparison via coalesce; scoped to active rows only
-- so historical/deactivated versions of the same combination may coexist.
drop index if exists public.income_recognition_rules_active_profile_version_idx;
create unique index income_recognition_rules_active_profile_version_idx on public.income_recognition_rules (
  bank_id,
  coalesce(bank_product_id::text, ''),
  coalesce(nationality, ''),
  coalesce(income_country, ''),
  coalesce(employment_type, ''),
  coalesce(income_structure, ''),
  version
)
where is_active;

comment on column public.income_recognition_rules.haircut_percentage is
  'Only meaningful when recognition_method = percentage_haircut. No real percentage is seeded by this migration — requires real bank policy input.';
comment on column public.income_recognition_rules.averaging_window_months is
  'Only meaningful when recognition_method = rolling_average.';
comment on column public.income_recognition_rules.version is
  'Same purpose as mortgage_rules.version: increments when a rule''s matching profile changes after it has been used, so historical derivation_results references stay interpretable.';

create index if not exists income_recognition_rules_bank_id_idx on public.income_recognition_rules(bank_id);
create index if not exists income_recognition_rules_bank_product_id_idx on public.income_recognition_rules(bank_product_id);

alter table public.income_recognition_rules enable row level security;

-- ----------------------------------------------------------------------------
-- 4. evidence — a normalized fact record, decoupled from its origin. The
--    shared shape every Derivation Knowledge rule (Income Recognition today;
--    Commitment Recognition, Property Rules in future sprints) evaluates,
--    regardless of whether the fact came from OCR, manual entry, customer
--    self-declaration, or a future source (DB PRD Section 3.1, architecture
--    doc Section 4).
--
--    Append-only: a correction is always a new row (superseded_by_evidence_id
--    points forward), never an edit — see companion RLS migration for the
--    enforced no-UPDATE/no-DELETE posture.
-- ----------------------------------------------------------------------------
create table if not exists public.evidence (
  id uuid primary key default gen_random_uuid(),
  loan_case_id uuid not null references public.loan_cases(id) on delete cascade,
  evidence_type text not null,
  value jsonb not null,
  source_type text not null,
  source_document_id uuid references public.documents(id),
  source_extraction_id uuid references public.document_extractions(id),
  source_note text,
  captured_by_user_id uuid references public.user_profiles(id),
  captured_at timestamptz not null default now(),
  superseded_by_evidence_id uuid references public.evidence(id)
);

comment on column public.evidence.evidence_type is
  'Open vocabulary (e.g. "recognized_raw_income", "existing_commitment_instalment"), maintained by application-layer convention, not a database enum — same posture as loan_cases.income_structure. A new evidence type never requires a migration.';
comment on column public.evidence.source_type is
  'Where this fact came from: "ocr" | "manual_entry" | "customer_declaration", or a future value (e.g. a future credit-bureau integration). Open vocabulary for the same reason as evidence_type — a new origin is a new value, never a schema change.';
comment on column public.evidence.value is
  'The normalized fact itself, already shaped for what a Derivation Knowledge rule needs — not a raw provider payload.';
comment on column public.evidence.superseded_by_evidence_id is
  'If a later fact corrects this one (e.g. a re-OCR), points at the newer row. The corrected row is never edited or removed.';

create index if not exists evidence_loan_case_id_idx on public.evidence(loan_case_id);

alter table public.evidence enable row level security;

-- ----------------------------------------------------------------------------
-- 5. derivation_results — an append-only, computation-time snapshot of a
--    single derivation output for a specific case and Bank Product, together
--    with a reference to the exact rule row and version that produced it
--    (DB PRD Section 3.8). One shared table across all four Derivation/
--    Computation domains (income_recognition, commitment_recognition,
--    property_rules, dsr) rather than four near-identical result tables —
--    this is the shared foundation every future domain rollout reuses.
--    Only income_recognition_rules exists as of this migration; the other
--    three domain values are accepted by the `domain` check now so this
--    table does not need to be re-shaped when those rule tables are built.
--
--    ---------------------------------------------------------------------
--    Design note: resolving derivation_results.rule_id (DB PRD Section 3.8,
--    explicitly flagged as an open design note, not decided there).
--
--    rule_id conceptually points at whichever rule row (in
--    income_recognition_rules, commitment_recognition_rules, dsr_rules, or
--    property_rules, per `domain`) produced this result. Postgres cannot
--    express one FOREIGN KEY constraint pointing at four different tables,
--    and three of those four tables (commitment_recognition_rules,
--    dsr_rules, property_rules) do not exist yet — out of scope for this
--    sprint. The DB PRD named two options: (a) four nullable
--    domain-specific reference columns, one populated depending on
--    `domain`, or (b) an app-validated reference with no enforced FK
--    constraint.
--
--    This migration takes option (b): `rule_id` is a plain `uuid`, NOT NULL,
--    with no FOREIGN KEY constraint. Validating that `rule_id` actually
--    exists in the table `domain` says it does is an application-layer
--    responsibility, matching this table to `domain`, mirroring
--    ADR 0006's precedent exactly: mortgage_rules' matching logic already
--    lives in TypeScript, not SQL, because rule-matching/derivation logic
--    is expected to keep evolving (OCR, DSR, eligibility) in ways a
--    database constraint can't accommodate without a rewrite. Option (a)
--    would also force this migration to create three stub tables
--    (commitment_recognition_rules, dsr_rules, property_rules) purely to
--    have something for the FK to reference — inventing schema for
--    explicitly out-of-scope domains, which this migration's brief
--    forbids. Option (b) lets `derivation_results` exist today, scoped
--    only to the one live domain (income_recognition), and needs zero
--    schema change when the other three rule tables are added in later
--    sprints — the column shape is already correct for all four domains.
--    ---------------------------------------------------------------------
-- ----------------------------------------------------------------------------
create table if not exists public.derivation_results (
  id uuid primary key default gen_random_uuid(),
  loan_case_id uuid not null references public.loan_cases(id) on delete cascade,
  bank_product_id uuid not null references public.bank_products(id),
  domain text not null,
  rule_id uuid not null,
  rule_version integer not null,
  input_evidence_ids jsonb not null default '[]'::jsonb,
  result_value jsonb not null,
  computed_at timestamptz not null default now(),
  computed_by_user_id uuid references public.user_profiles(id)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'derivation_results_domain_valid'
  ) then
    alter table public.derivation_results
      add constraint derivation_results_domain_valid
      check (domain in ('income_recognition', 'commitment_recognition', 'property_rules', 'dsr'));
  end if;
end $$;

comment on column public.derivation_results.rule_id is
  'Polymorphic reference: the row in income_recognition_rules / commitment_recognition_rules / dsr_rules / property_rules (per domain) that produced this result. Deliberately NOT a foreign key — see the design note above this table''s CREATE TABLE statement. Validated at the application layer against `domain`, same discipline as ADR 0006 (mortgage_rules matching lives in TypeScript, not SQL).';
comment on column public.derivation_results.rule_version is
  'A snapshot copy of the matched rule''s `version` at computation time, kept redundantly so the reasoning chain stays reconstructable even without a join.';
comment on column public.derivation_results.input_evidence_ids is
  'jsonb array of public.evidence.id values this result was computed from. A jsonb array, not a separate join table — kept in this one shared table per the DB PRD''s "one shared shape" discipline; a dedicated join table is out of scope for this sprint''s 5-table slice.';
comment on column public.derivation_results.computed_by_user_id is
  'Nullable because a system recomputation may have no acting user.';

create index if not exists derivation_results_loan_case_id_idx on public.derivation_results(loan_case_id);
create index if not exists derivation_results_bank_product_id_idx on public.derivation_results(bank_product_id);

alter table public.derivation_results enable row level security;

-- ============================================================================
-- End of Sprint 6.3B-1 Income Knowledge schema migration.
-- RLS policies for these 5 tables are in the companion migration:
-- 20260726020000_income_knowledge_rls.sql — run that immediately after this
-- file, otherwise every table above is enabled-RLS-with-zero-policies
-- (inaccessible to everyone but the table owner).
-- ============================================================================
