# Product Vision (Business)

> Every item below is **Future Vision** — aspirational, unscoped, not a commitment.
> Compare to [../product/roadmap.md](../product/roadmap.md), which tracks nearer-term,
> more concrete **Planned** work. This document gives `product-manager` a starting
> point, not a backlog.

## Possible directions

- **Customer-facing portal** — the `customer` role already exists in the schema with
  no UI; a self-service status view is the most natural long-horizon extension.
- **Document lifecycle** — upload, verify/reject, and requirement checklists per case,
  building on the already-live `documents` table.
- **Structured bank reference data** — replace the free-text `bank_name` (see
  [bank-rules.md](bank-rules.md)) with a real table if reporting accuracy becomes a
  problem.
- **Multi-branch/multi-agency support** — not evidenced anywhere in the current
  schema or role model; would require real design work, not an incremental change.
- **Analytics** — the Sidebar already reserves a nav slot for this; no design exists.

## What this is not

- Not a promise to any of the above.
- Not a substitute for an ADR (see [../decisions/](../decisions/)) or a
  `product-manager`-scoped spec when any of this actually gets picked up.
