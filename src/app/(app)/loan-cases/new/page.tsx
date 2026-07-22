import Link from "next/link";
import { NewLoanCaseForm } from "@/components/loan-cases/NewLoanCaseForm";
import { getNewLoanCaseFormOptions } from "@/lib/database/new-loan-case";
import { ArrowLeftIcon } from "@/components/dashboard/icons";

export default async function NewLoanCasePage() {
  const options = await getNewLoanCaseFormOptions();

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:py-8">
      <Link
        href="/loan-cases"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Back to Loan Cases
      </Link>

      <div className="mt-4">
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">New Loan Case</h1>
        <p className="mt-1 text-sm text-slate-500">
          Create a new mortgage application and assign it to the appropriate banker.
        </p>
      </div>

      {options.error && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Some form options could not be loaded. You can still fill in the fields shown below.
        </div>
      )}

      <div className="mt-6">
        <NewLoanCaseForm customers={options.customers} bankers={options.bankers} />
      </div>
    </div>
  );
}
