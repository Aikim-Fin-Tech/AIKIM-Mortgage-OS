-- ============================================================================
-- AIKIM Mortgage OS — My Profile: self-service update support
--
-- Scope: lets a signed-in user edit their OWN user_profiles row
-- (full_name, phone only) and, if they are a Banker, their OWN linked
-- bankers row (full_name, bank_name, branch, phone only) — from the new
-- /profile page (src/app/profile/). Nothing else.
--
-- Revised after a read-only production policy inspection (this session)
-- surfaced two things this migration's first draft did not know about:
--   1. public.user_profiles already has a policy, user_profiles_update_own_
--      or_admin (PERMISSIVE, using/with check:
--      `auth_user_id = auth.uid() OR current_user_role() = 'super_admin'`),
--      which already covers self-row UPDATE access. The first draft's own
--      user_profiles_update_self policy was therefore fully redundant (an
--      OR'd permissive policy adding a condition the existing one already
--      grants) and has been removed — this migration no longer creates or
--      touches any policy on user_profiles.
--   2. public.bankers already has a policy, bankers_update_admin
--      (PERMISSIVE, using/with check: `current_user_role() = 'super_admin'`
--      only — no self-branch at all). This one is genuinely necessary to
--      keep: without a self-scoped bankers policy, a Banker cannot update
--      their own bankers row under any circumstance, which the Banking
--      Details form in this PR depends on. bankers_update_self (below) is
--      an ADDITION alongside bankers_update_admin, not a replacement.
--   3. `authenticated` was confirmed to currently hold broad UPDATE column
--      grants on both tables, including role, auth_user_id, email, id, and
--      user_profile_id — i.e. today, any signed-in user can satisfy their
--      own-row branch of user_profiles_update_own_or_admin and then set
--      their OWN role to 'super_admin' via a raw REST call. This migration
--      exists specifically to close that hole, via the REVOKE + narrow
--      GRANT below — independent of, and in addition to, whichever RLS
--      policy matches a given row.
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
-- Security design — two independent layers:
--   1. RLS row-level scoping — entirely pre-existing for both tables (see
--      above); this migration adds exactly one new policy, bankers_update_
--      self, and does not touch user_profiles' policies at all.
--   2. Column-level GRANT UPDATE naming only the specific editable columns
--      — a plain RLS policy's WITH CHECK clause can validate the new row's
--      values but cannot by itself forbid a specific column from changing
--      at all (a client could satisfy `auth_user_id = auth.uid()` while
--      also setting role = 'super_admin' in the same statement — exactly
--      the live hole described above). The column-level GRANT is what
--      actually makes `role`, `auth_user_id`, `id`, and (on bankers)
--      `user_profile_id`/`email` impossible to change via either table's
--      UPDATE path, regardless of what a client sends or which policy's
--      row-check passed — Postgres rejects any UPDATE statement
--      referencing an ungranted column outright, before RLS is even
--      evaluated. Neither layer alone is sufficient.
--
-- IMPORTANT — this necessarily also narrows what a Super Admin can update
-- via the app/PostgREST layer, and that is intentional, not an oversight:
--   - PostgreSQL GRANTs attach to the Postgres role executing the query
--     (`authenticated`), not to the application-level value stored in
--     user_profiles.role. A super_admin's session still runs as
--     `authenticated` — there is no way for a column-level GRANT to say
--     "wide columns if the app-level role is super_admin, narrow columns
--     otherwise." The REVOKE below is unconditional for the `authenticated`
--     Postgres role.
--   - Consequence: after this migration, a Super Admin session can still
--     reach ANY row on both tables (user_profiles_update_own_or_admin's and
--     bankers_update_admin's admin branches are both untouched), but can
--     only write full_name/phone (user_profiles) or full_name/bank_name/
--     branch/phone (bankers) through the app/PostgREST layer — role,
--     auth_user_id, id, user_profile_id, and email are not updatable
--     through either table via that layer at all, for anyone, admin
--     included.
--   - This does NOT regress the currently shipped application: no
--     in-app user-management UI or Server Action anywhere in this
--     repository updates role, auth_user_id, user_profile_id, or email on
--     either table today (verified by search). The documented account-
--     provisioning process (see the 5-banker pilot account setup audit)
--     runs entirely through the Supabase SQL Editor as a superuser, which
--     bypasses both RLS and these GRANTs entirely and is therefore
--     completely unaffected by this migration.
--   - Any future Manage Users / Manage Bankers admin feature that needs a
--     super_admin to edit role, auth_user_id, user_profile_id, or email
--     through the app must be its own separately reviewed, explicitly
--     scoped design (e.g. a SECURITY DEFINER RPC that re-validates the
--     caller is super_admin server-side, per this repo's existing
--     create_eligibility_verdict/assign_document_type pattern — see
--     docs/architecture/security.md) with its own explicit GRANTs. It must
--     never be restored by simply widening the column list this migration
--     narrows, since that would reopen the exact self-escalation hole this
--     migration exists to close.
--
-- A defensive `revoke update ... from authenticated` precedes each grant so
-- the broad grant confirmed live in production above is actually removed,
-- not merely left in place alongside a new, narrower one (GRANT is
-- additive — issuing a narrower GRANT without first REVOKEing the existing
-- broad one would not narrow anything). REVOKE on a grant that no longer
-- exists on a re-run is a no-op, not an error.
--
-- Deliberately does NOT touch:
--   - user_profiles' policies — user_profiles_update_own_or_admin already
--     correctly covers self-row access; nothing to add.
--   - bankers_update_admin — preserved as-is; still the only path for an
--     admin to reach a row that isn't their own.
--   - user_profiles.role, auth_user_id, id — immutable via the app/
--     PostgREST layer as of this migration (see above).
--   - bankers.user_profile_id, id, email — immutable via the app/PostgREST
--     layer as of this migration (see above).
--   - Any SELECT policy — this migration is UPDATE-only; existing read
--     access (already relied on by the "Assigned Banker" dropdown, global
--     search, and loan_cases_select_scope) is unchanged.
--   - The `current_user_role()` / `current_user_profile_id()` helper
--     functions referenced elsewhere in this repo's comments (e.g.
--     20260818010000_documents_update_policy.sql) and used by the two
--     pre-existing policies above — this migration's own new policy
--     (bankers_update_self) resolves "my own user_profiles row" via a
--     direct, self-contained subquery instead of depending on those
--     un-audited-in-this-repo functions, so it can be reviewed without
--     needing their definitions.
--
-- Idempotent: `add column if not exists`; `drop policy if exists` before
-- the one `create policy`; REVOKE/GRANT are naturally idempotent. Safe to
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
-- 2. user_profiles — narrow the UPDATE column grant only. No policy change:
--    user_profiles_update_own_or_admin (pre-existing, preserved) already
--    correctly scopes rows to "self, or super_admin acting on any row".
-- ----------------------------------------------------------------------------
revoke update on public.user_profiles from authenticated;
grant update (full_name, phone) on public.user_profiles to authenticated;

