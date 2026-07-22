# 0005. Document storage model for Sprint 6.1

Status: Proposed (migration authored, not confirmed run against the live database)
Date: 2026-07-21

## Context

Sprint 6.1 needs to let staff upload, list, preview, download, and delete files
(PDF/JPG/PNG, up to 20MB) attached to a loan case, respecting the same visibility
rules as the case itself. The existing `documents` table already tracks a document's
status and type but has no columns for the file itself (name, storage location,
size, MIME type, uploader) — see the audit note in `docs/architecture/database.md`.
No live schema export was available to confirm this with certainty (see "Audit
limitation" below).

## Decision

- Store files in a private Supabase Storage bucket `loan-documents`, keyed
  `<loan_case_id>/<uuid>-<file_name>`.
- Add file metadata to the existing `documents` table via additive,
  `IF NOT EXISTS` columns (`file_name`, `storage_path`, `file_size`, `mime_type`,
  `uploaded_by_user_id`, `storage_provider`, `document_hash`, `processing_status`)
  rather than a new table — the row already represents "one document attached to one
  case," which is exactly what's needed. `storage_provider` (default `'supabase'`)
  and `processing_status` (default `'UPLOADED'`) are plain text, not enums — this
  sprint doesn't define their full future value sets. `document_hash` is nullable
  and unused by any code yet, reserved for a future integrity/dedup check.
- Enforce the type/size constraint at the bucket level (`file_size_limit`,
  `allowed_mime_types`), not only in the client — Supabase Storage rejects anything
  outside PDF/JPG/PNG or over 20MB regardless of what the browser sends.
- Authorize both the bucket's `storage.objects` and the `documents` table's new
  insert/delete policies by re-checking visibility of the matching `loan_cases` row
  via an `EXISTS` subquery, rather than re-implementing whatever
  `loan_cases_select_scope` actually does. A user's document access can therefore
  never exceed their case access, without this migration needing to know that
  policy's exact definition.
- Files are uploaded directly from the browser to Storage (not proxied through a
  Server Action), then a small Server Action records the metadata row — this avoids
  any Next.js Server Action body-size limit entirely for the 20MB file itself.

## Consequences

- One additive migration instead of a new table — less schema surface, reuses the
  `documents` row every existing summary/reporting query already joins against.
- Storage access control is only as good as the `EXISTS (select ... loan_cases)`
  subquery pattern — if `loan_cases_select_scope` itself has a gap, this inherits it
  by design (that's the intended coupling, not an oversight).
- Every preview/download issues a fresh 60-second signed URL rather than a permanent
  public link — slightly more round trips, but nothing about a document is ever
  publicly reachable by URL alone.

## Audit limitation

This session had no database credentials beyond the public anon/publishable key; the
live project's PostgREST schema-introspection endpoint requires a secret key and
correctly rejected the anon key. The exact current columns of `public.documents`
could not be confirmed before writing the migration. Every `ALTER TABLE` in
`supabase/migrations/20260721010000_document_management_mvp.sql` uses
`ADD COLUMN IF NOT EXISTS` specifically so it's a no-op if any of these columns
already exist — please verify the real column list in the Supabase SQL Editor before
running it, and adjust the migration first if a column already exists under a
different name.

## Evidence

`supabase/migrations/20260721010000_document_management_mvp.sql`,
`src/lib/database/documents.ts`,
`src/app/(app)/loan-cases/[id]/documents/actions.ts`.
