import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperAdminPage } from "@/lib/auth/super-admin";
import { getMortgageRuleDetail, getDocumentTypesWithCategory } from "@/lib/database/mortgage-rules-admin";
import { ArrowLeftIcon } from "@/components/dashboard/icons";
import { RuleForm } from "@/components/settings/mortgage-rules/RuleForm";
import { RuleDocumentsManager } from "@/components/settings/mortgage-rules/RuleDocumentsManager";
import { RulePreview } from "@/components/settings/mortgage-rules/RulePreview";

type PageProps = {
  params: Promise<{ ruleId: string }>;
};

export default async function MortgageRuleDetailPage({ params }: PageProps) {
  await requireSuperAdminPage();
  const { ruleId } = await params;

  const [ruleResult, documentTypesResult] = await Promise.all([
    getMortgageRuleDetail(ruleId),
    getDocumentTypesWithCategory(),
  ]);

  if (!ruleResult.rule) {
    notFound();
  }

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
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{ruleResult.rule.ruleName}</h1>
        <p className="mt-1 text-sm text-slate-500">Version {ruleResult.rule.version}</p>
      </div>

      {(ruleResult.error || documentTypesResult.error) && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Some data could not be loaded right now. The sections below may be incomplete.
        </div>
      )}

      <div className="mt-6 space-y-6">
        <RuleForm rule={ruleResult.rule} />
        <RuleDocumentsManager ruleId={ruleId} ruleDocuments={ruleResult.ruleDocuments} documentTypes={documentTypesResult.documentTypes} />
        <RulePreview ruleDocuments={ruleResult.ruleDocuments} />
      </div>
    </div>
  );
}
