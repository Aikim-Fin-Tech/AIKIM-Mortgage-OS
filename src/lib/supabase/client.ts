import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for use in Client Components ("use client") only.
 *
 * Reads the public URL and anon key from NEXT_PUBLIC_* environment variables —
 * these are safe to expose in the browser (they are not the service_role key).
 * Never import this from a Server Component, Server Action, or route handler;
 * use `@/lib/supabase/server` there instead so cookies are handled correctly.
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env.local file (see .env.local.example).",
    );
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
