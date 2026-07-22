import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Paths that never require authentication. Everything else handled by the proxy's
 * matcher (see src/proxy.ts) is treated as a protected application route, which
 * covers: /, /loan-cases, /loan-cases/*, /customers, /documents, /bankers,
 * /analytics, /settings, and any future page added under the app.
 */
const PUBLIC_PATH_PREFIXES = [
  "/login",
  "/auth", // reserved for future auth callback routes (e.g. email confirmation, OAuth)
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Refreshes the Supabase auth session on every request and enforces route
 * protection. This must run on the Node.js runtime (the Next.js 16 default for
 * proxy.ts) since it talks to Supabase's auth server.
 *
 * IMPORTANT: do not add any logic between createServerClient(...) and
 * supabase.auth.getUser() below — the Supabase SSR docs specifically warn that
 * doing so can cause random, hard-to-debug logouts.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("[proxy] Missing Supabase environment variables; skipping auth check.");
    return supabaseResponse;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
      },
    },
  });

  // Do not run other code between createServerClient and auth.getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isLoginPage = pathname === "/login";

  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Must return supabaseResponse as-is (with its cookies) or the browser and
  // server session can fall out of sync.
  return supabaseResponse;
}
