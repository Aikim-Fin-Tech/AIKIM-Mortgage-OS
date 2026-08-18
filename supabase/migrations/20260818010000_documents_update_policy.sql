-- ============================================================================
-- AIKIM Mortgage OS — PD-017 Phase A: assign_document_type RPC
-- (third revision — UNBLOCKED: the real loan_cases_select_scope predicate
-- was retrieved read-only from production and is reused verbatim below)
-- ============================================================================
--
-- Real predicate retrieved via:
--   select qual from pg_policies
--   where schemaname = 'public' and tablename = 'loan_cases'
--     and policyname = 'loan_cases_select_scope';
-- returned (copied character-for-character, only reformatted for line
-- length in this comment — the actual SQL below is the same expression,
-- not a paraphrase):
--
--   ((current_user_role() = 'super_admin'::user_role)
--     OR (banker_id IN (
--       SELECT bankers.id FROM bankers
--       WHERE (bankers.user_profile_id = current_user_profile_id())))
--     OR (assigned_agent_id = current_user_profile_id())
--     OR (customer_id IN (
--       SELECT customers.id FROM customers
--       WHERE (customers.user_profile_id = current_user_profile_id()))))
--
-- Two, and only two, mechanical adaptations were made to embed this inside
-- assign_document_type (step 3 below) — no logic was added, removed, or
-- reordered:
--   1. The bare column references (banker_id, assigned_agent_id,
--      customer_id) are qualified with an `lc.` alias, since in the
--      original RLS policy context they implicitly bind to "the loan_cases
--      row currently being evaluated" — here that binding must be made
--      explicit because the check is embedded in an EXISTS query scoped to
--      one specific case (v_case_id), not evaluated as a row-security
--      predicate.
--   2. Every function/table/type reference is schema-qualified
--      (public.current_user_role(), public.current_user_profile_id(),
--      public.bankers, public.customers, 'super_admin'::public.user_role)
--      per this round's `search_path = pg_catalog, public` requirement —
--      the original policy relies on `public` being in its evaluation
--      context's default search_path, which this function's pinned
--      search_path already covers, but explicit qualification here is
--      defense-in-depth, not a functional change.
--
-- This also fully resolves the SECURITY DEFINER / RLS-ownership-bypass
-- concern flagged in the previous revision (which had proposed `set local
-- role authenticated` as a workaround, explicitly rejected this round): that
-- concern only applied to *implicitly* relying on loan_cases' RLS filtering
-- a bare SELECT. Step 3 below no longer relies on RLS filtering anything —
-- it directly evaluates the same boolean condition loan_cases_select_scope
-- uses, as an explicit WHERE clause in this function's own query, so
-- whether this function's identity happens to bypass loan_cases' RLS is
-- irrelevant: there is no implicit filtering being depended on any more.
--
-- One deliberate scope narrowing versus loan_cases_select_scope itself: this
-- RPC's own step 1 (below) rejects any caller whose user_profiles.role is
-- not one of STAFF_ROLES (super_admin, banker, property_agent,
-- mortgage_outsource_agent) *before* even reaching the case-visibility
-- check — even though loan_cases_select_scope itself also allows a customer
-- to see their own case (its `customer_id IN (...)` branch). This is
-- intentional: assign_document_type is a staff workflow action (a banker
-- confirming/correcting a document's type), not a document-viewing
-- capability — a customer should never be reassigning document types on
-- their own case, even though they may be allowed to see it. Flagged
-- explicitly here so a future reader does not mistake this for an
-- oversight.
--
-- Everything else below is unchanged from the previous revision.
--
-- Scope: exactly one function, public.assign_document_type(document_id,
-- document_type_id), EXECUTE granted to `authenticated` only. No table or
-- column grant is added on public.documents. No RLS policy is added on
-- public.documents. This remains the only sanctioned way to change
-- documents.document_type_id from the client — see the previous revision's
-- header (preserved in git history once committed) for the full comparison
-- against a plain UPDATE RLS policy and the generate_case_number() /
-- case_number_counters precedent this follows
-- (20260716020000_create_loan_case_rpc.sql).
--
-- search_path: `set search_path = pg_catalog, public` (not `public,
-- pg_temp`) — pg_catalog first, so nothing in this function can be shadowed
-- by an object a caller might have created in a schema earlier in some
-- other search_path. Every business table below is still fully
-- schema-qualified (public.documents, public.loan_cases,
-- public.user_profiles, public.document_types) regardless — the search_path
-- setting is defense-in-depth on top of that, not a substitute for it.
--
-- SECURITY DEFINER, documented reason (unchanged from the previous
-- revision): public.documents has no UPDATE grant/policy for `authenticated`
-- — that is deliberate (see above) — so this function's own UPDATE must run
-- as an identity that can bypass that absence. SECURITY INVOKER cannot do
-- this.
--
-- No `set local role` anywhere in this version, per this round's explicit
-- instruction — case visibility is instead established by literally reusing
-- the real loan_cases_select_scope predicate (see above), not by
-- temporarily reassuming the `authenticated` role.
--
-- Every lookup below counts rows explicitly (`select count(*) into
-- v_count ...` then branches on 0 / 1 / >1) rather than a bare `select ...
-- into`, which in PL/pgSQL silently takes the first row on a multi-row
-- result instead of erroring — the exact "never guess, never silently pick
-- a row" discipline already applied to resolveDocumentTypeIdForKind and the
-- document_types tagging migration earlier in this project. For
-- public.documents and public.document_types specifically, both are looked
-- up by `id`, their primary key — a >1 result is structurally impossible
-- (enforced by the primary key constraint itself, not just application
-- logic), so those two checks reduce to "found / not found" in practice,
-- but are still written as explicit counts for consistency and auditability
-- per this round's literal instruction, not because a collision is actually
-- reachable there.
--
-- RPC body performs exactly one write: `update public.documents set
-- document_type_id = p_document_type_id where id = p_document_id`. No
-- dynamic SQL, no EXECUTE/format(), no JSON payload, no column name ever
-- taken from a parameter — the column and table are both written literally
-- in the function body, so there is no way to reach this statement with any
-- other column touched, regardless of what a caller passes.
--
-- Grants: `revoke all ... from public` (covers `anon` too, since PUBLIC
-- includes it unless previously revoked — explicit anyway per this round's
-- instruction to consider a separate `anon` revoke), then `grant execute
-- ... to authenticated` only.
--
-- Function owner (see full analysis below the function body) — this
-- migration cannot itself control or predict which role owns the function
-- once created; ownership is determined by whichever role executes this
-- `create function` statement, a deterministic Postgres rule, not a
-- probabilistic one. See the "Owner" section at the end of this file for
-- exactly what to check and why the answer is unambiguous once you know
-- which role you're connected as.
--
-- Idempotent: `create or replace function` (same signature every run) plus
-- `revoke`/`grant`, both safe to re-run.
--
-- Transactional: wrapped in explicit `begin;`/`commit;`.
--
-- NOT executed by this session — pending your review of the diff, the
-- verbatim-predicate comparison above, and the threat model, per this
-- round's instruction to wait before running anything.
-- ============================================================================

begin;

create or replace function public.assign_document_type(
  p_document_id uuid,
  p_document_type_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_staff_count int;
  v_actor_role text;
  v_document_count int;
  v_case_id uuid;
  v_case_visible boolean;
  v_type_count int;
  v_row_count int;
begin
  -- 0. auth.uid() must be non-null — an unauthenticated call (should
  --    already be impossible once EXECUTE is restricted to `authenticated`,
  --    but checked explicitly per this round's instruction, not assumed).
  if auth.uid() is null then
    raise exception 'assign_document_type: no authenticated caller.';
  end if;

  -- 1. Caller must have exactly one public.user_profiles row, with a
  --    STAFF_ROLES role. Counted explicitly, not a bare SELECT INTO, so a
  --    data-integrity problem (e.g. two profile rows for one auth user)
  --    fails loudly instead of silently picking one.
  select count(*) into v_staff_count
  from public.user_profiles up
  where up.auth_user_id = auth.uid();

  if v_staff_count = 0 then
    raise exception 'assign_document_type: no user_profiles row for caller.';
  elsif v_staff_count > 1 then
    raise exception 'assign_document_type: % user_profiles rows found for caller — ambiguous, refusing to guess.', v_staff_count;
  end if;

  select up.role into v_actor_role
  from public.user_profiles up
  where up.auth_user_id = auth.uid();

  if v_actor_role not in ('super_admin', 'banker', 'property_agent', 'mortgage_outsource_agent') then
    raise exception 'assign_document_type: caller is not authorized (staff role required).';
  end if;

  -- 2. public.documents must have exactly one row for p_document_id.
  --    Structurally guaranteed to be 0 or 1 (documents.id is the primary
  --    key) — counted explicitly anyway, per this round's instruction.
  select count(*) into v_document_count
  from public.documents d
  where d.id = p_document_id;

  if v_document_count = 0 then
    raise exception 'assign_document_type: document % not found.', p_document_id;
  end if;

  -- Safe to use a plain SELECT INTO here (not another count-then-select) —
  -- uniqueness for this exact id was just proven by the count above, so
  -- there is nothing left to guess between.
  select d.loan_case_id into v_case_id
  from public.documents d
  where d.id = p_document_id;

  -- 3. Case-visibility check — the real loan_cases_select_scope predicate,
  --    reused verbatim (see file header for the retrieved original and the
  --    two purely mechanical adaptations made: `lc.` column qualification
  --    and schema-qualification). Not a rewritten approximation.
  select exists (
    select 1
    from public.loan_cases lc
    where lc.id = v_case_id
      and (
        (public.current_user_role() = 'super_admin'::public.user_role)
        or (lc.banker_id in (
          select bankers.id
          from public.bankers
          where bankers.user_profile_id = public.current_user_profile_id()
        ))
        or (lc.assigned_agent_id = public.current_user_profile_id())
        or (lc.customer_id in (
          select customers.id
          from public.customers
          where customers.user_profile_id = public.current_user_profile_id()
        ))
      )
  ) into v_case_visible;

  if not v_case_visible then
    raise exception 'assign_document_type: document % not found or not accessible.', p_document_id;
  end if;

  -- 4. public.document_types must have exactly one row for
  --    p_document_type_id. Same primary-key guarantee as step 2.
  select count(*) into v_type_count
  from public.document_types dt
  where dt.id = p_document_type_id;

  if v_type_count = 0 then
    raise exception 'assign_document_type: document_type % not found.', p_document_type_id;
  end if;

  -- 5. The one and only write this function performs. Fixed table, fixed
  --    column, no dynamic SQL anywhere in this function.
  update public.documents
  set document_type_id = p_document_type_id
  where id = p_document_id;

  get diagnostics v_row_count = row_count;

  if v_row_count <> 1 then
    raise exception 'assign_document_type: update affected % rows for document % — expected exactly 1.', v_row_count, p_document_id;
  end if;
end;
$$;

revoke all on function public.assign_document_type(uuid, uuid) from public;
revoke all on function public.assign_document_type(uuid, uuid) from anon;
grant execute on function public.assign_document_type(uuid, uuid) to authenticated;

commit;

-- ============================================================================
-- Owner — what to check before running this
--
-- A function's owner in Postgres is, unconditionally, whichever role issues
-- the `create function` statement — there is no "usually" about this, it is
-- deterministic. This migration cannot itself report who that will be for
-- your project; it depends entirely on which role your Supabase SQL Editor
-- session is connected as when you run it. Check with:
--
--   select current_user;
--
-- before running this file. That role becomes assign_document_type's owner.
--
-- Whether that owner "can update documents" is equally deterministic, not
-- probabilistic: a table's owner always has full DML rights (including
-- UPDATE) on a table it owns, regardless of any GRANT/REVOKE statement —
-- this is a Postgres guarantee, not project-specific behavior. So the only
-- real question is whether your SQL Editor's connected role IS
-- public.documents' owner. Check with:
--
--   select tableowner from pg_tables where schemaname = 'public' and tablename = 'documents';
--
-- and compare against `current_user` above. Given every table and every
-- prior migration in this repo has been run through the same Supabase SQL
-- Editor session type, these are very likely the same role — but "very
-- likely" is exactly the kind of claim this round asked not to be made
-- without evidence, so: run both queries and compare them yourself before
-- executing this migration, rather than trusting this comment alone.
-- ============================================================================

-- ============================================================================
-- Rollback (NOT executed by this migration — documented for a human to run
-- manually if this needs to be reverted, once it has actually been applied).
-- Drops the one function this file adds; nothing else to undo:
--
--   drop function if exists public.assign_document_type(uuid, uuid);
-- ============================================================================

-- ============================================================================
-- Verification (NOT executed by this migration — for a human to run
-- manually after this file has actually been applied):
--
--   -- 1. Function exists, SECURITY DEFINER, correct search_path:
--   select proname, prosecdef, proconfig
--   from pg_proc
--   where pronamespace = 'public'::regnamespace and proname = 'assign_document_type';
--   -- Expected: prosecdef = true, proconfig contains search_path=pg_catalog, public.
--
--   -- 2. Only `authenticated` can execute it:
--   select grantee, privilege_type
--   from information_schema.routine_privileges
--   where routine_name = 'assign_document_type';
--   -- Expected: exactly one row, grantee = authenticated, privilege_type = EXECUTE.
--
--   -- 3. public.documents still has no UPDATE policy or grant added:
--   select polname, cmd from pg_policies
--   where schemaname = 'public' and tablename = 'documents' order by polname;
--   -- Expected: only documents_insert_staff (INSERT), documents_delete_staff
--   -- (DELETE), and the pre-existing select policy — no UPDATE row.
-- ============================================================================
