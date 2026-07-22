"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  DashboardIcon,
  CasesIcon,
  CustomersIcon,
  DocumentsIcon,
  BankersIcon,
  AIIcon,
  AnalyticsIcon,
  SettingsIcon,
} from "./icons";

const navItems = [
  { label: "Dashboard", href: "/", icon: DashboardIcon },
  { label: "Loan Cases", href: "/loan-cases", icon: CasesIcon },
  { label: "Customers", href: "#", icon: CustomersIcon },
  { label: "Documents", href: "#", icon: DocumentsIcon },
  { label: "Bankers", href: "#", icon: BankersIcon },
  { label: "AI Assistant", href: "#", icon: AIIcon },
  { label: "Analytics", href: "#", icon: AnalyticsIcon },
];

const SETTINGS_ITEM = { label: "Settings", href: "/settings", icon: SettingsIcon };

/**
 * `userRole` gates the Settings link (super_admin only) — nav visibility
 * only, not a security boundary. Every /settings/** page and Server Action
 * re-checks the role itself (requireSuperAdminPage / requireSuperAdmin), and
 * RLS is the real enforcement underneath that. See
 * docs/decisions/0002-rls-as-sole-authorization-boundary.md.
 */
export function Sidebar({ userRole }: { userRole: string | null }) {
  const pathname = usePathname();
  const items = userRole === "super_admin" ? [...navItems, SETTINGS_ITEM] : navItems;

  return (
    <>
      {/* Mobile overlay: tapping it closes the drawer */}
      <label
        htmlFor="mobile-menu"
        aria-hidden="true"
        className="fixed inset-0 z-30 hidden bg-slate-900/40 peer-checked:block md:hidden"
      />

      <aside
        className="fixed inset-y-0 left-0 z-40 flex w-64 -translate-x-full flex-col bg-white
          border-r border-slate-200 transition-transform duration-200 ease-out
          peer-checked:translate-x-0 md:static md:z-auto md:translate-x-0"
      >
        <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-slate-200 px-6">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-sm font-bold text-white">
            A
          </span>
          <span className="truncate text-[15px] font-semibold tracking-tight text-slate-900">
            AIKIM <span className="text-emerald-600">Mortgage OS</span>
          </span>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href !== "#" &&
              (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href));

            return (
              <Link
                key={item.label}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-emerald-50 text-emerald-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-200 p-4">
          <p className="text-xs text-slate-400">AIKIM Mortgage OS v1.0</p>
        </div>
      </aside>
    </>
  );
}
