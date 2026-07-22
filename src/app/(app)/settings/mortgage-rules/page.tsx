import Link from "next/link";
import { requireSuperAdminPage } from "@/lib/auth/super-admin";
import { getMortgageRulesList } from "@/lib/database/mortgage-rules-admin";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "@/components/dashboard/icons";
import { RulesListTable } from "@/components/settings/mortgage-rules/RulesListTable";

export default async function MortgageRulesListPage() {
  await requireSuperAdminPage();

  const { rules, error } = await getMortgageRulesList();

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Mortgage Rules</h1>
          <p className="mt-1 text-sm text-slate-500">
            Database-driven rules that generate each case&rsquo;s required document checklist.
          </p>
        </div>
        <Link href="/settings/mortgage-rules/new">
          <Button type="button">
            <PlusIcon className="h-4 w-4" />
            New Rule
          </Button>
        </Link>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Unable to load mortgage rules right now. Please try again shortly.
        </div>
      )}

      <div className="mt-6">
        <RulesListTable rules={rules} />
      </div>
    </div>
  );
}
