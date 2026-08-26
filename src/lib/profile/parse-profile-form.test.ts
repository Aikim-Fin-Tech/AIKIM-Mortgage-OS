import { describe, expect, it } from "vitest";
import { parseBankerFormValues, parseProfileFormValues } from "./parse-profile-form";

function formDataWith(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.set(key, value);
  return fd;
}

describe("parseProfileFormValues", () => {
  it("returns the trimmed full name and phone on valid input", () => {
    const result = parseProfileFormValues(formDataWith({ fullName: "  Jane Tan  ", phone: " +60123456789 " }));
    expect(result).toEqual({ ok: true, values: { fullName: "Jane Tan", phone: "+60123456789" } });
  });

  it("normalizes a blank phone to null rather than an empty string", () => {
    const result = parseProfileFormValues(formDataWith({ fullName: "Jane Tan", phone: "   " }));
    expect(result).toEqual({ ok: true, values: { fullName: "Jane Tan", phone: null } });
  });

  it("rejects an empty full name", () => {
    const result = parseProfileFormValues(formDataWith({ fullName: "  ", phone: "" }));
    expect(result).toEqual({ ok: false, error: "Full name is required." });
  });

  it("never reads or returns role, email, id, or user_profile_id even if present in the submitted FormData", () => {
    const fd = formDataWith({
      fullName: "Jane Tan",
      phone: "",
      role: "super_admin",
      email: "someone-else@aikim.com.my",
      id: "11111111-1111-1111-1111-111111111111",
      user_profile_id: "22222222-2222-2222-2222-222222222222",
      auth_user_id: "33333333-3333-3333-3333-333333333333",
    });
    const result = parseProfileFormValues(fd);
    expect(result).toEqual({ ok: true, values: { fullName: "Jane Tan", phone: null } });
    if (result.ok) {
      expect(Object.keys(result.values)).toEqual(["fullName", "phone"]);
    }
  });
});

describe("parseBankerFormValues", () => {
  it("returns all 4 trimmed fields on valid input", () => {
    const result = parseBankerFormValues(
      formDataWith({ bankerFullName: " Sarah Lim ", bankName: " Maybank ", branch: " KLCC ", bankerPhone: " 012-3456789 " }),
    );
    expect(result).toEqual({
      ok: true,
      values: { fullName: "Sarah Lim", bankName: "Maybank", branch: "KLCC", phone: "012-3456789" },
    });
  });

  it("normalizes blank optional fields to null", () => {
    const result = parseBankerFormValues(formDataWith({ bankerFullName: "Sarah Lim", bankName: "", branch: "", bankerPhone: "" }));
    expect(result).toEqual({ ok: true, values: { fullName: "Sarah Lim", bankName: null, branch: null, phone: null } });
  });

  it("rejects an empty full name", () => {
    const result = parseBankerFormValues(formDataWith({ bankerFullName: "", bankName: "Maybank", branch: "", bankerPhone: "" }));
    expect(result).toEqual({ ok: false, error: "Full name is required." });
  });

  it("never reads or returns role, user_profile_id, id, or email even if present in the submitted FormData", () => {
    const fd = formDataWith({
      bankerFullName: "Sarah Lim",
      bankName: "Maybank",
      branch: "KLCC",
      bankerPhone: "",
      role: "super_admin",
      user_profile_id: "11111111-1111-1111-1111-111111111111",
      id: "22222222-2222-2222-2222-222222222222",
      email: "someone-else@aikim.com.my",
    });
    const result = parseBankerFormValues(fd);
    expect(result).toEqual({ ok: true, values: { fullName: "Sarah Lim", bankName: "Maybank", branch: "KLCC", phone: null } });
    if (result.ok) {
      expect(Object.keys(result.values)).toEqual(["fullName", "bankName", "branch", "phone"]);
    }
  });
});
