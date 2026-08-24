import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { decideRecoveryOtpVerification } from "@/lib/auth/decide-recovery-otp-verification";

/**
 * Recovery-link callback. A password-reset email's link points here with
 * `?token_hash=...&type=recovery` (Supabase's standard OTP-link shape — not
 * the OAuth PKCE `code` flow, which this app doesn't use anywhere, so
 * `exchangeCodeForSession` is deliberately not used here).
 *
 * Only `type=recovery` is ever accepted — decideRecoveryOtpVerification
 * rejects a missing/malformed/any-other-type request before verifyOtp() is
 * called at all, and the call below passes the literal `"recovery"` string,
 * never the request's own `type` value, so no other OTP type (signup,
 * invite, magiclink, email_change, email) can ever establish a session
 * through this route, regardless of what a request supplies.
 *
 * verifyOtp() establishes a real session for the token's user on success —
 * that session is what lets /reset-password call auth.updateUser() next.
 * On failure (rejected type, expired/already-used/malformed token), no
 * session is created; we redirect to /reset-password anyway (it's in
 * proxy.ts's public-path list) so that page's own server-side "do I have a
 * user?" check renders the expired-link state instead of proxy.ts bouncing
 * an unauthenticated visitor to /login before that state ever has a chance
 * to render.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = request.nextUrl;
  const decision = decideRecoveryOtpVerification(searchParams.get("token_hash"), searchParams.get("type"));

  if (decision.shouldVerify) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: decision.tokenHash });

    if (!error) {
      return NextResponse.redirect(new URL("/reset-password", origin));
    }

    console.error(`[auth/confirm] verifyOtp failed. code=${error.code ?? "unknown"}`);
  }

  return NextResponse.redirect(new URL("/reset-password?error=invalid_link", origin));
}
