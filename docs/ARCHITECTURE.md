# Architecture

Consolidated architecture reference. Full detail on specific areas lives in
[docs/architecture/overview.md](architecture/overview.md) (system design),
[docs/architecture/security.md](architecture/security.md) (security posture),
and the [ADRs](decisions/README.md) (why each decision was made). This document
exists so a new AI/developer doesn't have to read all of those first.

## Frontend

- **Next.js 16.2.10** (App Router, Turbopack). This version has breaking changes
  from typical training data — see root `AGENTS.md` before writing framework
  code, and read `node_modules/next/dist/docs/` for anything unfamiliar.
- **React 19.2.4**, **Tailwind CSS 4**. Slate/emerald palette, no dark mode
  (deliberately removed).
- Server Components by default; `"use client"` only where interactivity is
  needed. Full conventions: [docs/engineering/coding-standards.md](engineering/coding-standards.md).
- No client-side global state library. State is server-derived props or local
  `useState`/`useActionState`.

## Backend

**There is no separate backend service.** The Next.js app talks directly to
Supabase via `@supabase/supabase-js` / `@supabase/ssr`. "Backend logic" is:
- **Server Actions** (`"use server"` files) for mutations — see
  [API_REFERENCE.md](API_REFERENCE.md).
- **Postgres RPCs** for atomic multi-table writes (e.g. `create_loan_case`).
- **TypeScript services** (`src/lib/mortgage-rules/`, `src/lib/ocr/`,
  `src/lib/loan-health/`) for logic that must not live in SQL — see
  [RULE_ENGINE.md](RULE_ENGINE.md) and [AI_ENGINE.md](AI_ENGINE.md) for why.

## Database

**Supabase Postgres.** Full table/RLS/migration inventory:
[DATABASE.md](DATABASE.md). Headline fact: **no migration has been executed
against the live database by any agent** — everything is an authored `.sql`
file pending human review.

## Supabase

- **Auth**: email/password via Supabase Auth. `src/lib/supabase/{client,server,proxy}.ts`
  are the three client factories — never cross-use them (see
  [docs/architecture/overview.md](architecture/overview.md)).
- **Storage**: one bucket, `loan-documents` (private, 20MB limit,
  PDF/JPG/PNG only, enforced at the bucket level). Objects keyed
  `<loan_case_id>/<uuid>-<file_name>`.
- **PostgREST**: the entire "API" — no custom REST/GraphQL layer.
- **Edge Functions**: **not used anywhere in this project.** No
  `supabase/functions/` directory exists.

## Authentication

`src/proxy.ts` (Next.js 16's replacement for `middleware.ts`) refreshes the
session cookie and redirects unauthenticated visitors to `/login` before any
page renders, on every request except static assets. Server-side identity is
always re-verified via `supabase.auth.getUser()`, never trusted from the
browser. See [ADR 0003](decisions/0003-nextjs16-proxy-as-session-boundary.md).

## Storage

Covered under Supabase above. Full reasoning: [ADR 0005](decisions/0005-document-storage-model.md).

## Edge Functions

**Not implemented. Not planned.** Zero references anywhere in this repository.
If a future task requires one, it is new scope — do not assume any exists.

## AI Engine

**Gemini 2.5 Pro**, for two purposes: OCR field extraction and AI Case Summary's
next-action text. Full detail: [AI_ENGINE.md](AI_ENGINE.md). Headline
architectural fact: the matching/business logic (rule engine, health score,
next-action rules) is deliberately **not** AI — only OCR and one summary field
call an LLM at all.

## n8n

**Not implemented. Not planned. Not previously discussed in this project before
this documentation pass.** If requested in the future, treat as entirely new
scope requiring its own product/architecture decision.

## WhatsApp

**Not implemented.** Was scoped as an MVP P0 item (receive documents, attach to
loan case, explicitly no chatbot/automation) but never started — blocked on a
provider choice (Meta Cloud API vs. a BSP like Twilio/360dialog) and on this
project having a real deployment with a public HTTPS webhook, neither of which
exist yet. See [TODO.md](TODO.md) Open Questions.

## API

No separate REST/GraphQL API. Full Server Action and RPC inventory:
[API_REFERENCE.md](API_REFERENCE.md).

## MCP

**Not part of the AIKIM product.** MCP tooling is part of the Claude Code
development environment used to *build* this project (see `.claude/`), not a
feature of the shipped application itself. Do not conflate the two.

## GitHub Structure

- Remote: `https://github.com/Aikim-Fin-Tech/AIKIM-Mortgage-OS.git`
- Single branch: `main`
- No CI/CD configuration exists
- Commit history: see [CHANGELOG.md](CHANGELOG.md)
- **The latest checkpoint commit has not been pushed** — confirm with `git
  status` / `git log` before assuming remote state matches local.
