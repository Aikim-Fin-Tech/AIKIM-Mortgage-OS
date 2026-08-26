"use client";

import { useActionState } from "react";
import { updateBankerDetails, type ProfileActionState } from "@/app/profile/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: ProfileActionState = { error: null, success: false };

export function BankerDetailsForm({
  fullName,
  bankName,
  branch,
  phone,
}: {
  fullName: string;
  bankName: string | null;
  branch: string | null;
  phone: string | null;
}) {
  const [state, formAction, isPending] = useActionState(updateBankerDetails, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Full Name</label>
        <Input name="bankerFullName" defaultValue={fullName} disabled={isPending} required />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Bank / Company Name</label>
          <Input name="bankName" defaultValue={bankName ?? ""} disabled={isPending} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Branch</label>
          <Input name="branch" defaultValue={branch ?? ""} disabled={isPending} />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Phone</label>
        <Input name="bankerPhone" type="tel" defaultValue={phone ?? ""} placeholder="+60 12-345 6789" disabled={isPending} />
      </div>

      {state.error && <p role="alert" className="text-sm text-rose-600">{state.error}</p>}
      {state.success && <p role="status" className="text-sm text-blue-700">Banking details saved.</p>}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving..." : "Save Banking Details"}
      </Button>
    </form>
  );
}
