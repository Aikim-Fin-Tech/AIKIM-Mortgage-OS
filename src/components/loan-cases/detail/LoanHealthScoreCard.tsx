import type { LoanHealthScore } from "@/lib/loan-health/types";

const FACTOR_LABELS: { key: keyof LoanHealthScore["factors"]; label: string }[] = [
  { key: "documentCompletion", label: "Document Completion" },
  { key: "requiredFields", label: "Required Fields" },
  { key: "ocrSuccess", label: "OCR Success" },
  { key: "workflowProgress", label: "Workflow Progress" },
];

function scoreColor(score: number): string {
  if (score >= 75) return "text-emerald-600";
  if (score >= 50) return "text-amber-600";
  return "text-rose-600";
}

/**
 * Simple, deterministic, no-AI score — equal-weighted average of 4 factors.
 * See src/lib/loan-health/calculate-health-score.ts.
 */
export function LoanHealthScoreCard({ health }: { health: LoanHealthScore }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">Loan Health Score</h2>
        <span className={`text-2xl font-semibold ${scoreColor(health.score)}`}>{health.score}</span>
      </div>

      <dl className="mt-4 space-y-2.5">
        {FACTOR_LABELS.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between text-xs">
            <dt className="text-slate-500">{label}</dt>
            <dd className="text-slate-700">{health.factors[key]}%</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
