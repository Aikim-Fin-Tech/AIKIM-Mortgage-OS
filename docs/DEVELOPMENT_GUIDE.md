# Development Guide

How to actually continue work on this project — for a human or an AI
assistant picking this up fresh. If you are an AI assistant, also read
[AI_HANDOVER.md](AI_HANDOVER.md) first — it's shorter and covers what you must
never do before you touch anything.

## 0. Read These First, In Order

1. [AI_HANDOVER.md](AI_HANDOVER.md) — the condensed context-reset package
2. [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md) — 5-minute overview
3. [CURRENT_STATUS.md](CURRENT_STATUS.md) — exact feature/build state
4. The root `CLAUDE.md` — governing rules for this repo (mission,
   principles, security, migration policy, Definition of Done, approval
   workflow)
5. `docs/decisions/` — every non-trivial technical decision, in order

## 1. Local Setup

```bash
npm install
cp .env.local.example .env.local   # fill in NEXT_PUBLIC_SUPABASE_URL,
                                    # NEXT_PUBLIC_SUPABASE_ANON_KEY, GEMINI_API_KEY
npm run dev
```

No migration needs to be run for the app to boot — it will simply show empty
states for anything that depends on tables that don't exist yet on your
Supabase project. See [DATABASE.md](DATABASE.md) for what to run and in what
order, **if and when a human decides to run it** (never an agent).

## 2. Verification Before Calling Anything Done

```bash
npx tsc --noEmit
npm run lint
npm run build
```

All three must be clean. For UI changes, also exercise the actual flow in a
browser (the project has no automated test suite — see
[docs/engineering/testing-strategy.md](engineering/testing-strategy.md)).
Full Definition of Done: root `CLAUDE.md`.

## 3. The Agent Collaboration Workflow

Eight roles are defined in `.claude/agents/*.md`, each scoped to specific
files/tools:

```
product-manager → system-architect → supabase-architect (if schema involved)
  → frontend-engineer / backend-engineer → security-reviewer → qa-engineer
  → documentation-engineer
```

Full detail: [docs/engineering/ai-development-workflow.md](engineering/ai-development-workflow.md).
**These are development-time roles for building AIKIM — not a feature of the
shipped product.** Do not confuse this with "AI Agent" in a product sense.

## 4. Hard Rules (repeated because they matter most)

- **Never execute a migration.** Author a `.sql` file under
  `supabase/migrations/`, show it to the user, wait for them to run it
  manually in the Supabase SQL Editor.
- **Never put a `service_role` key in application code.**
- **Never fabricate a table, column, enum, or RPC.** Verify against
  [DATABASE.md](DATABASE.md) or the actual migration files first — and if
  this documentation and the live database ever disagree, the live database
  wins (this documentation has never been checked against a real schema
  export).
- **Never present mock/invented data as live.** If something isn't built,
  say so in the UI (see `CaseNotesCard.tsx` for the accepted "not yet
  available" pattern) — never a plausible-looking fake row.
- **Foundational/structural changes** (new docs, new agents, schema
  proposals, sprint scope) are shown to the user before creation.
- **Non-trivial features** get a `product-manager`-style scoping pass before
  implementation — ask clarifying questions on genuine ambiguity rather than
  guessing, especially anything touching money, PII, or external
  credentials/vendors.
- **Never handle secrets.** If a task needs an API key, ask the user to add
  it to `.env.local` themselves.
- **Never run `npm install` or edit `package.json` directly** if you are an
  agent operating under this repo's `.claude/settings.json` — that file
  deliberately blocks it. Ask the user to run the install.

## 5. Where Things Live

| If you need to... | Look at... |
|---|---|
| Add a new page/route | `src/app/(app)/...` (App Router, Server Components by default) |
| Add a mutation | A Server Action in the relevant `actions.ts`, Zod-validated |
| Add a read | `src/lib/database/*.ts`, never query Supabase directly from a page |
| Touch the schema | Author a migration in `supabase/migrations/`, never run it |
| Understand the Rule Engine | [RULE_ENGINE.md](RULE_ENGINE.md) |
| Understand OCR/AI | [AI_ENGINE.md](AI_ENGINE.md), [PROMPTS.md](PROMPTS.md) |
| Understand RLS/security posture | [docs/architecture/security.md](architecture/security.md) |
| Find a past decision's reasoning | `docs/decisions/0001` through `0009` |

## 6. Coding Conventions (condensed — full version: [docs/engineering/coding-standards.md](engineering/coding-standards.md))

- Server Component by default; `"use client"` only where interactivity is
  needed.
- Data-access functions never throw for expected failures — return
  `{ data, error }`.
- Raw DB enum values are lowercase snake_case; map to display labels via a
  `Record` constant — never render a raw enum value in the UI.
- Tailwind CSS 4 utilities only, slate/emerald palette, no dark mode
  (deliberately removed).
- No speculative abstraction — build what's scoped.

## 7. What NOT to Assume Exists

Because a prior conversation discussed something does not mean it was built.
Verified as **not implemented anywhere in this repo**: n8n, Supabase Edge
Functions, MCP (as a product feature), WhatsApp integration, DSR/eligibility/
recommendation logic, any automated test suite, any CI/CD, any deployment.
Always `grep` before assuming.
