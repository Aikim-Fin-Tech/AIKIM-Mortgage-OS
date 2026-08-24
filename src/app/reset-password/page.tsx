import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

/**
 * Reached either via /auth/confirm after a successful verifyOtp() (a real
 * session now exists) or directly with ?error=invalid_link when verifyOtp
 * failed (no session). The actual state that decides which UI renders is
 * always re-derived here server-side from the session — the query param is
 * only used for a slightly more specific expired-link message, never
 * trusted as the sole signal.
 */
export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-full items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold text-white">
            A
          </span>
          <h1 className="mt-4 text-lg font-semibold tracking-tight text-slate-900">
            AIKIM <span className="text-blue-600">Mortgage OS</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">Set a new password.</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          {user ? (
            <ResetPasswordForm />
          ) : (
            <div className="space-y-4 text-center">
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
                This reset link is invalid or has expired. Please request a new one.
              </p>
              <Link href="/forgot-password" className="text-sm font-medium text-blue-600 hover:text-blue-700">
                Request a new reset link
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
