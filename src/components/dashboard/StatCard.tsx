import { ArrowUpRightIcon, ArrowDownRightIcon } from "./icons";

type Trend = "up" | "down";

export type StatCardProps = {
  label: string;
  value: string;
  change?: string;
  trend?: Trend;
};

export function StatCard({ label, value, change, trend }: StatCardProps) {
  const isUp = trend === "up";
  const hasChange = Boolean(change && trend);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <div className="mt-2.5 flex items-end justify-between gap-2">
        <span className="text-2xl font-semibold tracking-tight text-slate-900">{value}</span>
        {hasChange && (
          <span
            className={`flex items-center gap-0.5 rounded-full px-2 py-1 text-xs font-medium ${
              isUp ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"
            }`}
          >
            {isUp ? <ArrowUpRightIcon className="h-3 w-3" /> : <ArrowDownRightIcon className="h-3 w-3" />}
            {change}
          </span>
        )}
      </div>
      {hasChange && <p className="mt-1.5 text-xs text-slate-400">vs. last period</p>}
    </div>
  );
}
