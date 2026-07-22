"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { updateBorrowerProfile, type UpdateBorrowerProfileState } from "@/app/(app)/loan-cases/[id]/actions";
import { PROFILE_DIMENSIONS } from "@/lib/mortgage-rules/profile-dimensions";
import type { BorrowerProfile } from "@/lib/database/loan-case-details";

const initialState: UpdateBorrowerProfileState = { fieldErrors: {}, formError: null };

/**
 * Note on the calling side: render this with
 * `key={JSON.stringify(profile)}` from the parent. On a successful save,
 * revalidatePath delivers a new `profile` prop, the key changes, and React
 * remounts this component fresh (isEditing resets to false) — the cleanest
 * way to "close the form after success" without an effect or a ref read
 * during render, both of which this project's lint rules disallow.
 */
export function BorrowerProfileCard({ caseNumber, profile }: { caseNumber: string; profile: BorrowerProfile }) {
  const [isEditing, setIsEditing] = useState(false);
  const action = updateBorrowerProfile.bind(null, caseNumber);
  const [state, formAction, isPending] = useActionState(action, initialState);

  if (!isEditing) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Borrower Profile</h2>
          <Button type="button" variant="outline" size="sm" onClick={() => setIsEditing(true)}>
            Edit
          </Button>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          {PROFILE_DIMENSIONS.map((dim) => (
            <div key={dim.key}>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{dim.label}</dt>
              <dd className="mt-0.5 text-slate-900">{profile[dim.key] ?? "Not set"}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-slate-400">
          Drives which documents are required for this case — see the Documents tab.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-base font-semibold text-slate-900">Edit Borrower Profile</h2>

      <form action={formAction} className="mt-4 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {PROFILE_DIMENSIONS.map((dim) => (
            <div key={dim.key}>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">{dim.label}</label>
              <Select name={dim.key} defaultValue={profile[dim.key] ?? ""} className="w-full" disabled={isPending}>
                <option value="">Not set</option>
                {dim.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
              {state.fieldErrors[dim.key] && <p className="mt-1 text-xs text-rose-600">{state.fieldErrors[dim.key]}</p>}
            </div>
          ))}
        </div>

        {state.formError && <p className="text-xs text-rose-600">{state.formError}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={() => setIsEditing(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : "Save Profile"}
          </Button>
        </div>
      </form>
    </div>
  );
}
