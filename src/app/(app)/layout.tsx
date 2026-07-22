import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getRecentActivity } from "@/lib/database/activity";

/**
 * Layout for every protected application page (/, /loan-cases, /loan-cases/*,
 * /customers, /documents, /bankers, /analytics, /settings, ...). src/proxy.ts
 * already guarantees an authenticated user reaches this layout, but the user is
 * still re-derived here on the server (never trusted from the browser) so the
 * header can display a verified full_name + role.
 *
 * getCurrentUser() and getRecentActivity() are both wrapped in React's cache(),
 * so if the Dashboard page also calls them (e.g. for the welcome text or the
 * Operations Summary card) it's deduped to a single Supabase round trip per
 * request, not fetched twice.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [user, activity] = await Promise.all([getCurrentUser(), getRecentActivity()]);

  return (
    <div className="flex h-full">
      {/* Controls the mobile sidebar drawer; toggled via the Header's menu button */}
      <input type="checkbox" id="mobile-menu" className="peer hidden" />

      <Sidebar userRole={user?.role ?? null} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          userName={user?.fullName ?? null}
          userRole={user?.roleLabel ?? null}
          activityItems={activity.items}
        />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
