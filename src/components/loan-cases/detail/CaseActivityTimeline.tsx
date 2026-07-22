import type { ActivityItem } from "@/lib/database/loan-case-details";

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-MY", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kuala_Lumpur",
  }).format(new Date(iso));
}

export function CaseActivityTimeline({ activity }: { activity: ActivityItem[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-base font-semibold text-slate-900">Case Activity</h2>

      {activity.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">No activity has been recorded for this case.</p>
      ) : (
        <ol className="mt-4 space-y-4">
          {activity.map((item) => (
            <li key={item.id} className="flex gap-3">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">{item.label}</p>
                <p className="text-sm text-slate-600">{item.description}</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {formatDateTime(item.createdAt)}
                  {item.actor ? ` · ${item.actor}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
