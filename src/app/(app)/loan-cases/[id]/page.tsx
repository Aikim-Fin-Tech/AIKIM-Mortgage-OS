import { notFound } from "next/navigation";
import { getLoanCaseDetails } from "@/lib/database/loan-case-details";
import { getCaseSummaryData } from "@/lib/database/case-summary";
import { getCaseTimeline } from "@/lib/database/timeline";
import { getRequiredDocuments } from "@/lib/database/required-documents";
import { getLoanHealthScore } from "@/lib/database/loan-health";
import { LoanCaseHeader } from "@/components/loan-cases/detail/LoanCaseHeader";
import { LoanCaseTabs } from "@/components/loan-cases/detail/LoanCaseTabs";
import { CaseSummaryCard } from "@/components/loan-cases/detail/CaseSummaryCard";
import { CustomerInformationCard } from "@/components/loan-cases/detail/CustomerInformationCard";
import { LoanInformationCard } from "@/components/loan-cases/detail/LoanInformationCard";
import { CaseProgressCard } from "@/components/loan-cases/detail/CaseProgressCard";
import { ChecklistProgressCard } from "@/components/loan-cases/detail/ChecklistProgressCard";
import { NextActionCard } from "@/components/loan-cases/detail/NextActionCard";
import { LoanHealthScoreCard } from "@/components/loan-cases/detail/LoanHealthScoreCard";
import { BorrowerProfileCard } from "@/components/loan-cases/detail/BorrowerProfileCard";
import { DocumentSummaryCard } from "@/components/loan-cases/detail/DocumentSummaryCard";
import { CaseTimelineCard } from "@/components/loan-cases/detail/CaseTimelineCard";
import { CaseNotesCard } from "@/components/loan-cases/detail/CaseNotesCard";
import { FollowUpCard } from "@/components/loan-cases/detail/FollowUpCard";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function LoanCaseDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [details, summaryResult, timelineResult, requiredResult, healthResult] = await Promise.all([
    getLoanCaseDetails(id),
    getCaseSummaryData(id),
    getCaseTimeline(id),
    getRequiredDocuments(id),
    getLoanHealthScore(id),
  ]);

  if (!details.case) {
    notFound();
  }

  const caseDetail = details.case;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <LoanCaseHeader
        caseDetail={caseDetail}
        customerName={details.customer?.fullName ?? "Unknown Customer"}
        bankerName={details.banker?.fullName ?? "Unassigned"}
      />

      <LoanCaseTabs caseNumber={caseDetail.caseNumber} active="overview" />

      {details.error && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Some case data could not be loaded right now. The sections below may be incomplete.
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {summaryResult.data && <CaseSummaryCard caseNumber={caseDetail.caseNumber} data={summaryResult.data} />}
          <NextActionCard
            status={caseDetail.status}
            hasAnyRequirements={requiredResult.rows.length > 0}
            missingDocuments={requiredResult.rows.filter((r) => r.status === "missing").map((r) => r.documentName)}
          />
          <CustomerInformationCard customer={details.customer} />
          <LoanInformationCard caseDetail={caseDetail} banker={details.banker} />
          <DocumentSummaryCard caseNumber={caseDetail.caseNumber} documents={details.documents} />
          <CaseTimelineCard entries={timelineResult.entries} />
        </div>

        <div className="space-y-6">
          <CaseProgressCard caseDetail={caseDetail} />
          <ChecklistProgressCard caseNumber={caseDetail.caseNumber} rows={requiredResult.rows} />
          {healthResult.health && <LoanHealthScoreCard health={healthResult.health} />}
          <BorrowerProfileCard
            key={JSON.stringify(caseDetail.borrowerProfile)}
            caseNumber={caseDetail.caseNumber}
            profile={caseDetail.borrowerProfile}
          />
          <CaseNotesCard />
          <FollowUpCard />
        </div>
      </div>
    </div>
  );
}
