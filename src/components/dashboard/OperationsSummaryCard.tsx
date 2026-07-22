import { AIIcon, DocumentsIcon, CasesIcon, BellIcon } from "./icons";

export type OperationsSummaryProps = {
  activeCases: number;
  documentsProcessed: number;
  pendingDocuments: number;
  activityEventsToday: number;
};

export function OperationsSummaryCard({
  activeCases,
  documentsProcessed,
  pendingDocuments,
  activityEventsToday,
}: OperationsSummaryProps) {
  const items = [
    { icon: CasesIcon, label: `${activeCases} active loan cases` },
    { icon: DocumentsIcon, label: `${documentsProcessed} documents verified (all time)` },
    { icon: DocumentsIcon, label: `${pendingDocuments} documents awaiting review` },
    { icon: BellIcon, label: `${activityEventsToday} activity events today` },
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
          <AIIcon className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-slate-900">Operations Summary</h2>
          <p className="text-xs text-slate-500">Live snapshot across your portfolio</p>
        </div>
      </div>

      <ul className="mt-5 space-y-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.label} className="flex items-start gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <span className="text-sm text-slate-700">{item.label}</span>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        disabled
        title="AI Assistant is not available yet"
        className="mt-5 w-full cursor-not-allowed rounded-lg bg-slate-100 py-2.5 text-sm font-medium text-slate-400"
      >
        AI Assistant — Coming Soon
      </button>
    </div>
  );
}
