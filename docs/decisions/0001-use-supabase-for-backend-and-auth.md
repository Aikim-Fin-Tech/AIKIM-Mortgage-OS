# 0001. Use Supabase for backend, auth, and data access

Status: Accepted (retroactive)
Date: 2026-07-21

## Context

The product needs auth, a relational database, and row-level authorization, without
maintaining a separate backend service.

## Decision

Use Supabase (Postgres + Auth + PostgREST) as the entire backend. The Next.js app
talks to it via `@supabase/supabase-js` / `@supabase/ssr`; there is no custom API
server.

## Consequences

- No backend deployment/ops burden beyond the Supabase project itself.
- Authorization logic lives in Postgres (RLS), not in application middleware — see
  [0002](0002-rls-as-sole-authorization-boundary.md).
- Schema changes require the Supabase SQL Editor workflow (see
  [../../CLAUDE.md#migration-policy](../../CLAUDE.md#migration-policy)) since there's
  no ORM-driven migration tool in use.
- Tied to Supabase/PostgREST's query and RPC model for anything beyond simple CRUD.

## Evidence

`package.json` (`@supabase/ssr`, `@supabase/supabase-js`), `src/lib/supabase/*.ts`,
every file under `src/lib/database/`.
