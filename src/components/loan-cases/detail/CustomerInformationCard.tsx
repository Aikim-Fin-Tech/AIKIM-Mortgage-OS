import type { CustomerDetail } from "@/lib/database/loan-case-details";

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={`mt-1 text-sm ${value ? "text-slate-900" : "text-slate-400"}`}>{value ?? "Not provided"}</dd>
    </div>
  );
}

export function CustomerInformationCard({ customer }: { customer: CustomerDetail | null }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-base font-semibold text-slate-900">Customer Information</h2>

      {customer ? (
        <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full Name" value={customer.fullName} />
          <Field label="Phone" value={customer.phone} />
          <Field label="Email" value={customer.email} />
          <Field label="IC / NRIC" value={customer.icNumberMasked} />
          <Field label="Address" value={customer.address} />
        </dl>
      ) : (
        <p className="mt-4 text-sm text-slate-400">Customer details are not available for this case.</p>
      )}
    </div>
  );
}
