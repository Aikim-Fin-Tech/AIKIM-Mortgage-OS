"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { createRule, updateRule, type RuleFormState } from "@/app/(app)/settings/mortgage-rules/actions";
import { PROFILE_DIMENSIONS } from "@/lib/mortgage-rules/profile-dimensions";
import type { MortgageRuleDetail } from "@/lib/mortgage-rules/types";

const initialState: RuleFormState = { fieldErrors: {}, formError: null };

const ANY_VALUE = "";

export function RuleForm({ rule }: { rule: MortgageRuleDetail | null }) {
  const isEditMode = rule !== null;
  const action = isEditMode ? updateRule.bind(null, rule.id) : createRule;
  const [state, formAction, isPending] = useActionState(action, initialState);

  // Controlled only so the "Selected profile" summary below updates live —
  // this doubles as the Rule Preview's profile half (requirement #6): the
  // form itself is the preview of what will be saved, updated as the admin
  // picks values, before they click Save.
  const [profileValues, setProfileValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(PROFILE_DIMENSIONS.map((dim) => [dim.key, (rule?.[dim.key] as string | null) ?? ANY_VALUE])),
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-base font-semibold text-slate-900">{isEditMode ? "Edit Rule" : "New Rule"}</h2>

      <form action={formAction} className="mt-4 space-y-5">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Rule Name</label>
          <Input name="ruleName" defaultValue={rule?.ruleName ?? ""} disabled={isPending} required />
          {state.fieldErrors.ruleName && <p className="mt-1 text-xs text-rose-600">{state.fieldErrors.ruleName}</p>}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Description</label>
          <textarea
            name="description"
            defaultValue={rule?.description ?? ""}
            disabled={isPending}
            rows={2}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700
              placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">Borrower Profile Match</p>
          <p className="mb-3 text-xs text-slate-400">Leave a field as &ldquo;Any&rdquo; for it to match every value (wildcard).</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {PROFILE_DIMENSIONS.map((dim) => (
              <div key={dim.key}>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">{dim.label}</label>
                <Select
                  name={dim.key}
                  value={profileValues[dim.key]}
                  onChange={(event) => setProfileValues((prev) => ({ ...prev, [dim.key]: event.target.value }))}
                  className="w-full"
                  disabled={isPending}
                >
                  <option value={ANY_VALUE}>Any</option>
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
          <p className="mt-3 text-xs text-slate-500">
            Selected profile:{" "}
            {PROFILE_DIMENSIONS.map((dim) => profileValues[dim.key] || "Any").join(" · ")}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Version</label>
            <Input name="version" type="number" min={1} defaultValue={rule?.version ?? 1} disabled={isPending} />
            {state.fieldErrors.version && <p className="mt-1 text-xs text-rose-600">{state.fieldErrors.version}</p>}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Effective From</label>
            <Input name="effectiveFrom" type="date" defaultValue={rule?.effectiveFrom ?? ""} disabled={isPending} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Effective To</label>
            <Input name="effectiveTo" type="date" defaultValue={rule?.effectiveTo ?? ""} disabled={isPending} />
            {state.fieldErrors.effectiveTo && <p className="mt-1 text-xs text-rose-600">{state.fieldErrors.effectiveTo}</p>}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="isActive" defaultChecked={rule?.isActive ?? true} disabled={isPending} className="h-4 w-4 rounded border-slate-300" />
          Active
        </label>

        {state.formError && <p className="text-sm text-rose-600">{state.formError}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : isEditMode ? "Save Rule" : "Create Rule"}
          </Button>
        </div>
      </form>
    </div>
  );
}
