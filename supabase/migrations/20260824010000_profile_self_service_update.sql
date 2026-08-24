-- ============================================================================
-- AIKIM Mortgage OS — My Profile: self-service update support
--
-- Scope: lets a signed-in user edit their OWN user_profiles row
-- (full_name, phone only) and, if they are a Banker, their OWN linked
-- bankers row (full_name, bank_name, branch, phone only) — from the new
-- /profile page (src/app/profile/). Nothing else.
--
-- Both public.user_profiles and public.bankers predate this repository's
-- migration history (same category as public.banks/public.document_types —
-- see docs/architecture/database.md) — this migration does not assume their
-- full column list. It adds `phone` to user_profiles defensively (`add
-- column if not exists`), since docs/architecture/database.md only
-- documents auth_user_id/full_name/role for that table and this is the
-- first time this repository needs a phone column on it. bankers'
-- full_name/bank_name/branch/phone columns are already documented there, so
-- no defensive ADD COLUMN is needed for that table.
--
-- Security design — two layers, not one:
--   1. RLS UPDATE policy scoped to "your own row only" (auth_user_id =
--      auth.uid() for user_profiles; user_profile_id resolves to your own
--      user_profiles.id for bankers) — row-level scoping.
--   2. Column-level GRANT UPDATE naming only the specific editable columns
--      — a plain RLS policy's WITH CHECK clause can validate the new row's
--      values but cannot by itself forbid a specific column from changing
--      at all (a client could satisfy `with check (auth_user_id =
--      auth.uid())` while also setting role = 'super_admin' in the same
--      statement). The column-level GRANT is what actually makes `role`,
--      `auth_user_id`, `id`, and (on bankers) `user_profile_id`/`email`
--      impossible to change via this policy, regardless of what a client
--      sends — Postgres rejects any UPDATE statement referencing an
--      ungranted column outright, before RLS is even evaluated. Neither
--      layer alone is sufficient; both are required.
--
-- A defensive `revoke update ... from authenticated` precedes each grant,
-- in case a broader UPDATE grant already exists in production from before
-- this repository's migration history began (unknown/unverified — same
-- caution as the rest of this table's history). REVOKE on a grant that
-- doesn't exist is a no-op, not an error, so this is safe either way.
--
-- Deliberately does NOT touch:
--   - user_profiles.role, auth_user_id, id — immutable via this policy.
--   - bankers.user_profile_id, id, email — immutable via this policy.
--   - Any SELECT policy — this migration is UPDATE-only; existing read
--     access (already relied on by the "Assigned Banker" dropdown, global
--     search, and loan_cases_select_scope) is unchanged.
--   - The `current_user_role()` / `current_user_profile_id()` helper
--     functions referenced elsewhere in this repo's comments (e.g.
--     20260818010000_documents_update_policy.sql) — this migration
--     resolves "my own user_profiles row" via a direct, self-contained
--     subquery instead of depending on those un-audited-in-this-repo
--     functions, so it can be reviewed without needing their definitions.
--
-- Idempotent: `drop policy if exists` before each `create policy`; `add
-- column if not exists`; REVOKE/GRANT are naturally idempotent. Safe to
-- re-run.
--
-- Copy this entire file into the Supabase SQL Editor and run it once.
-- NOT executed by this session — pending human review and manual execution.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. user_profiles.phone — defensive, additive.
-- ----------------------------------------------------------------------------
alter table public.user_profiles
  add column if not exists phone text;

comment on column public.user_profiles.phone is 'Self-editable via /profile. Optional — no format/uniqueness constraint imposed here.';

-- ----------------------------------------------------------------------------
-- 2. user_profiles — self-update, full_name and phone only.
-- ----------------------------------------------------------------------------
revoke update on public.user_profiles from authenticated;
grant update (full_name, phone) on public.user_profiles to authenticated;

drop policy if exists "user_profiles_update_self" on public.user_profiles;
create policy "user_profiles_update_self" on public.user_profiles
for update
using (auth_user_id = auth.uid())
with check (auth_user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 3. bankers — self-update, full_name/bank_name/branch/phone only, scoped to
--    the caller's own linked row via user_profile_id.
-- ----------------------------------------------------------------------------
revoke update on public.bankers from authenticated;
grant update (full_name, bank_name, branch, phone) on public.bankers to authenticated;

drop policy if exists "bankers_update_self" on public.bankers;
create policy "bankers_update_self" on public.bankers
for update
using (
  user_profile_id in (
    select up.id from public.user_profiles up where up.auth_user_id = auth.uid()
  )
)
with check (
  user_profile_id in (
    select up.id from public.user_profiles up where up.auth_user_id = auth.uid()
  )
);

commit;

-- ============================================================================
-- Rollback (NOT executed by this migration — documented for a human to run
-- manually if this needs to be reverted):
--
--   drop policy if exists "bankers_update_self" on public.bankers;
--   revoke update on public.bankers from authenticated;
--
--   drop policy if exists "user_profiles_update_self" on public.user_profiles;
--   revoke update on public.user_profiles from authenticated;
--
-- Note: this does not restore whatever UPDATE grant existed on these two
-- tables before this migration ran (unknown — see header). If one existed
-- and needs restoring, that is a separate, human-confirmed decision, not an
-- automatic reversal.
--
-- user_profiles.phone is left in place by this rollback — dropping a column
-- that may now hold real user-entered data is a separate, explicit decision,
-- not bundled into an RLS/grant rollback.
-- ============================================================================

-- ============================================================================
-- Verification (NOT executed by this migration — for a human to run
-- manually after applying the migration above, as the affected user via the
-- app itself, or read-only as super_admin):
--
--   select grantee, table_name, privilege_type, column_name
--   from information_schema.column_privileges
--   where table_schema = 'public'
--     and table_name in ('user_profiles', 'bankers')
--     and privilege_type = 'UPDATE'
--     and grantee = 'authenticated'
--   order by table_name, column_name;
--
-- Expected result: exactly (full_name, phone) for user_profiles and exactly
-- (full_name, bank_name, branch, phone) for bankers — role, auth_user_id,
-- id, user_profile_id, and email must NOT appear in this list.
-- ============================================================================
