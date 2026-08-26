"use client";

import { useActionState } from "react";
import { updateProfile, type ProfileActionState } from "@/app/profile/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: ProfileActionState = { error: null, success: false };

export function ProfileInfoForm({ fullName, phone }: { fullName: string; phone: string | null }) {
  const [state, formAction, isPending] = useActionState(updateProfile, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Full Name</label>
        <Input name="fullName" defaultValue={fullName} disabled={isPending} required />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">Phone</label>
        <Input name="phone" type="tel" defaultValue={phone ?? ""} placeholder="+60 12-345 6789" disabled={isPending} />
      </div>

      {state.error && <p role="alert" className="text-sm text-rose-600">{state.error}</p>}
      {state.success && <p role="status" className="text-sm text-blue-700">Profile saved.</p>}

      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving..." : "Save Profile"}
      </Button>
    </form>
  );
}
