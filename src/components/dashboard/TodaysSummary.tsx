import type { TodaysSummaryRow } from "@/lib/database/dashboard";

export function TodaysSummary({ rows }: { rows: TodaysSummaryRow[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">Today&apos;s Summary</h2>
        <span className="text-xs text-slate-400">Today</span>
      </div>

      <ul className="mt-3 divide-y divide-slate-100">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center justify-between py-2.5 text-sm">
            <span className="text-slate-600">{row.label}</span>
            <span className="font-semibold text-slate-900">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
