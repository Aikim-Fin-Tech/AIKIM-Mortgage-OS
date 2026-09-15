-- Read-only verification after a human runs
-- 20260911010000_monthly_document_periods.sql.

select
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'documents'
      and column_name = 'document_period'
      and data_type = 'date'
  ) as document_period_exists,
  to_regprocedure('public.assign_document_type_and_period(uuid,uuid,date)') is not null as rpc_exists,
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'documents'
      and indexname = 'documents_case_type_period_unique_idx'
  ) as unique_index_exists;

select
  p.oid::regprocedure as function_identity,
  pg_get_userbyid(p.proowner) as owner,
  p.prosecdef as security_definer,
  p.proconfig as function_settings
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'assign_document_type_and_period';

select grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name = 'assign_document_type_and_period'
order by grantee, privilege_type;

-- Should return zero rows. Null periods are intentionally excluded because
-- existing auto-classified monthly documents require staff confirmation.
select loan_case_id, document_type_id, document_period, count(*) as duplicate_count
from public.documents
where document_type_id is not null and document_period is not null
group by loan_case_id, document_type_id, document_period
having count(*) > 1;

-- Inventory rows still waiting for a month confirmation.
select d.id, lc.case_number, d.file_name, dt.name as document_type, dt.ocr_kind
from public.documents d
join public.loan_cases lc on lc.id = d.loan_case_id
join public.document_types dt on dt.id = d.document_type_id
where dt.ocr_kind in ('salary_slip', 'bank_statement')
  and d.document_period is null
order by d.created_at;
