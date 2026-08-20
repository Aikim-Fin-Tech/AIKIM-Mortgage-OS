-- ============================================================================
-- AIKIM Mortgage OS — Banker Pilot: Record Rule Activation
--
-- Scope: activates exactly the one Banker pilot mortgage_rules row created by
-- 20260820010000_banker_pilot_document_checklist_seed.sql (Malaysian /
-- Malaysia / Salaried / Fixed, version 1) — no other row, no other column.
--
-- Why this is a separate file, not an edit to the seed migration: the seed
-- migration deliberately inserted this row with is_active = false, so a
-- super_admin could review it in the Rule Admin UI before it could affect any
-- real case (see that file's header). Production was subsequently activated
-- by a human directly through that UI, not through a migration — so a fresh
-- environment that only runs the committed migration files would recreate
-- the row as inactive and silently diverge from production's actual state.
-- This file closes that reproducibility gap by recording the activation
-- decision itself as a migration, without touching the already-authored seed
-- file (this repo's migration policy: an executed file is never edited in
-- place, every change is a new file — see the precedent in
-- 20260803010000_document_types_ocr_kind_tagging.sql's header).
--
-- Does not create, reference, or depend on any match_mortgage_rule RPC — the
-- matching algorithm remains TypeScript-only (docs/decisions/0006-mortgage-
-- rules-engine.md); this file only flips one existing row's is_active flag.
--
-- Idempotent and fail-loud, matching this repository's established
-- migration conventions (see 20260803010000_document_types_ocr_kind_
-- tagging.sql): counts the target row first rather than guessing.
--   - count = 0 -> raise exception. The pilot rule must already exist (from
--     20260820010000) before this file can run; it never creates one.
--   - count = 1 -> update is_active = true, guarded with `and is_active is
--     distinct from true` (null-safe) so a second run — or running this
--     against a row a human already activated by hand — changes zero rows
--     and updates nothing, including updated_at.
--   - count > 1 -> raise exception naming the exact count, refusing to guess
--     which row to activate. mortgage_rules' own Phase 1 plain unique
--     constraint on (nationality, income_country, employment_type,
--     income_structure) — see 20260722010000_mortgage_rules_engine.sql —
--     should make this unreachable for a fully-specified, non-wildcard
--     profile like this one, but the check is kept anyway, consistent with
--     this repo's established defense-in-depth posture (belt-and-suspenders
--     over trusting a constraint alone) rather than assuming the row is
--     unique from this file's own logic.
--
-- version = 1 is included in the match, not just the 4 profile columns —
-- this rule's version is not expected to change, but scoping the match
-- exactly the way the seed migration created the row (rather than "the
-- newest version of this profile") avoids ever silently activating a future,
-- different version of this same profile that this file was never reviewed
-- against.
--
-- Transactional: wrapped in an explicit begin;/commit; — the same pattern as
-- every other migration in this repository. A failure (including the
-- raise exception branches above) aborts the whole transaction; issuing
-- commit; on an aborted transaction is a no-op (Postgres reports ROLLBACK).
--
-- No RLS policy or function is added or changed here — mortgage_rules
-- already has an update policy scoped to super_admin
-- (20260723010000_mortgage_rule_admin.sql); this migration runs via the
-- Supabase SQL Editor (superuser/service context), the same posture every
-- other migration in this repository relies on, so it is not blocked by
-- that policy either way.
--
-- Copy this entire file into the Supabase SQL Editor and run it once, after
-- 20260820010000_banker_pilot_document_checklist_seed.sql. Idempotent: safe
-- to re-run, and safe to run even though production has already been
-- activated by hand — it will find is_active already true and change
-- nothing. NOT executed by this session — pending human review and manual
-- execution.
-- ============================================================================

begin;

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.mortgage_rules
    where nationality = 'Malaysian'
      and income_country = 'Malaysia'
      and employment_type = 'Salaried'
      and income_structure = 'Fixed'
      and version = 1;

  if v_count = 0 then
    raise exception 'activate_banker_pilot_rule: target mortgage_rules row (Malaysian / Malaysia / Salaried / Fixed, version 1) not found — run 20260820010000_banker_pilot_document_checklist_seed.sql first.';
  elsif v_count > 1 then
    raise exception 'activate_banker_pilot_rule: % rows matched the exact pilot profile (Malaysian / Malaysia / Salaried / Fixed, version 1) — refusing to activate ambiguously, resolve duplicates first.', v_count;
  end if;
end $$;

update public.mortgage_rules
  set is_active = true, updated_at = now()
  where nationality = 'Malaysian'
    and income_country = 'Malaysia'
    and employment_type = 'Salaried'
    and income_structure = 'Fixed'
    and version = 1
    and is_active is distinct from true;

commit;

-- ============================================================================
-- Rollback (NOT executed by this migration — documented for a human to run
-- manually if this needs to be reverted). Deactivating is always safe —
-- mortgage_rules has no DELETE policy and this file never deletes anything;
-- the row itself is untouched by a rollback of just this activation:
--
--   update public.mortgage_rules set is_active = false
--     where nationality = 'Malaysian' and income_country = 'Malaysia'
--       and employment_type = 'Salaried' and income_structure = 'Fixed'
--       and version = 1;
-- ============================================================================

-- ============================================================================
-- Verification (NOT executed by this migration — for a human to run manually
-- after applying the migration above):
--
--   select rule_name, is_active, version, updated_at
--   from public.mortgage_rules
--   where nationality = 'Malaysian' and income_country = 'Malaysia'
--     and employment_type = 'Salaried' and income_structure = 'Fixed'
--     and version = 1;
--
-- Expected result: exactly 1 row, is_active = true.
-- ============================================================================
