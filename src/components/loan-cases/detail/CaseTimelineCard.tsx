import type { TimelineEntry } from "@/lib/timeline/types";

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-MY", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kuala_Lumpur",
  }).format(new Date(iso));
}

/**
 * Merged timeline (MVP Sprint Day 2) — Customer Created, Loan Created,
 * Document Uploaded, OCR Completed, Checklist Updated, Status Changed. See
 * src/lib/database/timeline.ts for how these are assembled. Visible to
 * every staff role, unlike the older audit_logs-based CaseActivityTimeline.
 */
export function CaseTimelineCard({ entries }: { entries: TimelineEntry[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-base font-semibold text-slate-900">Timeline</h2>

      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">No timeline events yet.</p>
      ) : (
        <ol className="mt-4 space-y-4">
          {entries.map((entry) => (
            <li key={entry.id} className="flex gap-3">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
              <div className="min-w-0">
                <p className="text-sm text-slate-900">{entry.description}</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {formatDateTime(entry.occurredAt)}
                  {entry.actorName ? ` · ${entry.actorName}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
