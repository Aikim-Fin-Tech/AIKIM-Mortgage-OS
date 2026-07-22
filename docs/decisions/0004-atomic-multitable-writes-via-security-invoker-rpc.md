# 0004. Atomic multi-table writes via `SECURITY INVOKER` RPC

Status: Accepted (retroactive)
Date: 2026-07-21

## Context

Creating a loan case can involve inserting a new customer and a new loan case in one
user action. Doing this as two separate client-side inserts risks an orphaned
customer row if the second insert fails (RLS denial, validation, etc.).

## Decision

Multi-table atomic operations are implemented as a single Postgres RPC, run
`SECURITY INVOKER` so existing RLS policies still authorize every statement inside it.
`create_loan_case()` is the reference implementation: it resolves the acting user
server-side, does both inserts in one transaction, and lets Postgres roll back
everything if any step fails.

## Consequences

- No orphaned rows from partial failures — the database guarantees atomicity that
  client-side sequencing cannot.
- `SECURITY INVOKER` (not `DEFINER`) means this pattern doesn't bypass RLS — the same
  scrutiny applies to it as to any other RLS-gated write.
- New multi-table mutations should follow this pattern rather than sequencing
  separate client-side calls — see
  [../engineering/coding-standards.md](../engineering/coding-standards.md).

## Evidence

`supabase/migrations/20260716020000_create_loan_case_rpc.sql`,
`src/app/(app)/loan-cases/new/actions.ts`.
