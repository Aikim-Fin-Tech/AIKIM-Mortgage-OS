# Architecture Decision Records

> All 9 decisions condensed into one section: [../AI_HANDOVER.md](../AI_HANDOVER.md)
> ("All Important Design Decisions"). Read here for full reasoning per decision.

ADRs capture significant technical decisions for AIKIM Mortgage OS: what was decided,
why, and what it costs. Use [template.md](template.md) for new ones.

## When to write one

Any decision that's expensive to reverse or that a future maintainer would otherwise
have to reverse-engineer from the code: choice of backend, authorization model,
session strategy, a new architectural pattern.

## Process

1. Copy `template.md` to `NNNN-short-title.md` (next sequential number).
2. Status starts as `Proposed`.
3. `system-architect` (or the relevant agent) and the user agree on the decision;
   status becomes `Accepted`.
4. If later reversed, status becomes `Superseded by NNNN`, linking the new ADR — the
   old one is never deleted.

## Index

| # | Title | Status |
|---|---|---|
| [0001](0001-use-supabase-for-backend-and-auth.md) | Use Supabase for backend, auth, and data access | Accepted (retroactive) |
| [0002](0002-rls-as-sole-authorization-boundary.md) | RLS as the sole authorization boundary | Accepted (retroactive) |
| [0003](0003-nextjs16-proxy-as-session-boundary.md) | Next.js 16 `proxy.ts` as the session/auth boundary | Accepted (retroactive) |
| [0004](0004-atomic-multitable-writes-via-security-invoker-rpc.md) | Atomic multi-table writes via `SECURITY INVOKER` RPC | Accepted (retroactive) |
| [0005](0005-document-storage-model.md) | Document storage model for Sprint 6.1 | Proposed (migration authored, not confirmed run) |
| [0006](0006-mortgage-rules-engine.md) | Mortgage Rules Engine — matching in TypeScript, rule data in the database | Proposed (migration authored, not confirmed run) |
| [0007](0007-mortgage-rule-admin.md) | Mortgage Rule Admin — dimension-driven matcher, deactivate-only rules | **Frozen** — paused for the 14-day Banker MVP sprint, not abandoned |
| [0008](0008-ocr-and-ai-case-summary.md) | OCR (Gemini 2.5 Pro) and AI Case Summary | Proposed (migration authored, not confirmed run) — dependency installed, key configured, verified working end-to-end pending Gemini billing |
| [0009](0009-loan-processing-workflow.md) | Loan Processing Workflow — status pipeline, timeline, and 3 no-AI scores | Proposed (migration authored, not confirmed run) |
| [0010](0010-income-knowledge-implementation.md) | Income Knowledge Implementation — Sprint 6.3B-1 | Proposed (migrations authored, not confirmed run) |
| [0011](0011-commitment-knowledge-implementation.md) | Commitment Knowledge Implementation — Sprint 6.3B-2 | Proposed (migrations authored, not confirmed run) |
| [0012](0012-dsr-knowledge-implementation.md) | DSR Rules Knowledge Implementation — Sprint 6.3B-3 | Proposed (migrations authored, not confirmed run) |

"Retroactive" means the decision was already implemented in the codebase before this
ADR was written; the ADR documents evidence found in code, it does not introduce a
new decision.
