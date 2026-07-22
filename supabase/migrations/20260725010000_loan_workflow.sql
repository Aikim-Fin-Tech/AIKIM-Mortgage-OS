-- ============================================================================
-- AIKIM Mortgage OS — MVP Sprint Day 2: Complete Loan Processing Workflow
--
-- Scope: expand loan_status to the full pipeline vocabulary, and add an
-- append-only case timeline table. Checklist progress, the Next Action
-- Card, and the Loan Health Score are all computed live in TypeScript from
-- data that already exists (or is added here) — no new columns needed for
-- those three.
--
-- Audit note: as with every prior migration, no live schema access was
-- available this session. Every change below is written as safely as
-- Postgres allows for an enum alteration — see the loan_status section for
-- specifics on what's additive/renaming vs. what's deliberately NOT touched
-- (on_hold). Verify against the live schema before running.
--
-- Copy this entire file into the Supabase SQL Editor and run it once, after
-- all prior migrations. Does not touch any existing row data.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. loan_status — expand to the full pipeline vocabulary.
--
-- Existing values: under_review | documents_pending | submitted | approved |
--                   rejected | on_hold
-- Target values:    new | waiting_document | under_review | ready_to_submit |
--                   submitted | approved | rejected
--
-- - `under_review`, `submitted`, `approved`, `rejected` are unchanged.
-- - `documents_pending` is renamed to `waiting_document` (same meaning, new
--   name) — ALTER TYPE ... RENAME VALUE preserves every existing row's
--   status, nothing is re-written.
-- - `new` and `ready_to_submit` are new values, added to the type.
-- - `on_hold` is deliberately NOT removed. Postgres has no cheap way to drop
--   an enum value (it would require rebuilding the type and everything that
--   depends on it), and this session has no way to confirm zero rows
--   currently use it. It stays valid at the database level but is retired
--   from the application (forms/UI) — see
--   src/lib/loan-cases-data.ts. If a row is ever found using it, it reads as
--   a legacy status, not an error.
--
-- Each RENAME VALUE / ADD VALUE is its own statement — Postgres does not
-- allow combining them in one ALTER TYPE call, and ADD VALUE must not be
-- used in the same transaction that also reads/writes the new value.
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'loan_status' and e.enumlabel = 'documents_pending'
  ) then
    alter type public.loan_status rename value 'documents_pending' to 'waiting_document';
  end if;
end $$;

alter type public.loan_status add value if not exists 'new' before 'waiting_document';
alter type public.loan_status add value if not exists 'ready_to_submit' before 'submitted';

-- ----------------------------------------------------------------------------
-- 2. loan_case_timeline_events — append-only, explicitly-recorded case
--    timeline. "Customer Created" and "Loan Created" are NOT stored here —
--    they're synthesized at read time from loan_cases.created_at /
--    customers.created_at, which already carry that information. "Checklist
--    Updated" entries are also synthesized at read time, from the existing
--    loan_case_required_document_events table (Sprint 6.2 Phase 1) — this
--    table only records what those two sources can't already tell us:
--    document uploads, OCR completions, and status changes.
--
-- Deliberately its own table, not a reuse of public.audit_logs — audit_logs
-- is super_admin-only by RLS (Sprint 4 decision), and this timeline must be
-- visible to the banker working the case, not just an admin.
-- ----------------------------------------------------------------------------
create table if not exists public.loan_case_timeline_events (
  id uuid primary key default gen_random_uuid(),
  loan_case_id uuid not null references public.loan_cases(id) on delete cascade,
  event_type text not null check (event_type in ('document_uploaded', 'ocr_completed', 'status_changed')),
  description text not null,
  metadata jsonb,
  actor_user_id uuid references public.user_profiles(id),
  occurred_at timestamptz not null default now()
);

alter table public.loan_case_timeline_events enable row level security;

-- Same visibility-via-EXISTS pattern as every other case-scoped table added
-- since Sprint 6.1 (documents, loan_case_required_documents, ...).
drop policy if exists "loan_case_timeline_events_select" on public.loan_case_timeline_events;
create policy "loan_case_timeline_events_select" on public.loan_case_timeline_events
for select
using (
  exists (
    select 1 from public.loan_cases lc
    where lc.id = loan_case_timeline_events.loan_case_id
  )
);

drop policy if exists "loan_case_timeline_events_insert_staff" on public.loan_case_timeline_events;
create policy "loan_case_timeline_events_insert_staff" on public.loan_case_timeline_events
for insert
with check (
  exists (
    select 1 from public.loan_cases lc
    where lc.id = loan_case_timeline_events.loan_case_id
  )
  and exists (
    select 1 from public.user_profiles up
    where up.auth_user_id = auth.uid()
      and up.role in ('super_admin', 'banker', 'property_agent', 'mortgage_outsource_agent')
  )
);
-- No update/delete policy: append-only, same as loan_case_required_document_events.

-- ============================================================================
-- End of Loan Processing Workflow migration
-- ============================================================================
