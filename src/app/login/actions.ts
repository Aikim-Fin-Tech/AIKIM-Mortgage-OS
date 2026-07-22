"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = {
  error: string | null;
};

/**
 * Server Action for the login form. Never accepts a role from the client —
 * the only inputs trusted here are email and password, and Supabase itself
 * decides whether they're valid.
 */
export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Please enter both email and password." };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Log the Supabase error code/message for debugging. Never log the
    // password, the resulting session/tokens, or any cookie/header values.
    console.error(`[login] Supabase sign-in failed: code=${error.code ?? "unknown"} message=${error.message}`);

    // Always show a generic, safe message — never the raw error object or a
    // stack trace, and never anything that would let someone distinguish
    // "wrong password" from "no such account".
    return { error: "Invalid email or password. Please try again." };
  }

  redirect("/");
}
