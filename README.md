# AIKIM Mortgage OS

The single system of record for a mortgage case's lifecycle in Malaysia —
from first enquiry through bank submission to approval — with real-time,
role-scoped visibility for bankers, property agents, and mortgage outsource
agents. A long-term SaaS product, not a demo: it handles real customers' money
and regulated personal data.

## New to this project?

**Start with [docs/AI_HANDOVER.md](docs/AI_HANDOVER.md)** — a condensed
context-reset package written so a brand-new developer or AI assistant can
continue work without reading any prior conversation. Then
[docs/PROJECT_SUMMARY.md](docs/PROJECT_SUMMARY.md) for the 5-minute overview,
and [docs/README.md](docs/README.md) for the full documentation index.

## Stack

Next.js 16.2.10 (App Router, Turbopack), React 19.2.4, Tailwind CSS 4,
Supabase (Postgres + Auth + Storage + PostgREST), Gemini 2.5 Pro (OCR + AI
summary). No separate backend service.

> Next.js 16 has breaking changes from typical training data — read
> [`AGENTS.md`](AGENTS.md) before writing any framework code.

## Local Setup

```bash
npm install
cp .env.local.example .env.local
# Fill in: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, GEMINI_API_KEY
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**No database migration needs to be run for the app to boot** — pages will
show empty states for anything depending on tables not yet created on your
Supabase project. See [docs/DATABASE.md](docs/DATABASE.md) for what exists and
in what order it would need to run — **migrations in this project are always
authored for human review and run manually in the Supabase SQL Editor, never
executed by an AI agent.**

## Verification

```bash
npx tsc --noEmit
npm run lint
npm run build
```

All three must be clean before any change is considered done. Full Definition
of Done: [CLAUDE.md](CLAUDE.md).

## Current Status

Not deployed anywhere. Of the original 8 migrations, 6 have been executed
against the live database (2 early draft files were superseded and
intentionally never run). None of the 11 migrations added since for the
Mortgage Knowledge Database (Income, Commitment, DSR Rules, Property Rules,
and Eligibility Engine — backend/schema only, no UI yet) have been executed
yet. See [docs/CURRENT_STATUS.md](docs/CURRENT_STATUS.md) for the exact,
current build/feature state, and [docs/ROADMAP.md](docs/ROADMAP.md) for
what's next.

## Documentation

Full index: [docs/README.md](docs/README.md). Governing engineering rules for
this repo: [CLAUDE.md](CLAUDE.md). Every non-trivial technical decision:
[docs/decisions/](docs/decisions/).

## License

Private. All rights reserved.
