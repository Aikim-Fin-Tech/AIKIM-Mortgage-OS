import { LoanCasesExplorer } from "@/components/loan-cases/LoanCasesExplorer";
import { getLoanCases } from "@/lib/database/loan-cases";

export default async function LoanCasesPage() {
  const { cases, error } = await getLoanCases();

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
      <p className="text-sm text-slate-500">
        Track and manage every mortgage case across the pipeline.
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Unable to load loan cases from the database right now. Please try again shortly.
        </div>
      )}

      <div className="mt-6">
        <LoanCasesExplorer cases={cases} />
      </div>
    </div>
  );
}
