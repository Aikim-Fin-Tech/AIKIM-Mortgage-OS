# Vision

> 5-minute overview built on this: [../PROJECT_SUMMARY.md](../PROJECT_SUMMARY.md).

AIKIM Mortgage OS is the single system of record for a mortgage case's lifecycle in
Malaysia: who the customer is, which bank and banker are involved, what stage the
case is at, what documents exist, and a full audit trail.

## Problem

Mortgage operations today are coordinated across spreadsheets, WhatsApp, and phone
calls. Case status is invisible to anyone off the thread, documents get lost between
handoffs, and there is no single record of what happened and when.

## Roles

| Role | Enum value | Needs |
|---|---|---|
| Super Admin | `super_admin` | Full visibility, audit trail, all cases |
| Banker | `banker` | Assigned cases, document status, customer contact |
| Property Agent | `property_agent` | Cases they originated, progress visibility |
| Mortgage Outsource Agent | `mortgage_outsource_agent` | Cases they work, document status |
| Customer | `customer` | Own case status — **Planned**, no UI built yet |

## Principles

1. Real data or nothing — every number/list comes from the live database via RLS.
2. RLS is the authorization model, not app code.
3. The case lifecycle (`loan_cases`) is the spine of the product.
4. Malaysian mortgage context is specific, not a generic deal pipeline.

## Non-goals (current)

- Not a generic CRM.
- Not a document e-signature or compliance-filing product.
- Not customer-facing yet.

See [roadmap.md](roadmap.md) for what's built vs. planned, and
[../business/product-vision.md](../business/product-vision.md) for longer-horizon
direction.
