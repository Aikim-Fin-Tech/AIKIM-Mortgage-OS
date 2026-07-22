import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Next.js 16 network boundary (replaces middleware.ts). Runs on the Node.js
 * runtime. Refreshes the Supabase session cookie on every matched request and
 * redirects unauthenticated visitors away from protected app routes / signed-in
 * visitors away from /login. See src/lib/supabase/proxy.ts for the actual logic.
 */
export default async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match every request path except:
     * - _next/static (static build assets)
     * - _next/image (image optimization files)
     * - favicon.ico
     * - common static file extensions
     * This keeps static files, Next.js internals, and the favicon out of the
     * auth check entirely, as required.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
