import Link from "next/link";
import { StatCard, type StatCardProps } from "@/components/dashboard/StatCard";
import { LoanPipeline } from "@/components/dashboard/LoanPipeline";
import { RecentCasesTable } from "@/components/dashboard/RecentCasesTable";
import { OperationsSummaryCard } from "@/components/dashboard/OperationsSummaryCard";
import { TodaysSummary } from "@/components/dashboard/TodaysSummary";
import { PlusIcon } from "@/components/dashboard/icons";
import { getDashboardData } from "@/lib/database/dashboard";
import { getCurrentUser } from "@/lib/auth/current-user";

function formatTodayLabel(): string {
  return new Intl.DateTimeFormat("en-MY", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kuala_Lumpur",
  }).format(new Date());
}

function formatUpdatedAt(iso: string): string {
  return new Intl.DateTimeFormat("en-MY", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kuala_Lumpur",
  }).format(new Date(iso));
}

export default async function DashboardPage() {
  // getCurrentUser() is wrapped in React's cache(), so this doesn't re-hit
  // Supabase — the (app) layout already fetched it once for the Header.
  const [user, data] = await Promise.all([getCurrentUser(), getDashboardData()]);

  const stats: StatCardProps[] = [
    { label: "Total Active Cases", value: data.activeCases.toLocaleString("en-MY") },
    { label: "Pending Documents", value: data.pendingDocuments.toLocaleString("en-MY") },
    { label: "Approval Rate", value: `${data.approvalRate}%` },
    { label: "Documents Processed", value: data.documentsProcessed.toLocaleString("en-MY") },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
            Welcome back, {user?.fullName ?? "there"}
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            {formatTodayLabel()} &middot; {user?.roleLabel ?? "User"}
          </p>
          <p className="mt-1.5 text-sm text-slate-500">
            Here is what is happening with your mortgage operations today.
          </p>
        </div>

        <div className="flex flex-col items-start gap-2 sm:items-end">
          <Link
            href="/loan-cases/new"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5
              text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700"
          >
            <PlusIcon className="h-4 w-4" />
            New Loan Case
          </Link>
          <p className="text-xs text-slate-400">Data updated: {formatUpdatedAt(data.lastDataUpdatedAt)}</p>
        </div>
      </div>

      {data.errors.length > 0 && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Dashboard activity is temporarily unavailable for some sections. Numbers below may be incomplete.
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex flex-col gap-6 xl:col-span-2">
          <LoanPipeline pipeline={data.pipeline} />
          <RecentCasesTable cases={data.recentCases} />
        </div>

        <div className="flex flex-col gap-6">
          <OperationsSummaryCard
            activeCases={data.activeCases}
            documentsProcessed={data.documentsProcessed}
            pendingDocuments={data.pendingDocuments}
            activityEventsToday={data.activityEventsToday}
          />
          <TodaysSummary rows={data.todaysSummary} />
        </div>
      </div>
    </div>
  );
}
