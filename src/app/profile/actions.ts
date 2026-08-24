"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseBankerFormValues, parseProfileFormValues } from "@/lib/profile/parse-profile-form";
import { validatePasswordConfirmation, validatePasswordStrength } from "@/lib/auth/password-validation";

/**
 * Every action below resolves "whose row" exclusively from the current
 * session (auth.uid()) — never from a client-supplied id, user_profile_id,
 * or banker id. This is enforced twice over: this file never reads such a
 * field out of FormData in the first place (see parse-profile-form.ts), and
 * the DB-level RLS policies + column-level GRANTs added in
 * supabase/migrations/20260824010000_profile_self_service_update.sql are
 * the real boundary regardless of what this application code does or fails
 * to check (per docs/decisions/0002-rls-as-sole-authorization-boundary.md).
 * role, email, and every identity column are never included in any UPDATE
 * here — not filtered out, simply never referenced.
 */

export type ProfileActionState = {
  error: string | null;
  success: boolean;
};

const initialResult: ProfileActionState = { error: null, success: false };

async function requireSessionUserId(): Promise<{ userId: string | null; error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { userId: null, error: "Your session has expired. Please sign in again." };
  return { userId: user.id, error: null };
}

export async function updateProfile(_prevState: ProfileActionState, formData: FormData): Promise<ProfileActionState> {
  const parsed = parseProfileFormValues(formData);
  if (!parsed.ok) return { ...initialResult, error: parsed.error };

  const { userId, error: sessionError } = await requireSessionUserId();
  if (sessionError || !userId) return { ...initialResult, error: sessionError };

  const supabase = await createClient();
  const { error } = await supabase
    .from("user_profiles")
    .update({ full_name: parsed.values.fullName, phone: parsed.values.phone })
    .eq("auth_user_id", userId);

  if (error) {
    console.error(`[updateProfile] update failed. code=${error.code ?? "unknown"}`);
    return { ...initialResult, error: "Something went wrong while saving your profile. Please try again." };
  }

  revalidatePath("/profile");
  return { error: null, success: true };
}

export async function updateBankerDetails(
  _prevState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const parsed = parseBankerFormValues(formData);
  if (!parsed.ok) return { ...initialResult, error: parsed.error };

  const { userId, error: sessionError } = await requireSessionUserId();
  if (sessionError || !userId) return { ...initialResult, error: sessionError };

  const supabase = await createClient();

  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("id, role")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (profileError || !profile) {
    console.error(`[updateBankerDetails] user_profiles lookup failed. code=${profileError?.code ?? "not_found"}`);
    return { ...initialResult, error: "Something went wrong. Please try again." };
  }

  if (profile.role !== "banker") {
    return { ...initialResult, error: "Only Banker accounts have banking details to edit." };
  }

  const { error } = await supabase
    .from("bankers")
    .update({
      full_name: parsed.values.fullName,
      bank_name: parsed.values.bankName,
      branch: parsed.values.branch,
      phone: parsed.values.phone,
    })
    .eq("user_profile_id", profile.id);

  if (error) {
    console.error(`[updateBankerDetails] update failed. code=${error.code ?? "unknown"}`);
    return { ...initialResult, error: "Something went wrong while saving your banking details. Please try again." };
  }

  revalidatePath("/profile");
  return { error: null, success: true };
}

export async function changePassword(_prevState: ProfileActionState, formData: FormData): Promise<ProfileActionState> {
  const password = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmNewPassword") ?? "");

  const strengthError = validatePasswordStrength(password);
  if (strengthError) return { ...initialResult, error: strengthError };

  const confirmError = validatePasswordConfirmation(password, confirmPassword);
  if (confirmError) return { ...initialResult, error: confirmError };

  const { userId, error: sessionError } = await requireSessionUserId();
  if (sessionError || !userId) return { ...initialResult, error: sessionError };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    console.error(`[changePassword] updateUser failed. code=${error.code ?? "unknown"}`);
    return { ...initialResult, error: "Something went wrong while changing your password. Please try again." };
  }

  return { error: null, success: true };
}
