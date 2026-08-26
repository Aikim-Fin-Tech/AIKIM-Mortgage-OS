import { notFound } from "next/navigation";
import { getProfileData } from "@/lib/database/profile";
import { formatPermissionSummary, formatRoleLabel } from "@/lib/auth/current-user";
import { ProfileInfoForm } from "@/components/profile/ProfileInfoForm";
import { BankerDetailsForm } from "@/components/profile/BankerDetailsForm";
import { ChangePasswordForm } from "@/components/profile/ChangePasswordForm";

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-sm text-slate-700">{value}</p>
    </div>
  );
}

export default async function ProfilePage() {
  const profile = await getProfileData();

  // Any signed-in user reaches this page (proxy.ts already guarantees a
  // session) — a null result here means the user_profiles lookup itself
  // failed, not an authorization gap, so a 404 (not a redirect to /login)
  // is the right failure mode, same convention as other pages that guard on
  // a lookup rather than a role.
  if (!profile) notFound();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 lg:py-8">
      <h1 className="text-lg font-semibold text-slate-900">My Profile</h1>
      <p className="mt-1 text-sm text-slate-500">Manage your account details and password.</p>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold text-slate-900">Account</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ReadOnlyField label="Login Email" value={profile.email} />
          <ReadOnlyField label="Role" value={formatRoleLabel(profile.role)} />
          <ReadOnlyField label="Account ID" value={profile.userProfileId} />
          <ReadOnlyField label="Permissions" value={formatPermissionSummary(profile.role)} />
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold text-slate-900">Personal Details</h2>
        <div className="mt-4">
          <ProfileInfoForm fullName={profile.fullName} phone={profile.phone} />
        </div>
      </div>

      {profile.role === "banker" && profile.banker && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <h2 className="text-base font-semibold text-slate-900">Banking Details</h2>
          <p className="mt-1 text-sm text-slate-500">Shown to staff as your case assignment identity.</p>
          <div className="mt-4">
            <BankerDetailsForm
              fullName={profile.banker.fullName}
              bankName={profile.banker.bankName}
              branch={profile.banker.branch}
              phone={profile.banker.phone}
            />
          </div>
        </div>
      )}

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold text-slate-900">Change Password</h2>
        <div className="mt-4">
          <ChangePasswordForm />
        </div>
      </div>
    </div>
  );
}
