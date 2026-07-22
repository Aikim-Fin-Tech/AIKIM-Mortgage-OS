"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PlusIcon, SearchIcon, ArrowRightIcon } from "@/components/dashboard/icons";
import {
  banks,
  bankers,
  statuses,
  statusBadgeVariant,
  type LoanCase,
} from "@/lib/loan-cases-data";

const FILTER_ALL = "all";

export function LoanCasesExplorer({ cases }: { cases: LoanCase[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(FILTER_ALL);
  const [bankFilter, setBankFilter] = useState(FILTER_ALL);
  const [bankerFilter, setBankerFilter] = useState(FILTER_ALL);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return cases.filter((loanCase) => {
      const matchesSearch =
        query.length === 0 ||
        [loanCase.id, loanCase.customer, loanCase.phone, loanCase.project].some((field) =>
          field.toLowerCase().includes(query),
        );
      const matchesStatus = statusFilter === FILTER_ALL || loanCase.status === statusFilter;
      const matchesBank = bankFilter === FILTER_ALL || loanCase.bank === bankFilter;
      const matchesBanker = bankerFilter === FILTER_ALL || loanCase.banker === bankerFilter;

      return matchesSearch && matchesStatus && matchesBank && matchesBanker;
    });
  }, [cases, search, statusFilter, bankFilter, bankerFilter]);

  function goToCase(id: string) {
    router.push(`/loan-cases/${id}`);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-100 p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search case ID, customer, phone..."
                className="pl-9"
              />
            </div>

            <Select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="w-full sm:w-auto"
              aria-label="Filter by status"
            >
              <option value={FILTER_ALL}>All statuses</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </Select>

            <Select
              value={bankFilter}
              onChange={(event) => setBankFilter(event.target.value)}
              className="w-full sm:w-auto"
              aria-label="Filter by bank"
            >
              <option value={FILTER_ALL}>All banks</option>
              {banks.map((bank) => (
                <option key={bank} value={bank}>
                  {bank}
                </option>
              ))}
            </Select>

            <Select
              value={bankerFilter}
              onChange={(event) => setBankerFilter(event.target.value)}
              className="w-full sm:w-auto"
              aria-label="Filter by assigned banker"
            >
              <option value={FILTER_ALL}>All bankers</option>
              {bankers.map((banker) => (
                <option key={banker} value={banker}>
                  {banker}
                </option>
              ))}
            </Select>
          </div>

          <Button className="w-full lg:w-auto" onClick={() => router.push("/loan-cases/new")}>
            <PlusIcon className="h-4 w-4" />
            New Loan Case
          </Button>
        </div>

        <p className="text-xs text-slate-400">
          Showing {filtered.length} of {cases.length} cases
        </p>
      </div>

      <Table>
        <TableHeader>
          <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
            <TableHead>Case ID</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Project</TableHead>
            <TableHead>Loan Amount</TableHead>
            <TableHead>Bank</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Assigned Banker</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </tr>
        </TableHeader>
        <TableBody>
          {filtered.map((loanCase) => (
            <TableRow
              key={loanCase.id}
              tabIndex={0}
              className="cursor-pointer"
              onClick={() => goToCase(loanCase.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter") goToCase(loanCase.id);
              }}
            >
              <TableCell className="font-medium text-slate-900">{loanCase.id}</TableCell>
              <TableCell>{loanCase.customer}</TableCell>
              <TableCell>{loanCase.phone}</TableCell>
              <TableCell>{loanCase.project}</TableCell>
              <TableCell className="font-medium text-slate-900">
                RM {loanCase.loanAmount.toLocaleString("en-MY")}
              </TableCell>
              <TableCell>{loanCase.bank}</TableCell>
              <TableCell>{loanCase.stage}</TableCell>
              <TableCell>
                <Badge variant={statusBadgeVariant[loanCase.status]}>{loanCase.status}</Badge>
              </TableCell>
              <TableCell>{loanCase.banker}</TableCell>
              <TableCell className="text-right">
                <Link
                  href={`/loan-cases/${loanCase.id}`}
                  onClick={(event) => event.stopPropagation()}
                  className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600 hover:text-emerald-700"
                >
                  View
                  <ArrowRightIcon className="h-3.5 w-3.5" />
                </Link>
              </TableCell>
            </TableRow>
          ))}

          {filtered.length === 0 && (
            <tr>
              <td colSpan={10} className="px-4 py-10 text-center text-sm text-slate-400">
                No loan cases match your filters.
              </td>
            </tr>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
