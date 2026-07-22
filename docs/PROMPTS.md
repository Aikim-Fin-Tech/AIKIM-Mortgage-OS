# Prompt Library

The exact, current prompt text used in the product, copied directly from
source so this document cannot silently drift out of sync with the code — if
you change a prompt in code, update it here in the same change. See
[AI_ENGINE.md](AI_ENGINE.md) for context on when each is called.

## OCR Prompts (`src/lib/ocr/gemini-provider.ts`)

Sent alongside the document as inline image/PDF data, with Gemini's
`responseSchema` structured-output mode enforcing the JSON shape (not shown as
prompt text — it's a separate API parameter, reproduced below each prompt).

### NRIC

```
This image is a Malaysian NRIC (identity card). Extract the NRIC number and
the full name exactly as printed. If a field is not legible or not present,
return null for it — never guess or invent a value.
```

Response schema:
```ts
{
  type: OBJECT,
  properties: {
    nricNumber: { type: STRING, nullable: true, description: "The 12-digit NRIC number, digits only, no dashes." },
    fullName:   { type: STRING, nullable: true, description: "Full name exactly as printed on the card." },
  },
  required: ["nricNumber", "fullName"],
}
```

### Salary Slip

```
This image or PDF page is a Malaysian salary slip. Extract the employer name,
the basic salary, and the net (take-home) salary. If a field is not legible or
not present, return null for it — never guess or invent a value.
```

Response schema:
```ts
{
  type: OBJECT,
  properties: {
    employerName: { type: STRING, nullable: true, description: "Employer/company name as printed." },
    basicSalary:  { type: NUMBER, nullable: true, description: "Basic salary amount, numeric only, no currency symbol." },
    netSalary:    { type: NUMBER, nullable: true, description: "Net (take-home) salary amount, numeric only." },
  },
  required: ["employerName", "basicSalary", "netSalary"],
}
```

## AI Case Summary — Next Action Prompt (`src/lib/case-summary/generate-next-action.ts`)

Plain text response (no structured output). Template literal, populated from
`CaseSummaryData` (itself computed live from real tables — see
[MORTGAGE_ENGINE.md](MORTGAGE_ENGINE.md)):

```
You are assisting a mortgage banker in Malaysia with one loan case. Based only
on the facts below, suggest the single most important next action for the
banker to take right now, in one short sentence (max 20 words). Never invent
facts not given here — if income data is missing, say so rather than assuming
a value.

Customer: {customerName}
Employer: {employerName, or "Not stated on the salary slip" / "No salary slip processed yet"}
Basic Salary: {basicSalary, or "Not stated" / "Unknown"}
Net Salary: {netSalary, or "Not stated" / "Unknown"}
Missing Documents: {comma-separated list, or "None outstanding"}
Current Stage: {stage}
Current Status: {status}

Respond with only the suggested next action sentence — no preamble, no markdown.
```

## Design Notes

- Both prompts explicitly forbid inventing values — a direct response to this
  project's "real data only" principle (`CLAUDE.md`).
- Neither prompt is templated through a prompt-management library — they are
  plain TypeScript template literals. If prompt versioning/A-B testing is ever
  needed, that would be new scope, not something to assume exists.
- No conversation history or memory is passed to either call — every call is
  stateless and self-contained.
