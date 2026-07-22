-- ============================================================================
-- AIKIM Mortgage OS — MVP Sprint: OCR Integration (NRIC, Salary Slip)
--
-- Scope: minimal schema to (a) tag which document_types are OCR-eligible and
-- what kind of document they are, and (b) store structured extraction
-- results per uploaded document. This is P0 MVP infrastructure, not part of
-- the frozen Sprint 6.2 Phase 2 admin/rules work — see the freeze notes in
-- docs/product/roadmap.md.
--
-- No mortgage rule / admin schema is touched here. No AI Case Summary
-- persistence either — the summary's factual fields are computed live from
-- existing tables, and only the AI-generated "next action" is ephemeral
-- (regenerated on request, not stored) — see
-- src/lib/case-summary/generate-next-action.ts.
--
-- Audit note: as with every prior migration in this repo, no live schema
-- access was available this session — every change below is additive and
-- defensive (IF NOT EXISTS). Verify against the live schema before running.
--
-- Copy this entire file into the Supabase SQL Editor and run it once, after
-- all prior migrations. Idempotent: safe to re-run. Does not touch any
-- existing row data.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. document_types gains an OCR kind tag (additive, nullable)
--
-- NULL = not OCR-eligible (most document types). Values match
-- src/lib/ocr/types.ts's OCRDocumentKind exactly — the TypeScript union is
-- the source of truth for what's valid, this CHECK just guards against typos
-- at the data layer.
-- ----------------------------------------------------------------------------
alter table public.document_types
  add column if not exists ocr_kind text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'document_types_ocr_kind_valid'
  ) then
    alter table public.document_types
      add constraint document_types_ocr_kind_valid
      check (ocr_kind is null or ocr_kind in ('nric', 'salary_slip'));
  end if;
end $$;

comment on column public.document_types.ocr_kind is
  'NULL = not OCR-eligible. Otherwise must match src/lib/ocr/types.ts OCRDocumentKind (nric | salary_slip).';

-- ----------------------------------------------------------------------------
-- 2. document_extractions — one row per OCR attempt on an uploaded document.
--
-- Every attempt is stored (not just the latest), including failures
-- (extracted_data null, error set) — an honest record of what OCR actually
-- returned, never silently overwritten. The Documents tab reads the most
-- recent successful row per document.
-- ----------------------------------------------------------------------------
create table if not exists public.document_extractions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  kind text not null check (kind in ('nric', 'salary_slip')),
  extracted_data jsonb,
  model_name text not null,
  error text,
  extracted_by_user_id uuid references public.user_profiles(id),
  created_at timestamptz not null default now()
);

comment on column public.document_extractions.extracted_data is
  'Structured JSON from the OCR provider, shaped per kind (see src/lib/ocr/types.ts). Null if the attempt failed — see error.';
comment on column public.document_extractions.model_name is
  'e.g. "gemini-2.5-pro". Recorded per attempt so a future provider swap does not lose history of which model produced which result.';

alter table public.document_extractions enable row level security;

-- Same visibility pattern as public.documents: re-checks the parent
-- document's case visibility via EXISTS, joining through documents ->
-- loan_cases, so access can never be broader than access to the document
-- itself.
drop policy if exists "document_extractions_select" on public.document_extractions;
create policy "document_extractions_select" on public.document_extractions
for select
using (
  exists (
    select 1 from public.documents d
    join public.loan_cases lc on lc.id = d.loan_case_id
    where d.id = document_extractions.document_id
  )
);

drop policy if exists "document_extractions_insert_staff" on public.document_extractions;
create policy "document_extractions_insert_staff" on public.document_extractions
for insert
with check (
  exists (
    select 1 from public.documents d
    join public.loan_cases lc on lc.id = d.loan_case_id
    where d.id = document_extractions.document_id
  )
  and exists (
    select 1 from public.user_profiles up
    where up.auth_user_id = auth.uid()
      and up.role in ('super_admin', 'banker', 'property_agent', 'mortgage_outsource_agent')
  )
);
-- No update/delete policy: every OCR attempt is an immutable, append-only
-- record — a re-run creates a new row, it never edits or removes a past one.

-- ============================================================================
-- End of OCR Integration migration
-- ============================================================================
