import "server-only";
import { createClient } from "@/lib/supabase/server";

export type CurrentBanker = {
  id: string;
  fullName: string;
  bankName: string | null;
};

/**
 * Resolves the public.bankers row linked to the currently authenticated
 * user, via user_profiles.auth_user_id = auth.uid() -> bankers.user_profile_id
 * — the same two-step lookup already used by getProfileData() for the My
 * Profile page. Never accepts an id parameter, so it can only ever resolve
 * the caller's own record, never another Banker's.
 *
 * Returns null when there is no authenticated user, no user_profiles row,
 * or no linked bankers row (e.g. the caller isn't a Banker). Never throws.
 */
export async function getCurrentBanker(): Promise<CurrentBanker | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    if (profileError) {
      console.error(`[getCurrentBanker] user_profiles lookup failed. code=${profileError.code ?? "unknown"}`);
    }
    return null;
  }

  const { data: banker, error: bankerError } = await supabase
    .from("bankers")
    .select("id, full_name, bank_name")
    .eq("user_profile_id", profile.id)
    .maybeSingle();

  if (bankerError || !banker) {
    if (bankerError) {
      console.error(`[getCurrentBanker] bankers lookup failed. code=${bankerError.code ?? "unknown"}`);
    }
    return null;
  }

  return { id: banker.id, fullName: banker.full_name, bankName: banker.bank_name };
}
