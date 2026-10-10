# packages/shared

Types shared between `packages/api` and `packages/ai-service`: the contract for the
`/extract-invoice`, `/identify-product` and `/draft-message` calls. Project-wide rules are in
the root `AGENTS.md`.

## Rules

- **Types only.** The one runtime export is the `SERVICE_TOKEN_HEADER` constant. No logic, no
  dependencies, no I/O.
- Consumers import with `import type { ... } from "@stockin/shared"`. The package is source-only
  (`exports` points at `src/index.ts`; there is no build step).
- **A change here is a change to both services.** Update `packages/ai-service` (the producer)
  and `packages/api/src/aiClient.ts` (the consumer) in the same change, and run
  `npm run typecheck` from the root so both are checked.
- Do not put database row types or web-facing response types here. This package is the
  api <-> ai-service contract; the web app's contract is the HTTP API in the root `README.md`.
- Keep field names in `snake_case` to match the JSON on the wire.

## Verify

```bash
npm run typecheck        # from the root, checks every package against these types
```
