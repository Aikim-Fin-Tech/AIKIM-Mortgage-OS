@AGENTS.md

# AIKIM Development OS v1.0

AIKIM Mortgage OS is a long-term SaaS product, not a demo. This file governs how
engineering work is done on it — by humans and by Claude Code agents. It complements,
never overrides, the safety rules in the system prompt.

**New session / context reset? Read [docs/AI_HANDOVER.md](docs/AI_HANDOVER.md) first**
— it is the condensed, self-contained package covering current state, every
important design decision, and next-phase goals. This file (`CLAUDE.md`) governs
*how* to work; `docs/AI_HANDOVER.md` and [docs/DEVELOPMENT_GUIDE.md](docs/DEVELOPMENT_GUIDE.md)
cover *what exists and what's next*.

## Product Mission

Be the single system of record for a mortgage case's lifecycle in Malaysia — from
first enquiry through bank submission to approval — with real-time, role-scoped
visibility for bankers, property agents, and mortgage outsource agents. See
[docs/product/vision.md](docs/product/vision.md).

## Business Principles

- This handles real customers' money and regulated personal data (NRIC, financial
  details). Treat every feature as compliance-relevant, not a toy.
- The product must outlive any single developer or agent session. Optimize for a
  future maintainer who has none of today's context.
- Auditability is a business requirement, not a nice-to-have — every state change
  should be traceable to who did it and when (see `audit_logs` in
  [docs/architecture/database.md](docs/architecture/database.md)).
- Malaysian mortgage operations are specific (banks, stages, roles) — do not
  generalize into a generic CRM without an explicit product decision (see
  [docs/business/](docs/business/)).

## Engineering Principles

- Real data only. Never present mock/invented data as if it were live (see
  [docs/product/roadmap.md](docs/product/roadmap.md) for what's actually built).
- RLS is the authorization boundary, not application code. See
  [docs/architecture/security.md](docs/architecture/security.md).
- No speculative abstraction. Build what's scoped, not what might be needed later.
- Every non-trivial technical decision gets an ADR in
  [docs/decisions/](docs/decisions/) — see the template there.
- Every doc distinguishes **Implemented**, **Planned**, and **Future Vision** — see
  [docs/engineering/ai-development-workflow.md](docs/engineering/ai-development-workflow.md).
- Full conventions: [docs/engineering/coding-standards.md](docs/engineering/coding-standards.md).

## Security Rules

- `service_role` key never appears in application code.
- Postgres functions default to `SECURITY INVOKER`; `SECURITY DEFINER` requires a
  documented reason.
- Never log secrets, tokens, cookies, session contents, or raw NRIC/IC numbers.
- Never import the deprecated `src/lib/supabase.ts` flat client in new code.
- Full detail: [docs/architecture/security.md](docs/architecture/security.md).

## Migration Policy

- No agent ever executes a migration. Migrations are SQL files under
  `supabase/migrations/`, authored for human review, run manually in the Supabase
  SQL Editor.
- Every migration is idempotent, never touches existing row data unless that is its
  stated purpose, and updates
  [docs/architecture/database.md](docs/architecture/database.md) in the same unit of
  work.
- No agent assumes a committed migration file has actually been applied to the live
  database without user confirmation.

## Definition of Done

A change is done only when:
1. It matches an approved scope (see Approval Workflow).
2. `npx tsc --noEmit` and `npx eslint .` are clean.
3. Security-sensitive changes have a `security-reviewer` pass.
4. The relevant flow was actually exercised (not just typechecked) by `qa-engineer`.
5. Affected docs are updated by `documentation-engineer` in the same unit of work.
6. No mock/invented data was introduced.
7. Any schema change is an unexecuted migration file, not a live change.

## Approval Workflow

- **Foundational/structural changes** (new docs, new agents, settings, schema
  proposals, sprint scope) are shown to the user before creation and require explicit
  approval.
- **Schema changes** are always authored, never executed, and always reviewed by a
  human before being run.
- **Non-trivial features** require `product-manager` scope confirmation before
  implementation starts.
- **Security-sensitive changes** (auth, RLS, PII handling) require a
  `security-reviewer` pass before being considered mergeable.
- Explicit human constraints (e.g. "don't implement Sprint 6 yet") are hard limits —
  an agent that hits one stops and asks rather than proceeding.

## AI Agent Collaboration Workflow

Eight agents are defined in [.claude/agents/](.claude/agents/), each scoped to a
specific role and a specific set of tools:

`product-manager` → `system-architect` → `supabase-architect` (if schema involved) →
`frontend-engineer` / `backend-engineer` → `security-reviewer` → `qa-engineer` →
`documentation-engineer`

Full handoff detail:
[docs/engineering/ai-development-workflow.md](docs/engineering/ai-development-workflow.md).

Rules for every agent:
- Stay inside your file/tool scope; hand off work that belongs to another role rather
  than overreaching.
- Never fabricate a table, column, enum, RPC, or feature — verify against `docs/` or
  the actual code first.
- If a request conflicts with this file, a `docs/` file, or an explicit human
  instruction, say so and ask rather than proceeding.
