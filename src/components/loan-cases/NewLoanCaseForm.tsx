"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createLoanCase, type CreateLoanCaseState } from "@/app/(app)/loan-cases/new/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { STAGE_OPTIONS, STATUS_OPTIONS, type CustomerOption, type BankerOption } from "@/lib/loan-cases/new-loan-case-types";
import { banks } from "@/lib/loan-cases-data";

const initialState: CreateLoanCaseState = { fieldErrors: {}, formError: null };

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-rose-600">{message}</p>;
}

export function NewLoanCaseForm({
  customers,
  bankers,
}: {
  customers: CustomerOption[];
  bankers: BankerOption[];
}) {
  const [state, formAction, isPending] = useActionState(createLoanCase, initialState);
  const [customerMode, setCustomerMode] = useState<"existing" | "new">(customers.length > 0 ? "existing" : "new");

  const errors = state.fieldErrors;

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="customerMode" value={customerMode} />

      {/* Customer Information */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold text-slate-900">Customer Information</h2>

        <div className="mt-4 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => setCustomerMode("existing")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              customerMode === "existing" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
            }`}
          >
            Existing Customer
          </button>
          <button
            type="button"
            onClick={() => setCustomerMode("new")}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              customerMode === "new" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
            }`}
          >
            New Customer
          </button>
        </div>

        {customerMode === "existing" ? (
          <div className="mt-4">
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Customer</label>
            <Select name="customerId" defaultValue="" className="w-full sm:w-96">
              <option value="" disabled>
                Select a customer...
              </option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.fullName}
                  {customer.phone ? ` — ${customer.phone}` : ""}
                </option>
              ))}
            </Select>
            <FieldError message={errors.customerId} />
            {customers.length === 0 && (
              <p className="mt-1.5 text-xs text-slate-400">No existing customers found. Use New Customer instead.</p>
            )}
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Full Name</label>
              <Input name="customerFullName" placeholder="e.g. Ahmad Firdaus" />
              <FieldError message={errors.customerFullName} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Phone</label>
              <Input name="customerPhone" placeholder="+60 12-345 6789" />
              <FieldError message={errors.customerPhone} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Email (optional)</label>
              <Input name="customerEmail" type="email" placeholder="customer@example.com" />
              <FieldError message={errors.customerEmail} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                IC / Passport Number (optional)
              </label>
              <Input name="customerIcNumber" placeholder="e.g. 900101-01-1234" />
            </div>
          </div>
        )}
      </section>

      {/* Property and Loan Information */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold text-slate-900">Property and Loan Information</h2>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Property Project</label>
            <Input name="propertyProject" placeholder="e.g. Eco Botanic" />
            <FieldError message={errors.propertyProject} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Property Address (optional)</label>
            <Input name="propertyAddress" placeholder="Full address" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Loan Amount (RM)</label>
            <Input name="loanAmount" type="number" min="0" step="1000" placeholder="500000" />
            <FieldError message={errors.loanAmount} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Bank</label>
            <Select name="bankName" defaultValue="" className="w-full">
              <option value="" disabled>
                Select a bank...
              </option>
              {banks.map((bank) => (
                <option key={bank} value={bank}>
                  {bank}
                </option>
              ))}
            </Select>
            <FieldError message={errors.bankName} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Loan Stage</label>
            <Select name="stage" defaultValue={STAGE_OPTIONS[0].value} className="w-full">
              {STAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Loan Status</label>
            <Select name="status" defaultValue={STATUS_OPTIONS[0].value} className="w-full">
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </section>

      {/* Assignment */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <h2 className="text-base font-semibold text-slate-900">Assignment</h2>

        <div className="mt-4">
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Assigned Banker</label>
          <Select name="bankerId" defaultValue="" className="w-full sm:w-96">
            <option value="">Unassigned</option>
            {bankers.map((banker) => (
              <option key={banker.id} value={banker.id}>
                {banker.fullName} — {banker.bankName}
              </option>
            ))}
          </Select>
          <FieldError message={errors.bankerId} />
        </div>
      </section>

      {state.formError && (
        <p role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {state.formError}
        </p>
      )}

      <div className="flex items-center justify-end gap-3">
        <Link
          href="/loan-cases"
          className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-4
            text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </Link>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creating..." : "Create Loan Case"}
        </Button>
      </div>
    </form>
  );
}
