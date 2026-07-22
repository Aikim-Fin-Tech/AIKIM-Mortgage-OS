import { Badge } from "@/components/ui/badge";
import type { RuleDocumentItem } from "@/lib/mortgage-rules/types";

/**
 * "Show the grouped required document checklist before saving" — since
 * every RuleDocumentsManager mutation (add/edit/remove/reorder) already
 * persists and revalidates immediately, this is always an accurate preview
 * of what the rule currently produces, grouped by category exactly as the
 * Documents tab's Required Documents section groups them.
 */
export function RulePreview({ ruleDocuments }: { ruleDocuments: RuleDocumentItem[] }) {
  const groups = new Map<string, RuleDocumentItem[]>();
  for (const item of ruleDocuments) {
    const category = item.categoryName ?? "Uncategorized";
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category)!.push(item);
  }

  if (groups.size === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold text-slate-900">Preview</h2>
        <p className="mt-2 text-sm text-slate-400">
          Add required documents above to see the grouped checklist a matching case would receive.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-base font-semibold text-slate-900">Preview</h2>
      <p className="mt-1 text-xs text-slate-400">
        The checklist a loan case matching this rule&rsquo;s borrower profile would receive.
      </p>

      <div className="mt-4 space-y-4">
        {Array.from(groups.entries()).map(([category, items]) => (
          <div key={category}>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{category}</p>
            <ul className="mt-1.5 space-y-1.5">
              {items.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-slate-700">
                    {item.documentTypeName}
                    {item.requiredMonths ? ` (${item.requiredMonths} months)` : ""}
                    {item.requiredCount > 1 ? ` — ${item.requiredCount} required` : ""}
                  </span>
                  {!item.isMandatory && (
                    <Badge variant="neutral" className="shrink-0">
                      Optional
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
