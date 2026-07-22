/**
 * @deprecated This flat client predates the Supabase SSR integration (Sprint 6) and
 * is kept only so this file isn't left dangling. It has no cookie/session
 * awareness, so Row Level Security can never see an authenticated user through it.
 *
 * Do not import from here anymore:
 *  - In Client Components, use `@/lib/supabase/client` (`createClient()`).
 *  - In Server Components, Server Actions, and Route Handlers, use
 *    `@/lib/supabase/server` (`await createClient()`).
 *
 * This re-export exists purely for backward compatibility and just delegates to
 * the same browser client factory used everywhere else, so there is only one
 * place that actually constructs a Supabase client per environment.
 */
export { createClient as createLegacyBrowserClient } from "@/lib/supabase/client";
