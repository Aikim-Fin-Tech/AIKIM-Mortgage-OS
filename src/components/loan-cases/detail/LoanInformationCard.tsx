import type { CaseDetail, BankerDetail } from "@/lib/database/loan-case-details";

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kuala_Lumpur",
  }).format(new Date(iso));
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={`mt-1 text-sm ${value ? "text-slate-900" : "text-slate-400"}`}>{value ?? "Not provided"}</dd>
    </div>
  );
}

export function LoanInformationCard({ caseDetail, banker }: { caseDetail: CaseDetail; banker: BankerDetail | null }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-base font-semibold text-slate-900">Property and Loan Information</h2>

      <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Property Project" value={caseDetail.propertyProject} />
        <Field label="Property Address" value={caseDetail.propertyAddress} />
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Loan Amount</dt>
          <dd className="mt-1 text-sm font-semibold text-slate-900">
            RM {caseDetail.loanAmount.toLocaleString("en-MY")}
          </dd>
        </div>
        <Field label="Bank" value={caseDetail.bankName} />
        <Field label="Assigned Banker" value={banker ? `${banker.fullName} (${banker.bankName})` : null} />
        <Field label="Case Stage" value={caseDetail.stage} />
        <Field label="Case Status" value={caseDetail.status} />
        <Field label="Case Created" value={formatDate(caseDetail.createdAt)} />
        <Field label="Last Updated" value={formatDate(caseDetail.updatedAt)} />
      </dl>
    </div>
  );
}
