# Testing Strategy

## Current reality

- No automated test framework is present in this repo (no Jest/Vitest/Playwright
  config, no `__tests__` directories).
- Verification today is manual: `npx tsc --noEmit`, `npx eslint .`, and exercising the
  flow in a browser — see the `qa-engineer` agent.

## Current manual process

1. Typecheck and lint (see [review-checklist.md](review-checklist.md)).
2. Exercise the golden path for the affected flow in a running dev server.
3. Check edge cases explicitly: empty states (no cases/documents), RLS-empty results
   (should render as empty, not error), and existing partial-failure banners
   (`data.errors.length > 0` pattern).
4. Check role-based access for at least one staff role and one non-staff role where
   relevant, since RLS is the real gate (see
   [../architecture/security.md](../architecture/security.md)).

## Planned

> **Status: Planned.** Not implemented.

- Automated test runner (candidate: Vitest, given Next.js 16 + React 19).
- Component/unit tests for `lib/database/*.ts` mapping functions (label mapping,
  IC masking) — pure functions, cheap to test.
- Integration tests against a local/seeded Supabase instance for RLS-sensitive paths.
- CI pipeline running typecheck + lint + tests on every PR, once
  [git-workflow.md](git-workflow.md)'s PR flow is adopted.
