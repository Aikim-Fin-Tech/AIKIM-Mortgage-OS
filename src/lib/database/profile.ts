import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Read-only data access for the My Profile page. Everything here is scoped
 * to the CURRENT session's own user — never accepts an id parameter, so it
 * cannot be used to look up anyone else's profile even by accident.
 */

export type ProfileData = {
  /** public.user_profiles.id — shown read-only on the page, never client-editable. */
  userProfileId: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: string;
  /** Present only when role === "banker" and a linked bankers row exists. */
  banker: {
    id: string;
    fullName: string;
    bankName: string | null;
    branch: string | null;
    phone: string | null;
  } | null;
  error: string | null;
};

export async function getProfileData(): Promise<ProfileData | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("id, full_name, phone, role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    console.error(`[getProfileData] user_profiles lookup failed. code=${profileError?.code ?? "not_found"}`);
    return null;
  }

  let banker: ProfileData["banker"] = null;

  if (profile.role === "banker") {
    const { data: bankerRow, error: bankerError } = await supabase
      .from("bankers")
      .select("id, full_name, bank_name, branch, phone")
      .eq("user_profile_id", profile.id)
      .maybeSingle();

    if (bankerError) {
      console.error(`[getProfileData] bankers lookup failed. code=${bankerError.code ?? "unknown"}`);
    } else if (bankerRow) {
      banker = {
        id: bankerRow.id,
        fullName: bankerRow.full_name,
        bankName: bankerRow.bank_name,
        branch: bankerRow.branch,
        phone: bankerRow.phone,
      };
    }
  }

  return {
    userProfileId: profile.id,
    email: user.email ?? "",
    fullName: profile.full_name,
    phone: profile.phone,
    role: profile.role,
    banker,
    error: null,
  };
}
