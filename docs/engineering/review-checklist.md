# Review Checklist

Manual checklist today — no CI enforcement exists yet (see
[testing-strategy.md](testing-strategy.md)).

## Every change

- [ ] `npx tsc --noEmit` clean
- [ ] `npx eslint .` clean
- [ ] No mock/invented data presented as real
- [ ] No fabricated table/column/enum/RPC name — verified against
      [../architecture/database.md](../architecture/database.md)
- [ ] Matches [coding-standards.md](coding-standards.md)

## If it touches auth, RLS, or PII

- [ ] `security-reviewer` pass completed — see
      [../architecture/security.md](../architecture/security.md) checklist
- [ ] No `service_role` usage
- [ ] Any new `SECURITY DEFINER` function has a documented reason

## If it touches the schema

- [ ] Migration file is idempotent
- [ ] Migration does not touch existing row data unless that's its stated purpose
- [ ] Migration is authored only — not executed by the agent
- [ ] [../architecture/database.md](../architecture/database.md) updated in the same
      change
- [ ] Considered for an ADR in [../decisions/](../decisions/)

## If it changes behavior a user can see

- [ ] `qa-engineer` actually exercised the flow (not just types)
- [ ] Relevant `docs/` updated by `documentation-engineer`
