# Release Checklist

## Current reality

- No deployment pipeline or hosting configuration exists in this repo (no CI/CD
  config, no `vercel.json`).
- Release today, if it happens, is a manual process outside this repo's tooling.

## Manual checklist (until a pipeline exists)

- [ ] `npx tsc --noEmit` and `npx eslint .` clean on the commit being released
- [ ] All required env vars present in the target environment:
      `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
      (see `.env.local.example`)
- [ ] Every migration the release depends on has actually been run against the target
      database by a human — confirm, don't assume (see
      [Migration Policy](../../CLAUDE.md#migration-policy))
- [ ] `docs/product/roadmap.md` reflects what's shipping
- [ ] No secret or `.env.local` committed

## Planned

> **Status: Planned.** Not implemented.

- Staging environment separate from production Supabase project.
- Automated build + deploy pipeline gated on CI passing.
- Rollback procedure.
- Release notes / changelog generation.
