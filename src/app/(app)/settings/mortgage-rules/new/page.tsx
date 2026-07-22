import Link from "next/link";
import { requireSuperAdminPage } from "@/lib/auth/super-admin";
import { ArrowLeftIcon } from "@/components/dashboard/icons";
import { RuleForm } from "@/components/settings/mortgage-rules/RuleForm";

export default async function NewMortgageRulePage() {
  await requireSuperAdminPage();

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:py-8">
      <Link
        href="/settings/mortgage-rules"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Back to Mortgage Rules
      </Link>

      <div className="mt-4">
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">New Rule</h1>
        <p className="mt-1 text-sm text-slate-500">
          Required documents can be added once the rule is created.
        </p>
      </div>

      <div className="mt-6">
        <RuleForm rule={null} />
      </div>
    </div>
  );
}
