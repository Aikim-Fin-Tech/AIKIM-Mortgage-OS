import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Recovery-link callback. A password-reset email's link points here with
 * `?token_hash=...&type=recovery` (Supabase's standard OTP-link shape — not
 * the OAuth PKCE `code` flow, which this app doesn't use anywhere, so
 * `exchangeCodeForSession` is deliberately not used here).
 *
 * verifyOtp() establishes a real session for the token's user on success —
 * that session is what lets /reset-password call auth.updateUser() next.
 * On failure (expired/already-used/malformed token), no session is created;
 * we redirect to /reset-password anyway (it's in proxy.ts's public-path
 * list) so that page's own server-side "do I have a user?" check renders
 * the expired-link state instead of proxy.ts bouncing an unauthenticated
 * visitor to /login before that state ever has a chance to render.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

    if (!error) {
      return NextResponse.redirect(new URL("/reset-password", origin));
    }

    console.error(`[auth/confirm] verifyOtp failed. code=${error.code ?? "unknown"}`);
  }

  return NextResponse.redirect(new URL("/reset-password?error=invalid_link", origin));
}
