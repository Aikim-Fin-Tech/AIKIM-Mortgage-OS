# Architecture Overview

## Stack

- Next.js 16.2.10 (App Router) — breaking changes from typical training data, see
  `AGENTS.md` before writing framework code.
- React 19.2.4, Tailwind CSS 4.
- Supabase (Postgres + Auth + RLS + PostgREST) — no separate backend service.
- Zod for Server Action input validation.

## Request boundary: `src/proxy.ts`

Next.js 16 replaces `middleware.ts` with `proxy.ts`. See
[../decisions/0003-nextjs16-proxy-as-session-boundary.md](../decisions/0003-nextjs16-proxy-as-session-boundary.md).
It refreshes the Supabase session cookie and redirects unauthenticated visitors away
from any route except `/login` and `/auth`, on every matched request, before any page
renders.

## Supabase client factories

| File | Context | Notes |
|---|---|---|
| `src/lib/supabase/client.ts` | Client Components | Anon key only |
| `src/lib/supabase/server.ts` | Server Components/Actions | Cookie-aware, anon key only |
| `src/lib/supabase/proxy.ts` | `proxy.ts` only | Refreshes session cookies |
| `src/lib/supabase.ts` | **Deprecated** | RLS-blind, do not use in new code |

## Route structure

- `src/app/(app)/` — route group for authenticated pages, shares `(app)/layout.tsx`.
- `src/app/login/` — public route (plus `/auth`, reserved).
- Case detail is keyed by human-readable `case_number` (e.g. `ML-2026-001`), not UUID.

## Data flow

```
Page (Server Component) → lib/database/*.ts (read-only, RLS-scoped, never throws)
                         → Client Components (plain serializable props)

Form submit → app/**/actions.ts (Server Action) → Zod → RPC or direct mutation
            → revalidatePath() + redirect()
```

Multi-table atomic mutations go through a `SECURITY INVOKER` Postgres RPC — see
[../decisions/0004-atomic-multitable-writes-via-security-invoker-rpc.md](../decisions/0004-atomic-multitable-writes-via-security-invoker-rpc.md).

## What does not exist

- No separate backend/API server.
- No client-side global state library.
- No test suite (see
  [../engineering/testing-strategy.md](../engineering/testing-strategy.md)).
