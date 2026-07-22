# Deployment

**Current reality: this project is not deployed anywhere.** No hosting, no
CI/CD, no staging environment exist. This document is mostly a checklist of
what's needed, not a description of something running. Fuller version of the
manual checklist: [docs/engineering/release-checklist.md](engineering/release-checklist.md).

## What Exists Today

- A working `npm run dev` / `npm run build` / `npm run start` locally.
- Environment variables required (see `.env.local.example`):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `GEMINI_API_KEY` (server-side only, never `NEXT_PUBLIC_`)
- A GitHub remote: `https://github.com/Aikim-Fin-Tech/AIKIM-Mortgage-OS.git`,
  `main` branch only. **The latest checkpoint commit has not been pushed.**

## What Does Not Exist

- No hosting target (Vercel, or otherwise) configured.
- No CI pipeline (no `.github/workflows/`).
- No staging environment separate from whatever Supabase project the local
  `.env.local` points at.
- No automated migration-running step — see [DATABASE.md](DATABASE.md);
  migrations are always run manually by a human in the Supabase SQL Editor,
  by explicit project policy (`CLAUDE.md` Migration Policy). This is true in
  production too, not just locally — **no deployment process should ever
  auto-run a migration.**

## Manual Pre-Deploy Checklist (until a pipeline exists)

- [ ] `npx tsc --noEmit` and `npm run lint` clean on the commit being released
- [ ] All 3 required env vars present in the target environment
- [ ] Every migration the release depends on has been run against the target
      database **by a human** — confirm, don't assume
- [ ] `docs/CURRENT_STATUS.md` reflects what's shipping
- [ ] No secret or `.env.local` committed
- [ ] `git push` only after explicit approval — this project's convention is
      to hold local checkpoint commits until a human says to push

## Planned (Not Implemented)

- A real hosting target and deployment pipeline.
- Staging environment separate from production Supabase project.
- Rollback procedure.
- Release notes / changelog automation (until then, see [CHANGELOG.md](CHANGELOG.md)
  for the manual version).

## WhatsApp Deployment Blocker

Receiving WhatsApp messages requires a webhook reachable over public HTTPS —
this is blocked on deployment existing at all, in addition to needing a
WhatsApp Business API account. See [ARCHITECTURE.md](ARCHITECTURE.md) and
[TODO.md](TODO.md).
