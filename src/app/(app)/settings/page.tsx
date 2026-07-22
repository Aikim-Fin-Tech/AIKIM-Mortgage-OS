import Link from "next/link";
import { requireSuperAdminPage } from "@/lib/auth/super-admin";

export default async function SettingsPage() {
  await requireSuperAdminPage();

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:py-8">
      <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Settings</h1>
      <p className="mt-1 text-sm text-slate-500">Super Admin configuration.</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/settings/mortgage-rules"
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-emerald-200 hover:bg-emerald-50/50"
        >
          <h2 className="text-base font-semibold text-slate-900">Mortgage Rules</h2>
          <p className="mt-1 text-sm text-slate-500">
            Manage the database-driven rules that generate each case&rsquo;s required document checklist.
          </p>
        </Link>

        <Link
          href="/settings/document-categories"
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-emerald-200 hover:bg-emerald-50/50"
        >
          <h2 className="text-base font-semibold text-slate-900">Document Categories</h2>
          <p className="mt-1 text-sm text-slate-500">Manage the categories used to group document types.</p>
        </Link>
      </div>
    </div>
  );
}
