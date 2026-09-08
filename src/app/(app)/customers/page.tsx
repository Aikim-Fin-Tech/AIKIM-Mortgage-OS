import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCustomers } from "@/lib/database/customers";

function formatCreatedAt(iso: string): string {
  return new Intl.DateTimeFormat("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kuala_Lumpur",
  }).format(new Date(iso));
}

export default async function CustomersPage() {
  const { customers, error } = await getCustomers();

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
      <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Customers</h1>
      <p className="mt-1 text-sm text-slate-500">Manage and review your mortgage customers.</p>

      {error && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Unable to load customers from the database right now. Please try again shortly.
        </div>
      )}

      <div className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 p-4 sm:p-5">
          <p className="text-xs text-slate-400">
            Showing {customers.length} customer{customers.length === 1 ? "" : "s"}
          </p>
        </div>

        <Table>
          <TableHeader>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <TableHead>Full Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>ID Reference</TableHead>
              <TableHead>Created</TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {customers.map((customer) => (
              <TableRow key={customer.id}>
                <TableCell className="font-medium text-slate-900">{customer.fullName}</TableCell>
                <TableCell>{customer.phone ?? "-"}</TableCell>
                <TableCell>{customer.email ?? "-"}</TableCell>
                <TableCell>{customer.icNumberMasked ?? "-"}</TableCell>
                <TableCell>{formatCreatedAt(customer.createdAt)}</TableCell>
              </TableRow>
            ))}

            {!error && customers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-400">
                  No customers to show yet.
                </td>
              </tr>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
