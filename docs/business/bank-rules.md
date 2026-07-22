# Bank Rules

## How banks are represented

There is no `banks` reference table. A bank is a free-text `bank_name` string stored
on both `loan_cases.bank_name` and `bankers.bank_name` — not a foreign key, not an
enum. Nothing in the schema enforces that a case's `bank_name` matches its assigned
banker's `bank_name`.

## Current picker list (UI-level only)

`src/lib/loan-cases-data.ts` exports a hardcoded `banks` list used by the New Loan
Case form and the Loan Cases filter:

Maybank, CIMB Bank, Public Bank, RHB Bank, Hong Leong Bank, AmBank, Bank Islam,
UOB Malaysia.

This is a **suggested list for the UI, not a database-enforced set** — a case's
`bank_name` can be any string, since the column is unconstrained text.

## Known gap

Because `bank_name` isn't validated against a real reference table, typos or
inconsistent naming (e.g. "Maybank" vs "Malayan Banking Berhad") can silently
fragment reporting (dashboard pipeline counts, filters) without any error.
Introducing a real `banks` table with an FK is a candidate improvement — not yet
scoped, would need a `product-manager` decision and a `supabase-architect` migration.

## Currency

Loan amounts are stored as `numeric` (`loan_amount`) and displayed with an `RM`
prefix, formatted via `toLocaleString("en-MY")`. No multi-currency support exists or
is planned.