-- ----------------------------------------------------------------------------
-- 3. bankers — narrow the UPDATE column grant, and add the one genuinely
--    new policy this feature needs. bankers_update_admin (pre-existing,
--    preserved) stays admin-only; it has no self-branch, so a Banker
--    editing their own row requires this additional, self-scoped policy.
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
--   revoke update on public.user_profiles from authenticated;
--
-- Note: this does not restore the broad UPDATE column grant that was
-- confirmed live on both tables before this migration ran (role,
-- auth_user_id, email, id, user_profile_id included). If that needs
-- restoring, that is a separate, explicit, human-confirmed decision — not
-- an automatic reversal, and not one this rollback should make silently,
-- since that grant is exactly what this migration was written to remove.
--
-- user_profiles_update_own_or_admin and bankers_update_admin are untouched
-- by this migration and therefore untouched by this rollback too — neither
-- was ever dropped or recreated here.
--
-- user_profiles.phone is left in place by this rollback — dropping a column
-- that may now hold real user-entered data is a separate, explicit decision,
-- not bundled into a GRANT/policy rollback.
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
--
--   select tablename, policyname, cmd, qual, with_check
--   from pg_policies
--   where schemaname = 'public'
--     and tablename in ('user_profiles', 'bankers')
--     and cmd = 'UPDATE'
--   order by tablename, policyname;
--
-- Expected result: exactly 3 rows —
--   user_profiles | user_profiles_update_own_or_admin | (unchanged, pre-existing)
--   bankers       | bankers_update_admin              | (unchanged, pre-existing)
--   bankers       | bankers_update_self               | (new, added by this migration)
-- No user_profiles_update_self row should exist.
-- ============================================================================
