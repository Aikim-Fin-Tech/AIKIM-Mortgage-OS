# TODO / Technical Debt

Every known gap, verified against the repository as of this writing. Nothing
here is invented — items without a clear source are marked as such.

## Blocking Production

- [ ] **No migration has ever been executed against the live database.** 8
      files in `supabase/migrations/`, 0 confirmed run. See [DATABASE.md](DATABASE.md).
- [ ] **No real schema export exists.** Every table/column claim in this
      documentation set is reconstructed from migration files and code
      comments, never verified against a live `pg_dump` or Supabase schema
      pull. Producing a real baseline is a standing priority.
- [ ] **Zero mortgage rule data seeded.** The Rule Engine works but has
      nothing to match against.
- [ ] **Gemini billing** — `gemini-2.5-pro` returns `429 quota exceeded,
      limit: 0` on the free tier for the configured API key/project. OCR and
      AI Case Summary cannot process a real document until this is resolved.
- [ ] **No deployment target exists.** See [DEPLOYMENT.md](DEPLOYMENT.md).

## Open Product Questions (need a decision before work can start)

- **Dashboard buckets**: what distinguishes "Waiting Customer" from "Need
  Documents"? The latter maps cleanly to the Required Documents checklist;
  the former doesn't correspond to anything in the current schema.
- **Dashboard "My Cases"**: scope by `loan_cases.created_by` (the only
  ownership field any code here has ever queried) — or does a real
  `assigned_agent_id` column exist live that should be used instead? A stray
  code comment references this column but no code has ever queried it.
- **WhatsApp provider**: Meta Cloud API directly, or a BSP (Twilio,
  360dialog, Gupshup)? Also blocked on deployment (see above).

## Known Code-Level Issues

- **`CaseActivityTimeline.tsx`** (`src/components/loan-cases/detail/`) is no
  longer imported by any page — superseded by `CaseTimelineCard` (see
  [WORKFLOW.md](WORKFLOW.md)) but not deleted. Harmless dead code; candidate
  for removal.
- **`mortgage_cases` table** — legacy/duplicate of `loan_cases`, must never be
  queried, not scheduled for removal. Exists only as a warning comment in
  `src/lib/database/loan-cases.ts`.
- **`document_types.ocr_kind`** — every row will be `null` (not OCR-eligible)
  until a human manually tags the real NRIC/salary-slip document types via
  SQL. No admin UI exists for this field specifically.
- **RLS policies referenced but not committed**: `loan_cases_insert_staff`,
  `loan_cases_select_scope`, `customers_insert_staff`,
  `customers_select_staff_or_self`. These predate this documentation effort
  and their exact definitions have never been exported into this repo.
- **`bank_name` is free text**, not a foreign key to a real `banks` table — a
  typo (e.g. "Maybank" vs "Malayan Banking Berhad") can silently fragment
  dashboard/report aggregates. See [docs/business/bank-rules.md](business/bank-rules.md).

## Not Started (by design, not oversight)

- Customers module, Bankers module (no list/detail UI for either)
- Case Notes, Follow-ups (no backing table)
- Document verify/reject workflow
- Linking checklist completion to automatic stage transitions
- Dashboard status-bucket view
- WhatsApp document receipt
- Automated tests of any kind (no test framework in this repo)
- CI/CD pipeline
- Mortgage Rule Admin UI is **frozen** (built, working, paused by explicit
  instruction — not broken, not abandoned)

## Explicitly Out of Scope (not a bug, a boundary)

- OCR beyond NRIC/salary slip (no other document kind is planned yet)
- DSR calculation, eligibility screening, bank-product matching,
  recommendation engine
- Any chatbot or automation on WhatsApp (receive-and-attach only, if/when built)
- n8n, Edge Functions, MCP — never part of this project; treat any future
  mention as entirely new scope

## Future Improvements (not urgent, worth knowing about)

- Reorder controls (rule documents, categories) are up/down buttons, not
  drag-and-drop — adequate at admin scale, could be upgraded later.
- The Rule Engine's checklist reconciliation isn't atomic (multiple sequential
  Supabase calls, not one transaction) — a deliberate trade-off, see
  [RULE_ENGINE.md](RULE_ENGINE.md).
- `mortgage_rules`' partial unique index (preventing duplicate active
  rule+version) doesn't catch two fully-wildcard rules created with subtly
  different casing/whitespace — rule data is human-curated and low-volume, so
  this is accepted for now.
