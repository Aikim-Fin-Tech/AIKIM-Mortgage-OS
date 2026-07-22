import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for use in Server Components, Server Actions, and Route Handlers.
 *
 * Uses the Next.js `cookies()` API so the client can read the visitor's auth cookies
 * and (where possible) refresh them. This is what lets Row Level Security see the
 * signed-in user via `auth.uid()` on the server — the old flat anon client in
 * `@/lib/supabase` never had access to cookies and so never carried a session.
 *
 * Only the public anon key is used here. The service_role key must never appear in
 * application code.
 */
export async function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env.local file (see .env.local.example).",
    );
  }

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // setAll was called from a Server Component (which can't write cookies).
          // Safe to ignore as long as src/proxy.ts is refreshing the session on
          // every request, which it is.
        }
      },
    },
  });
}
