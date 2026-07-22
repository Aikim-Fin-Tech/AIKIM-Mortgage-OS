-- ============================================================================
-- AIKIM Mortgage OS — Sprint 6.1: Document Management MVP
--
-- Scope: storage + metadata for uploading, listing, previewing, downloading,
-- and deleting documents attached to a loan case. No OCR, AI screening, DSR,
-- or recommendation logic — those are explicitly out of scope for this sprint.
--
-- Audit note (see docs/architecture/database.md and docs/decisions/0005-*):
-- this repo has no committed baseline schema, so the exact current columns of
-- public.documents could not be verified before writing this file (no schema
-- export exists, and this session had no database credentials beyond the
-- public anon/publishable key, which the live project's PostgREST schema
-- endpoint correctly rejected). Every ALTER below is written defensively with
-- IF NOT EXISTS so it is a no-op for anything that already exists — please
-- confirm the actual column set in the Supabase SQL Editor before running
-- this, and adjust column names here first if any of them already exist
-- under a different name.
--
-- Copy this entire file into the Supabase SQL Editor and run it once.
-- Idempotent: safe to re-run. Does not touch any existing row data.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Document metadata columns (additive only)
--
-- uploaded_by_user_id (not uploaded_by) to read unambiguously as "a
-- user_profiles.id", matching the loan_cases.created_by / assigned_agent_id
-- naming style already used elsewhere in this schema.
--
-- storage_provider defaults to 'supabase' — plain text, not an enum, since
-- this sprint only ever writes 'supabase'; if a second provider is ever
-- added, that's a values-only change, not a type change.
--
-- document_hash is nullable and not populated by any code in this sprint —
-- reserved for a future content-integrity/dedup check. Planned, not
-- implemented.
--
-- processing_status is a separate concept from the existing document_status
-- enum (pending | verified | rejected), which reflects human verification.
-- processing_status instead reflects the file's own pipeline state (e.g. an
-- upcoming OCR/AI step). Kept as plain text with a default, not a Postgres
-- enum, because this sprint does not define the full set of future values —
-- adding a value later is then a data change, not a type migration.
-- ----------------------------------------------------------------------------
alter table public.documents
  add column if not exists file_name text,
  add column if not exists storage_path text,
  add column if not exists file_size bigint,
  add column if not exists mime_type text,
  add column if not exists uploaded_by_user_id uuid references public.user_profiles(id),
  add column if not exists storage_provider text not null default 'supabase',
  add column if not exists document_hash text,
  add column if not exists processing_status text not null default 'UPLOADED';

comment on column public.documents.file_name is 'Original uploaded file name, as shown to the user.';
comment on column public.documents.storage_path is
  'Path within the loan-documents storage bucket, e.g. "<loan_case_id>/<uuid>-<file_name>".';
comment on column public.documents.file_size is 'File size in bytes, as reported at upload time.';
comment on column public.documents.mime_type is 'Reported MIME type, e.g. application/pdf, image/jpeg, image/png.';
comment on column public.documents.uploaded_by_user_id is
  'public.user_profiles.id of the staff member who uploaded the file. Resolved server-side from auth.uid(), never from client input.';
comment on column public.documents.storage_provider is
  'Which storage backend holds this file. Always "supabase" today — reserved for future multi-provider support.';
comment on column public.documents.document_hash is
  'Content hash of the file (e.g. SHA-256), for future integrity/dedup checks. Not populated by any code yet — reserved.';
comment on column public.documents.processing_status is
  'Pipeline state of the file itself (e.g. UPLOADED), distinct from document_status (human verification: pending/verified/rejected). No enum yet — full value set is not defined by this sprint.';

-- ----------------------------------------------------------------------------
-- 2. Storage bucket
--
-- Private bucket (public = false) — every read goes through a short-lived
-- signed URL generated server-side after an RLS-equivalent access check, not
-- a permanent public URL. file_size_limit and allowed_mime_types are set at
-- the bucket level so Supabase Storage itself rejects anything outside the
-- sprint's PDF/JPG/PNG, 20MB requirement, independent of client-side checks.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'loan-documents',
  'loan-documents',
  false,
  20971520, -- 20MB
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ----------------------------------------------------------------------------
-- 3. Storage RLS — mirrors public.loan_cases visibility
--
-- Objects are stored at "<loan_case_id>/<file>". Rather than duplicate
-- whatever loan_cases_select_scope actually does (its definition is not
-- committed to this repo), every policy below re-checks visibility by
-- selecting the matching public.loan_cases row as the calling user — that
-- select is itself governed by the existing loan_cases RLS policy, so access
-- to a case's documents can never be broader than access to the case itself.
-- ----------------------------------------------------------------------------
drop policy if exists "loan_documents_select" on storage.objects;
create policy "loan_documents_select" on storage.objects
for select
using (
  bucket_id = 'loan-documents'
  and exists (
    select 1 from public.loan_cases lc
    where lc.id::text = (storage.foldername(name))[1]
  )
);

drop policy if exists "loan_documents_insert_staff" on storage.objects;
create policy "loan_documents_insert_staff" on storage.objects
for insert
with check (
  bucket_id = 'loan-documents'
  and exists (
    select 1 from public.loan_cases lc
    where lc.id::text = (storage.foldername(name))[1]
  )
  and exists (
    select 1 from public.user_profiles up
    where up.auth_user_id = auth.uid()
      and up.role in ('super_admin', 'banker', 'property_agent', 'mortgage_outsource_agent')
  )
);

drop policy if exists "loan_documents_delete_staff" on storage.objects;
create policy "loan_documents_delete_staff" on storage.objects
for delete
using (
  bucket_id = 'loan-documents'
  and exists (
    select 1 from public.loan_cases lc
    where lc.id::text = (storage.foldername(name))[1]
  )
  and exists (
    select 1 from public.user_profiles up
    where up.auth_user_id = auth.uid()
      and up.role in ('super_admin', 'banker', 'property_agent', 'mortgage_outsource_agent')
  )
);

-- ----------------------------------------------------------------------------
-- 4. public.documents RLS — insert/delete only
--
-- A select policy on public.documents is assumed to already exist (the
-- dashboard and case-detail pages already read this table successfully
-- today). Only insert/delete are added here, since no write path existed
-- before this sprint. Same STAFF_ROLES set as loan_cases_insert_staff.
-- ----------------------------------------------------------------------------
drop policy if exists "documents_insert_staff" on public.documents;
create policy "documents_insert_staff" on public.documents
for insert
with check (
  exists (
    select 1 from public.loan_cases lc
    where lc.id = documents.loan_case_id
  )
  and exists (
    select 1 from public.user_profiles up
    where up.auth_user_id = auth.uid()
      and up.role in ('super_admin', 'banker', 'property_agent', 'mortgage_outsource_agent')
  )
);

drop policy if exists "documents_delete_staff" on public.documents;
create policy "documents_delete_staff" on public.documents
for delete
using (
  exists (
    select 1 from public.loan_cases lc
    where lc.id = documents.loan_case_id
  )
  and exists (
    select 1 from public.user_profiles up
    where up.auth_user_id = auth.uid()
      and up.role in ('super_admin', 'banker', 'property_agent', 'mortgage_outsource_agent')
  )
);

-- ============================================================================
-- End of Sprint 6.1 migration
-- ============================================================================
