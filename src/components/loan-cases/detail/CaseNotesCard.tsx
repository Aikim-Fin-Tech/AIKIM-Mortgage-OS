export function CaseNotesCard() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">Case Notes</h2>
        <button
          type="button"
          disabled
          title="Coming in next sprint"
          className="cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-400"
        >
          Add Note
        </button>
      </div>
      <p className="mt-4 text-sm text-slate-400">Case notes are not yet available for this case.</p>
    </div>
  );
}
