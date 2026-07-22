"use client";

import { usePathname } from "next/navigation";
import { MenuIcon } from "./icons";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { GlobalSearch } from "./GlobalSearch";
import { NotificationCenter } from "./NotificationCenter";
import type { ActivityItem } from "@/lib/database/activity";

function getPageTitle(pathname: string) {
  if (pathname === "/") return "Dashboard";
  if (pathname === "/loan-cases") return "Loan Cases";
  if (pathname.startsWith("/loan-cases/")) return "Loan Case Details";
  return "Dashboard";
}

function getInitials(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z\s]/g, "").trim();
  if (!cleaned) return "U";
  const parts = cleaned.split(/\s+/);
  const initials = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : cleaned.slice(0, 2);
  return initials.toUpperCase();
}

export function Header({
  userName,
  userRole,
  activityItems,
}: {
  userName: string | null;
  userRole: string | null;
  activityItems: ActivityItem[];
}) {
  const pathname = usePathname();
  const title = getPageTitle(pathname);
  const displayName = userName ?? "Not signed in";
  const displayRole = userRole ?? "User";

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 sm:gap-4 sm:px-6">
      <label
        htmlFor="mobile-menu"
        className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 md:hidden"
      >
        <MenuIcon className="h-5 w-5" />
      </label>

      <h1 className="hidden text-lg font-semibold text-slate-900 sm:block">{title}</h1>

      <div className="ml-auto flex flex-1 items-center justify-end gap-2 sm:flex-initial sm:gap-3">
        <div className="hidden sm:block">
          <GlobalSearch />
        </div>

        <NotificationCenter items={activityItems} />

        <div className="flex shrink-0 items-center gap-2 border-l border-slate-200 pl-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
            {getInitials(displayName)}
          </span>
          <div className="hidden leading-tight sm:block">
            <p className="max-w-[160px] truncate text-sm font-medium text-slate-900">{displayName}</p>
            <p className="text-xs text-slate-500">{displayRole}</p>
          </div>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
