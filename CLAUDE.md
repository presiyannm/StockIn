@AGENTS.md

@BUSINESS_REQUIREMENTS.md

Shared product requirements: [BUSINESS_REQUIREMENTS.md](BUSINESS_REQUIREMENTS.md).
Read alongside the existing settings; confirmed product decisions there take precedence
over older product descriptions, including report language and coverage.

## Claude Code notes

- `AGENTS.md` (imported above) is the source of truth for the repo. Update it, not this file,
  when facts change, so the two never drift apart. Each package follows the same pattern: an
  `AGENTS.md` plus a `CLAUDE.md` that imports it.
- Use plan mode for changes to the database schema, the HTTP API shape, or the stock rules.
- Use the `claude-api` skill before touching `packages/ai-service/src/ai.ts`; model behaviour and
  API parameters change between Claude models.
