@AGENTS.md

## Claude Code notes

- `AGENTS.md` (imported above) is the single source of truth for this repo. Update it, not this
  file, when facts change, so the two never drift apart.
- Use plan mode for anything that changes the database schema, the HTTP API shape the web
  developer relies on, or the stock rules.
- Use the `claude-api` skill before touching `packages/ai-service/src/ai.ts`; model behaviour and
  API parameters change between Claude models.
- Backend only: do not start work in `packages/web` unless asked.
