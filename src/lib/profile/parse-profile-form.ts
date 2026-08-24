/**
 * Pure, no I/O — parses the My Profile forms' FormData into exactly the
 * fields each Server Action is allowed to write. Deliberately reads only
 * the named fields listed below — role, email, id, auth_user_id, and
 * user_profile_id are never read from FormData anywhere in this module, so
 * a client submitting extra fields with those names has no way to make
 * them reach the caller. The accompanying Server Actions (src/app/profile/
 * actions.ts) additionally resolve "which row" exclusively from the
 * server-side session, never from any of these parsed values either.
 */

export type ParsedProfileFields = { fullName: string; phone: string | null };
export type ParsedBankerFields = { fullName: string; bankName: string | null; branch: string | null; phone: string | null };
export type ParseResult<T> = { ok: true; values: T } | { ok: false; error: string };

function normalizeOptional(value: FormDataEntryValue | null): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

export function parseProfileFormValues(formData: FormData): ParseResult<ParsedProfileFields> {
  const fullName = String(formData.get("fullName") ?? "").trim();
  if (!fullName) return { ok: false, error: "Full name is required." };

  return { ok: true, values: { fullName, phone: normalizeOptional(formData.get("phone")) } };
}

export function parseBankerFormValues(formData: FormData): ParseResult<ParsedBankerFields> {
  const fullName = String(formData.get("bankerFullName") ?? "").trim();
  if (!fullName) return { ok: false, error: "Full name is required." };

  return {
    ok: true,
    values: {
      fullName,
      bankName: normalizeOptional(formData.get("bankName")),
      branch: normalizeOptional(formData.get("branch")),
      phone: normalizeOptional(formData.get("bankerPhone")),
    },
  };
}
