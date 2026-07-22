# AI Engine

Everything the AIKIM product actually uses AI for, as of this writing. Full
architecture decision reasoning: [ADR 0008](decisions/0008-ocr-and-ai-case-summary.md).
Exact prompt text: [PROMPTS.md](PROMPTS.md). Rule-matching logic (deliberately
**not** AI): [RULE_ENGINE.md](RULE_ENGINE.md).

## AI Agent

**There is no autonomous AI agent, agentic loop, or tool-use framework in the
product itself.** The `.claude/agents/*.md` files are development-time roles
for Claude Code (used to *build* AIKIM), not a runtime feature of the shipped
application — see [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md). Do not confuse
the two when reading this documentation set.

The product's only two AI call sites are both single-shot, single-purpose
Gemini calls with no memory, no chaining, and no autonomy:
1. OCR extraction (`GeminiOCRProvider.extract()`)
2. AI Case Summary's next-action suggestion (`generateNextAction()`)

## Workflow (n8n)

**Not implemented, not planned, never previously part of this project.** No
workflow automation tool of any kind is integrated.

## Mortgage Logic

Lives entirely outside the AI Engine — see [RULE_ENGINE.md](RULE_ENGINE.md) and
[MORTGAGE_ENGINE.md](MORTGAGE_ENGINE.md). Deliberate design choice: rule data
is database-driven, rule *matching* is a pure TypeScript function, not an LLM
call.

## Screening Logic

**Not implemented.** DSR calculation, eligibility screening, and bank-product
matching are explicitly out of scope until approved — see
[ROADMAP.md](ROADMAP.md) Phase 3.

## Document Analysis (OCR)

- **Provider**: Gemini 2.5 Pro (`gemini-2.5-pro`), via `@google/generative-ai`.
- **Interface**: `OCRProvider` (`src/lib/ocr/types.ts`) — the only thing
  application code depends on. `GeminiOCRProvider` is the sole implementation;
  swapping providers means adding a new class and changing one line in
  `src/lib/ocr/get-ocr-provider.ts`.
- **Supported document kinds**: `nric`, `salary_slip`. Adding a new kind is
  additive (new type + new prompt/schema entry) — the interface itself never
  changes.
- **Output mode**: Gemini's structured-output (`responseSchema`), not free-text
  parsing — the model is constrained to return exactly the requested JSON
  shape.
- **Trigger**: manual, per-document "Extract Data" button on the Documents tab
  — never automatic on upload (cost/latency control, banker retains control).
- **Storage**: every attempt (success or failure) is stored as a new
  `document_extractions` row — append-only, nothing is silently retried over a
  past result.
- **Verification status**: proven working end-to-end against synthetic test
  fixtures (a hand-built minimal PDF). Real documents have never been
  processed — blocked on the Google Cloud project's Gemini billing tier
  (`429 quota exceeded, limit: 0` on the free tier for `gemini-2.5-pro`).

## Knowledge Engine

The "knowledge" the mortgage rules matcher draws on is `mortgage_rules` +
`mortgage_rule_documents` (database tables, admin-managed). See
[RULE_ENGINE.md](RULE_ENGINE.md). **Zero rule data is seeded** — this is by
design (no mock data), not an oversight.

## Prompt Structure

Both prompts are plain string templates (not a prompt-management library or
template engine) — see [PROMPTS.md](PROMPTS.md) for the exact, current text
of each. Both explicitly instruct the model never to invent a value it
isn't given or can't read.

## JSON Output

OCR uses Gemini's native structured-output schema (`SchemaType.OBJECT` with
typed, nullable properties) — see [PROMPTS.md](PROMPTS.md) for the exact
schema definitions. The AI Case Summary's next-action call does **not** use
structured output — it returns plain text (a single sentence), by design,
since the output is prose, not structured data.

## Rule Engine

Covered in depth in [RULE_ENGINE.md](RULE_ENGINE.md) — included here only to
confirm explicitly: **the Rule Engine is not part of the AI Engine.** It is a
separate, deterministic, non-AI system. This separation is a deliberate
architectural decision (see [ADR 0006](decisions/0006-mortgage-rules-engine.md)),
not an accident of naming.

## Shared Infrastructure

`src/lib/ai/get-gemini-client.ts` — the single construction point for the
Gemini client (reads `GEMINI_API_KEY`, throws loudly if missing), used by both
OCR and the AI Case Summary so this logic exists exactly once.
