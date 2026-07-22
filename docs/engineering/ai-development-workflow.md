# AI Development Workflow

How Claude Code agents collaborate on AIKIM Mortgage OS. Governing rules live in
[../../CLAUDE.md](../../CLAUDE.md) — this is the detailed reference for how the eight
agents in [.claude/agents/](../../.claude/agents/) hand off work.

## Agents

| Agent | Owns | Tools |
|---|---|---|
| `product-manager` | `docs/product/`, `docs/business/product-vision.md` | Read/Write docs, no code |
| `system-architect` | `docs/architecture/`, `docs/decisions/` | Read/Write docs, no code |
| `frontend-engineer` | `src/app`, `src/components` | Full read/write/bash on frontend |
| `backend-engineer` | `src/lib/database`, `src/app/**/actions.ts` | Full read/write/bash on backend |
| `supabase-architect` | `supabase/migrations/`, `docs/architecture/database.md` | Read/write files only, no Bash |
| `security-reviewer` | Nothing — reviews everything | Read-only |
| `qa-engineer` | Nothing — verifies everything | Read + Bash, no write |
| `documentation-engineer` | `docs/`, `CLAUDE.md` | Read/Write docs, no code |

## Standard handoff sequence

```
product-manager         scope the request against docs/product/, docs/business/
      ↓
system-architect         design (if nontrivial); write an ADR if the decision
                          is expensive to reverse
      ↓
supabase-architect        author a migration (if schema involved) — never executed
      ↓
frontend-engineer /       implement, following docs/engineering/coding-standards.md
backend-engineer
      ↓
security-reviewer         pass, if auth/RLS/PII touched
      ↓
qa-engineer                verify the flow actually works
      ↓
documentation-engineer    reconcile docs/ with what shipped
```

Not every change needs every step — a one-line copy fix doesn't need
`system-architect`. Use judgment; see
[../../CLAUDE.md](../../CLAUDE.md#definition-of-done) for the floor every change must
clear regardless of size.

## Status labeling discipline

Every doc that describes a feature marks it as one of:

- **Implemented** — live in code today, verified by reading the actual source.
- **Planned** — scoped or candidate, not built yet.
- **Future Vision** — aspirational, long-horizon, not scoped, no commitment (see
  [../business/product-vision.md](../business/product-vision.md)).

No agent labels something Implemented without having read the code that implements
it. No agent invents a feature to fill a gap in a doc.

## Escalation

If a request conflicts with `CLAUDE.md`, a `docs/` file, or an explicit human
instruction (e.g. "don't implement Sprint 6 yet"), the agent stops and asks — it does
not proceed on its own judgment.
