import Link from "next/link";

const TABS = [
  { key: "overview", label: "Overview", hrefSuffix: "" },
  { key: "documents", label: "Documents", hrefSuffix: "/documents" },
  { key: "assessment", label: "Assessment", hrefSuffix: "/assessment" },
] as const;

export function LoanCaseTabs({
  caseNumber,
  active,
}: {
  caseNumber: string;
  active: "overview" | "documents" | "assessment";
}) {
  return (
    <div className="mt-6 border-b border-slate-200">
      <nav className="-mb-px flex gap-6">
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          return (
            <Link
              key={tab.key}
              href={`/loan-cases/${caseNumber}${tab.hrefSuffix}`}
              className={`border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                isActive
                  ? "border-emerald-600 text-emerald-700"
                  : "border-transparent text-slate-500 hover:border-slate-200 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
