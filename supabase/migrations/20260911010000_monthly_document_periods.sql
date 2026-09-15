-- AIKIM Mortgage OS — distinct monthly evidence for payslips/bank statements
-- Authored for human review. This migration has not been executed.

begin;

-- The old catalog label embeds a 3-month policy in a document type. Rename
-- the single known row so the same type remains truthful under 3- or 6-month
-- rules. References are UUID-based and remain intact.
do $$
declare
  v_old_count int;
  v_new_count int;
begin
  select count(*) into v_old_count
  from public.document_types
  where lower(trim(name)) = lower(trim('Latest 3 Months Payslip'));

  select count(*) into v_new_count
  from public.document_types
  where lower(trim(name)) = lower(trim('Salary Slip'));

  if v_old_count > 1 or v_new_count > 1 then
    raise exception 'monthly_document_periods: ambiguous Salary Slip document type rows.';
  elsif v_old_count = 1 and v_new_count = 0 then
    update public.document_types
    set name = 'Salary Slip', updated_at = now()
    where lower(trim(name)) = lower(trim('Latest 3 Months Payslip'));
  elsif v_old_count = 1 and v_new_count = 1 then
    raise exception 'monthly_document_periods: both old and new Salary Slip labels exist; resolve before migration.';
  end if;
end $$;

alter table public.documents
  add column if not exists document_period date;

comment on column public.documents.document_period is
  'First day of the calendar month represented by period-based evidence (salary_slip or bank_statement); null for non-monthly evidence or pending confirmation.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'documents_document_period_first_day_check'
      and conrelid = 'public.documents'::regclass
  ) then
    alter table public.documents
      add constraint documents_document_period_first_day_check
      check (document_period is null or document_period = date_trunc('month', document_period)::date);
  end if;
end $$;

create unique index if not exists documents_case_type_period_unique_idx
  on public.documents (loan_case_id, document_type_id, document_period)
  where document_type_id is not null and document_period is not null;

create or replace function public.assign_document_type_and_period(
  p_document_id uuid,
  p_document_type_id uuid,
  p_document_period date
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_staff_count int;
  v_actor_role text;
  v_case_id uuid;
  v_case_visible boolean;
  v_ocr_kind text;
  v_period_required boolean;
  v_row_count int;
begin
  if auth.uid() is null then
    raise exception 'assign_document_type_and_period: no authenticated caller.';
  end if;

  select count(*) into v_staff_count
  from public.user_profiles up
  where up.auth_user_id = auth.uid();

  if v_staff_count = 0 then
    raise exception 'assign_document_type_and_period: no user_profiles row for caller.';
  elsif v_staff_count > 1 then
    raise exception 'assign_document_type_and_period: % user_profiles rows found for caller — ambiguous.', v_staff_count;
  end if;

  select up.role into v_actor_role
  from public.user_profiles up
  where up.auth_user_id = auth.uid();

  if v_actor_role not in ('super_admin', 'banker', 'property_agent', 'mortgage_outsource_agent') then
    raise exception 'assign_document_type_and_period: caller is not authorized (staff role required).';
  end if;

  select d.loan_case_id into v_case_id
  from public.documents d
  where d.id = p_document_id
  for update;

  if v_case_id is null then
    raise exception 'assign_document_type_and_period: document % not found.', p_document_id;
  end if;

  select exists (
    select 1
    from public.loan_cases lc
    where lc.id = v_case_id
      and (
        public.current_user_role() = 'super_admin'::public.user_role
        or lc.banker_id in (
          select b.id from public.bankers b
          where b.user_profile_id = public.current_user_profile_id()
        )
        or lc.assigned_agent_id = public.current_user_profile_id()
        or lc.customer_id in (
          select c.id from public.customers c
          where c.user_profile_id = public.current_user_profile_id()
        )
      )
  ) into v_case_visible;

  if not v_case_visible then
    raise exception 'assign_document_type_and_period: document % not found or not accessible.', p_document_id;
  end if;

  select dt.ocr_kind into v_ocr_kind
  from public.document_types dt
  where dt.id = p_document_type_id;

  if not found then
    raise exception 'assign_document_type_and_period: document_type % not found.', p_document_type_id;
  end if;

  v_period_required := coalesce(v_ocr_kind in ('salary_slip', 'bank_statement'), false);

  if v_period_required and p_document_period is null then
    raise exception 'assign_document_type_and_period: a document month is required for %.', v_ocr_kind;
  end if;

  if not v_period_required and p_document_period is not null then
    raise exception 'assign_document_type_and_period: document month is only valid for monthly evidence.';
  end if;

  if p_document_period is not null
     and p_document_period <> date_trunc('month', p_document_period)::date then
    raise exception 'assign_document_type_and_period: document month must be the first day of its month.';
  end if;

  if p_document_period is not null
     and p_document_period >= date_trunc('month', (current_timestamp at time zone 'Asia/Kuala_Lumpur'))::date then
    raise exception 'assign_document_type_and_period: current or future months are not complete evidence periods.';
  end if;

  if p_document_period is not null and exists (
    select 1
    from public.documents d
    where d.loan_case_id = v_case_id
      and d.document_type_id = p_document_type_id
      and d.document_period = p_document_period
      and d.id <> p_document_id
  ) then
    raise exception using
      errcode = '23505',
      message = 'assign_document_type_and_period: duplicate document period for this case and type.';
  end if;

  update public.documents
  set document_type_id = p_document_type_id,
      document_period = p_document_period
  where id = p_document_id;

  get diagnostics v_row_count = row_count;
  if v_row_count <> 1 then
    raise exception 'assign_document_type_and_period: update affected % rows for document % — expected one.', v_row_count, p_document_id;
  end if;
exception
  when unique_violation then
    raise exception using
      errcode = '23505',
      message = 'assign_document_type_and_period: duplicate document period for this case and type.';
end;
$$;

revoke all on function public.assign_document_type_and_period(uuid, uuid, date) from public;
revoke all on function public.assign_document_type_and_period(uuid, uuid, date) from anon;
grant execute on function public.assign_document_type_and_period(uuid, uuid, date) to authenticated;

commit;

-- Rollback (manual, only after reverting the app):
-- drop function if exists public.assign_document_type_and_period(uuid, uuid, date);
-- drop index if exists public.documents_case_type_period_unique_idx;
-- alter table public.documents drop constraint if exists documents_document_period_first_day_check;
-- alter table public.documents drop column if exists document_period;
-- update public.document_types set name = 'Latest 3 Months Payslip'
-- where lower(trim(name)) = lower(trim('Salary Slip'));
