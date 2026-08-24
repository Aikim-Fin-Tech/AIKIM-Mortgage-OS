"use server";

import { createClient } from "@/lib/supabase/server";
import { buildForgotPasswordResult, type ForgotPasswordState } from "@/lib/auth/build-forgot-password-result";

export type { ForgotPasswordState } from "@/lib/auth/build-forgot-password-result";

/**
 * The only host recovery emails are ever allowed to redirect to. Hardcoded
 * (not derived from the incoming request's Origin/Host header) so a
 * malicious or misconfigured request can never redirect a genuine password
 * reset link to an attacker-controlled or stale (e.g. localhost) host — per
 * the approved scope, "only to the approved production reset route under
 * https://www.aikim.tech". This must also be present in the Supabase
 * project's Auth → URL Configuration → Redirect URLs allow-list, or
 * Supabase itself will reject it; that dashboard setting is out of scope
 * here (see the accompanying report) and is not something this code can
 * configure.
 */
const PRODUCTION_RECOVERY_REDIRECT_URL = "https://www.aikim.tech/auth/confirm";

export async function requestPasswordReset(
  _prevState: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    return { message: "Please enter your email address.", submitted: false };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: PRODUCTION_RECOVERY_REDIRECT_URL,
  });

  if (error) {
    // Log only the error code, never the submitted email address — an
    // "email not found"-shaped error here must never reach the client or a
    // log line an attacker could correlate back to a specific address.
    console.error(`[requestPasswordReset] Supabase call failed. code=${error.code ?? "unknown"}`);
  }

  return buildForgotPasswordResult();
}
