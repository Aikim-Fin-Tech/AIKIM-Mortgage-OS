# Coding Standards

## Server vs. Client Components

- Server Component by default. `"use client"` only for state/effects/browser APIs.
- Client-safe types used by both live in a separate file (e.g.
  `new-loan-case-types.ts`) so server-only modules stay `import "server-only"`-guarded.

## Data access

- All reads in `src/lib/database/*.ts`, one file per concern.
- Wrap Supabase calls in `try/catch`; never throw for expected failures (query error,
  RLS-empty result, missing row).
- Return `{ data/field, error: string | null }`; log `code`/`message` only, never PII
  or the client/cookies/headers.
- Map raw enum values to display labels via a local `Record` constant — never render
  a raw enum in the UI.

## Mutations

- Server Actions (`"use server"`) in `src/app/**/actions.ts`, or a Postgres RPC for
  multi-table atomic operations. Never mutate from a page/component directly.
- Zod-validate raw `FormData` before touching Supabase. Use `.superRefine()` for
  cross-field rules.
- Return `{ fieldErrors, formError }` from `useActionState`.

## Error messages

- Server logs: real error code/message.
- Client-facing: always generic, never a raw Supabase error or stack trace, never
  distinguishable enough to leak account existence.

## Naming

- `case_number` (not row UUID) is the human-facing identifier in URLs and lookups.
- `snake_case` at the DB boundary, `camelCase`/`Title Case` after mapping — don't mix
  past the data-access layer.

## Styling

- Tailwind CSS 4 utilities only, slate/emerald palette. No CSS-in-JS.
- No dark mode currently — it was deliberately removed; don't reintroduce without a
  product decision.

## Before calling anything done

1. `npx tsc --noEmit` — zero errors.
2. `npx eslint .` — zero errors.
3. Exercise the change in a browser, not just types/lint.
