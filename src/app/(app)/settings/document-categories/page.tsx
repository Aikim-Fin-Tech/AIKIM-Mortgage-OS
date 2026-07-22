import Link from "next/link";
import { requireSuperAdminPage } from "@/lib/auth/super-admin";
import { getDocumentCategoriesList } from "@/lib/database/mortgage-rules-admin";
import { ArrowLeftIcon } from "@/components/dashboard/icons";
import { CategoriesManager } from "@/components/settings/document-categories/CategoriesManager";

export default async function DocumentCategoriesPage() {
  await requireSuperAdminPage();

  const { categories, error } = await getDocumentCategoriesList();

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:py-8">
      <Link href="/settings" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700">
        <ArrowLeftIcon className="h-4 w-4" />
        Back to Settings
      </Link>

      <div className="mt-4">
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Document Categories</h1>
        <p className="mt-1 text-sm text-slate-500">Used to group document types on rules and required-document lists.</p>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Unable to load document categories right now. Please try again shortly.
        </div>
      )}

      <div className="mt-6">
        <CategoriesManager categories={categories} />
      </div>
    </div>
  );
}
