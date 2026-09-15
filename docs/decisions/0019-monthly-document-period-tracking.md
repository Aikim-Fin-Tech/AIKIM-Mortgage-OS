# 0019. Monthly Document Period Tracking

Status: Accepted — code and migration authored; migration not executed
Date: 2026-09-11

## Context

Payslips and bank statements are repeating monthly evidence. Counting raw
files cannot distinguish June, July, and August from three copies of June,
and the existing type-confirmation control disappears as soon as automatic
classification assigns a type. Requirements also vary: fixed income may use
three months, while variable, commission-based, or high-OT income may require
six months under the matched mortgage rule.

## Decision

- Add nullable `documents.document_period date`, normalized to the first day
  of its calendar month.
- Require a period for `salary_slip` and `bank_statement`; reject periods for
  other document kinds.
- Enforce one document per case, type, and period with a partial unique index.
- Assign type and period atomically through the staff-only
  `assign_document_type_and_period` SECURITY DEFINER RPC.
- Treat the latest N complete calendar months as the required coverage window.
  The current incomplete month does not count. Checklist completion requires
  every expected month, not merely N uploaded files.
- Keep N rule-driven through the existing `required_count` and
  `required_months` values. No 3- or 6-month value is hard-coded in the UI or
  persistence model.
- Rename the catalog label `Latest 3 Months Payslip` to the policy-neutral
  `Salary Slip`; its UUID and all existing references remain unchanged.
- Existing monthly documents with a null period do not count until staff
  confirms their month. This favors auditable evidence over silently
  preserving potentially incorrect raw-file counts.

## Consequences

- Automatic classification may assign a monthly type, but the UI still asks
  staff to confirm its month.
- Duplicate months fail at the database boundary even under concurrent edits.
- Deleting or reclassifying a document changes completion immediately because
  completion remains derived from live document rows.
- Combined-PDF splitting, supporting-document “Others”, substitutions, and
  manual waivers remain separate future work.
