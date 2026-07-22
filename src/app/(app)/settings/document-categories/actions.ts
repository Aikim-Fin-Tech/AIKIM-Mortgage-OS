"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isSuperAdmin } from "@/lib/auth/super-admin";

/**
 * Server Actions for Document Categories management (Sprint 6.2 Phase 2,
 * super_admin only). No DELETE policy exists on document_categories —
 * Activate/Deactivate only, since document_types references category_id.
 */

async function requireSuperAdmin(): Promise<{ error: string | null }> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Your session has expired. Please sign in again." };
  if (!isSuperAdmin(currentUser.role)) return { error: "You do not have permission to manage document categories." };
  return { error: null };
}

const categorySchema = z.object({
  name: z.string().trim().min(2, "Category name is required."),
});

export type CategoryFormState = {
  fieldErrors: Partial<Record<string, string>>;
  formError: string | null;
};

export async function createCategory(_prevState: CategoryFormState, formData: FormData): Promise<CategoryFormState> {
  const guard = await requireSuperAdmin();
  if (guard.error) return { fieldErrors: {}, formError: guard.error };

  const result = categorySchema.safeParse({ name: String(formData.get("name") ?? "") });
  if (!result.success) {
    const fieldErrors: Partial<Record<string, string>> = {};
    for (const issue of result.error.issues) fieldErrors[String(issue.path[0])] = issue.message;
    return { fieldErrors, formError: null };
  }

  const supabase = await createClient();

  const { data: maxOrderRow } = await supabase
    .from("document_categories")
    .select("display_order")
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("document_categories").insert({
    name: result.data.name,
    display_order: (maxOrderRow?.display_order ?? -1) + 1,
  });

  if (error) {
    console.error(`[createCategory] insert failed. code=${error.code ?? "unknown"} message=${error.message}`);
    return {
      fieldErrors: {},
      formError: error.code === "23505" ? "A category with this name already exists." : "Something went wrong. Please try again.",
    };
  }

  revalidatePath("/settings/document-categories");
  return { fieldErrors: {}, formError: null };
}

export async function updateCategory(
  categoryId: string,
  _prevState: CategoryFormState,
  formData: FormData,
): Promise<CategoryFormState> {
  const guard = await requireSuperAdmin();
  if (guard.error) return { fieldErrors: {}, formError: guard.error };

  const result = categorySchema.safeParse({ name: String(formData.get("name") ?? "") });
  if (!result.success) {
    const fieldErrors: Partial<Record<string, string>> = {};
    for (const issue of result.error.issues) fieldErrors[String(issue.path[0])] = issue.message;
    return { fieldErrors, formError: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("document_categories").update({ name: result.data.name }).eq("id", categoryId);

  if (error) {
    console.error(`[updateCategory] update failed for ${categoryId}. code=${error.code ?? "unknown"} message=${error.message}`);
    return {
      fieldErrors: {},
      formError: error.code === "23505" ? "A category with this name already exists." : "Something went wrong. Please try again.",
    };
  }

  revalidatePath("/settings/document-categories");
  return { fieldErrors: {}, formError: null };
}

export async function setCategoryActive(categoryId: string, isActive: boolean): Promise<{ error: string | null }> {
  const guard = await requireSuperAdmin();
  if (guard.error) return { error: guard.error };

  const supabase = await createClient();
  const { error } = await supabase.from("document_categories").update({ is_active: isActive }).eq("id", categoryId);

  if (error) {
    console.error(`[setCategoryActive] update failed for ${categoryId}. message=${error.message}`);
    return { error: "Something went wrong. Please try again." };
  }

  revalidatePath("/settings/document-categories");
  return { error: null };
}

export async function reorderCategories(orderedIds: string[]): Promise<{ error: string | null }> {
  const guard = await requireSuperAdmin();
  if (guard.error) return { error: guard.error };

  const supabase = await createClient();

  const results = await Promise.all(
    orderedIds.map((id, index) => supabase.from("document_categories").update({ display_order: index }).eq("id", id)),
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) {
    console.error(`[reorderCategories] update failed. message=${failed.error.message}`);
    return { error: "Something went wrong while reordering. Please try again." };
  }

  revalidatePath("/settings/document-categories");
  return { error: null };
}
