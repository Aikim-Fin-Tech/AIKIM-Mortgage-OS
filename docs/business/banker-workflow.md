# Banker Workflow

How the `banker` role uses the product. Status legend: **Implemented** (live today),
**Planned** (not built yet) — see
[../engineering/ai-development-workflow.md](../engineering/ai-development-workflow.md)
for the labeling convention.

## 1. Sign in — **Implemented**

`/login` with email/password. `proxy.ts` redirects to `/` on success. Role/name are
re-derived server-side from `user_profiles`, never trusted from the client.

## 2. Dashboard (`/`) — **Implemented**

Active case count, pending documents, approval rate, documents processed, pipeline by
stage, recent cases — all RLS-scoped.

> **Known gap**: "Activity today" and the notification bell read `audit_logs`, which
> is `super_admin`-only by RLS today — a banker sees zero there, which is correct per
> current RLS, not a bug.

## 3. Loan Cases (`/loan-cases`) — **Implemented**

Browse/filter the case list.

> **Known gap**: bank/banker filter dropdowns use a hardcoded mock list
> (`src/lib/loan-cases-data.ts`), not real data — see
> [../product/roadmap.md](../product/roadmap.md).

## 4. Case detail (`/loan-cases/[id]`) — **Implemented**

Customer info (IC masked), loan info, banker info, document summary, activity
timeline (empty for non-`super_admin`, per the RLS gap above).

Case Notes and Follow-up sections on this page are **Planned** — currently permanent
"not yet available" stubs, no backing table exists.

## 5. Creating a case (`/loan-cases/new`) — **Implemented**

Any `STAFF_ROLES` member creates a case for an existing or new customer atomically via
`create_loan_case`. See [mortgage-workflow.md](mortgage-workflow.md).

## 6. Document handling — **Implemented** (Sprint 6.1)

Documents tab on the case detail page: upload (PDF/JPG/PNG, 20MB max), list (file
name, type, uploader, time, size, status), preview (PDF/image), download, delete.
Files live in the private `loan-documents` Supabase Storage bucket, scoped to the
same visibility as the case itself.

> **Known gap**: the supporting migration adds the metadata columns this feature
> needs to `documents` and has not been confirmed run against the live database — see
> [../decisions/0005-document-storage-model.md](../decisions/0005-document-storage-model.md).

Verify/reject actions on a document's status are **Planned**, not built — this sprint
only covers upload/list/preview/download/delete.

## 7. Stage/status transitions — **Planned**

No UI exists to change `stage`/`status` after case creation.
