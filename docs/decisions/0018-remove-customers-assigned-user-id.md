# 0018. Remove public.customers.assigned_user_id

Status: Accepted
Date: 2026-09-09

## Context

A read-only Production baseline audit (triggered by an unrelated schema
reconciliation for `banks`/`bank_products`,
[0007](0007-mortgage-rule-admin.md)-adjacent but not part of it) surfaced
`public.customers.assigned_user_id` as one of two identity-bridge columns on
`customers` — the other, `user_profile_id`, links to this repo's own
`auth.users -> public.user_profiles` system. `assigned_user_id` instead
references `public.users(id)`, a completely separate, unlinked identity
table (`full_name`/`email`/`phone`/`role` default `'customer'`/`status`
default `'active'`, no `auth_user_id`) that this repo's own code has never
created, populated, or read.

Neither `public.users` nor `assigned_user_id` appears in any migration this
repository has ever committed, on any branch, at any point in its history.
Both were present in Production before this repo's earliest migration ran,
alongside 17 other tables forming a single contiguous OID block — evidence
they predate this codebase's own schema entirely, rather than having been
built and later abandoned by it.

Before concluding the column was safe to remove, every layer capable of
holding a live reference to it was checked directly against Production,
never assumed from absence alone:

- **Triggers**: the only identity-related trigger, `on_auth_user_created`
  (`AFTER INSERT ON auth.users`), calls `handle_new_auth_user()`, whose body
  inserts into `public.user_profiles` only — never `public.users`.
- **Functions/procedures**: a corrected, aggregate-safe search of every
  function/procedure body for the text `assigned_user_id` or
  `user_profile_id` returned exactly 4 matches
  (`assign_document_type`, `create_loan_case`, `current_user_profile_id`,
  `is_customer_authorized_for_current_banker`). All 4 resolve through
  `user_profile_id` (directly, via `bankers.user_profile_id`, or via the
  function name itself) — none reference `assigned_user_id`.
- **Views/materialized views**: a `pg_depend`-based structural scan found
  zero views or materialized views depending on `public.customers` at all.
- **RLS policies**: all 8 policies across `bankers`, `customers`,
  `documents`, and `loan_cases` that reference either bridge column
  reference `user_profile_id`; none reference `assigned_user_id`.
- **Repository source and history**: zero matches for `assigned_user_id` in
  the current working tree (`.ts`/`.tsx`/`.sql`/`.md`) and zero matches
  across the full commit history of every branch (`git log --all -p`).
- **Population and write activity**: 0 of 11 live `customers` rows have
  `assigned_user_id` set (0 have `user_profile_id` set either); the table
  has had exactly 0 lifetime `UPDATE`s ever, whole-row, since stats were
  last reset.
- **Catalog dependency graph**: `pg_depend` shows the column's only
  dependent is its own foreign key (`customers_assigned_user_id_fkey ->
  users(id)`), and that constraint's only dependents are its four
  Postgres-internal `RI_ConstraintTrigger` enforcement triggers
  (`deptype = 'i'`, automatically managed by Postgres, not
  independently created) — nothing else in the catalog touches this
  column.
- **Column comment / grants**: no column comment exists; grants are the
  identical Supabase-default boilerplate shared with every column on the
  table, not a deliberate configuration.

The one gap no read-only database or repository check could ever close on
its own — a process entirely external to this codebase and this database's
catalog, connecting with its own credentials — was closed by direct
confirmation from the project owner: no other system (script, workflow,
dashboard, legacy app, Edge Function, or third-party integration) uses this
Supabase project. Only AIKIM Mortgage OS does.

## Decision

Drop `public.customers.assigned_user_id` via
`supabase/migrations/20260903010000_remove_customers_assigned_user_id.sql`.
Because the column is referenced by exactly one single-column foreign key
and nothing else, `DROP COLUMN` removes that constraint (and its four
internal enforcement triggers) automatically, without `CASCADE`.

`public.customers.user_profile_id` is explicitly out of scope and unchanged
— unlike `assigned_user_id`, it has confirmed live references (the 8 RLS
policies and `assign_document_type` above) despite also being currently
unpopulated; a column can be simultaneously "live" (has a real, exercised
code path) and "empty" (no row happens to use it yet).

`public.users` and the other 17 tables in the same out-of-band cluster are
explicitly out of scope. This decision classifies and removes exactly one
column; it does not classify, and takes no position on, the cluster itself.

## Consequences

- `public.customers` loses a column with zero current use in this
  codebase and zero historical use in its commit history — no application
  code, RLS policy, function, trigger, or view changes as a result, because
  none ever touched it.
- The out-of-band `public.users` table (and the FK pointing at it) is
  untouched by this decision. It remains present, empty, and unclassified.
  A future maintainer encountering it should not assume this ADR settled
  its fate — it did not.
- If a future need arises to link a `customers` row to an assignable staff
  identity, `user_profile_id` (already live, already wired into RLS) is the
  existing mechanism to extend — not a reintroduction of `assigned_user_id`
  or a new reference to `public.users`.
- This is a schema change with no data-loss risk as verified (0 rows
  populated), but like every migration in this repo, is authored only —
  not executed by any agent. A human must run it manually in the Supabase
  SQL Editor after review.

## Evidence

Full step-by-step read-only investigation transcript (triggers, functions,
views, RLS policies, repository grep, repository history, population,
table activity stats, catalog dependency graph, column comments/grants)
performed across this session prior to this ADR. Migration:
`supabase/migrations/20260903010000_remove_customers_assigned_user_id.sql`.
Schema documentation: [../architecture/database.md](../architecture/database.md).

**Post-migration Production verification (2026-09-10):** the migration was
executed manually and returned success with no errors. Follow-up read-only
checks confirmed: `customers.assigned_user_id` no longer exists;
`customers_assigned_user_id_fkey` no longer exists; `public.customers` row
count is unchanged at 11; `public.users` remains at 0 rows, untouched.

**Clarification on the "8 policies" figure above:** that count is the
number of RLS policies across `bankers`/`customers`/`documents`/`loan_cases`
whose `USING`/`WITH CHECK` text matches either bridge column name — a
filtered subset, not the total policy count on those four tables. A direct,
unfiltered `pg_policies` enumeration after the migration found 19 total
policies across the same four tables (`bankers`: 5, `customers`: 4,
`documents`: 6, `loan_cases`: 4). This is consistent, not contradictory: 8
of those 19 reference `user_profile_id` (the same 8 named above, unaffected
by this migration) and the remaining 11 are policies scoped to other
concerns entirely (e.g. insert-only staff checks, admin-only delete checks)
that never referenced either bridge column and were never part of this
ADR's evidence chain. No RLS policy was modified, added, or removed by this
migration.
