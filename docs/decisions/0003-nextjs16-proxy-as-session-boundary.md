# 0003. Next.js 16 `proxy.ts` as the session/auth boundary

Status: Accepted (retroactive)
Date: 2026-07-21

## Context

Next.js 16 replaces `middleware.ts` with `proxy.ts` as the network boundary. The app
needs to refresh Supabase session cookies and gate protected routes on every request.

## Decision

`src/proxy.ts` calls `updateSession()` (`src/lib/supabase/proxy.ts`) on every matched
request (all routes except static assets), refreshing the session cookie and
redirecting unauthenticated visitors to `/login` before any page renders.

## Consequences

- Pages don't need to re-check "is this user logged in" — they can assume `proxy.ts`
  already gated access, and only re-derive the user for display purposes.
- The specific ordering constraint (no logic between `createServerClient(...)` and
  `supabase.auth.getUser()`) must be preserved on every future edit to this file, per
  Supabase's own SSR guidance, or sessions can randomly drop.
- Tied to Next.js 16's `proxy.ts` convention — reverting to an older Next.js version
  would require reintroducing `middleware.ts`.

## Evidence

`src/proxy.ts`, `src/lib/supabase/proxy.ts`.
