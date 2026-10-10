# packages/ai-service

Stateless Fastify service on :3002. It is the only place the Anthropic key lives. It reads
invoices, identifies products from photos and drafts supplier messages. It has no database and
no storage: images and the product catalogue arrive in every request. Project-wide rules are in
the root `AGENTS.md`.

## Endpoints

All routes except `/health` require the `x-service-token` header (`AI_SERVICE_TOKEN`).

| Method | Path | Input | Output (type in `packages/shared`) |
|---|---|---|---|
| GET | `/health` | none | `{ ok, ai }` (`ai` is false when no Anthropic key is set) |
| POST | `/extract-invoice` | multipart: image files + JSON field `products` | `ExtractedInvoice` |
| POST | `/identify-product` | multipart: one image + JSON field `products` | `IdentifyResult` |
| POST | `/draft-message` | JSON `DraftMessageRequest` | `DraftMessageResponse` |

## Files (`src/`)

| File | What it does |
|---|---|
| `index.ts` | Builds the app and listens |
| `app.ts` | Fastify instance, multipart, token check and key-present hooks |
| `routes.ts` | `/health` and the three AI routes, multipart parsing (`readRequest`) |
| `docs.ts` | Swagger UI at `/docs` (JSON at `/docs/json`) and the per-route doc schemas. Documentation only: validation and serialization are off, so keep the schemas in step with `packages/shared` by hand |
| `claude/client.ts` | Anthropic client, `aiEnabled`, `requireClient` |
| `claude/callJson.ts` | `callJson`: structured-output call, handles `refusal` and `max_tokens` |
| `claude/schema.ts` | `strictSchema` |
| `claude/content.ts` | `ImageInput`, `imageBlock`, `catalogueText` |
| `capabilities/*.ts` | One file per capability: prompt + schema + function (`extractInvoice`, `identifyProduct`, `draftSupplierMessage`) |
| `config.ts` | Reads `packages/ai-service/.env` once |

Env vars (`.env.example`): `ANTHROPIC_API_KEY`, `ANTHROPIC_WORKSPACE_ID`, `CLAUDE_MODEL`,
`PORT`, `AI_SERVICE_TOKEN` (must match the api's). This package must never hold database or R2
credentials.

## Rules

- **Model:** `claude-sonnet-5-5`. It rejects forced `tool_choice` (400), so do not use
  `tool_choice: { type: "tool" }`. Get JSON with structured outputs
  (`output_config.format = { type: "json_schema", schema }`) and `JSON.parse` the text block.
  `callJson` already does this and handles `refusal` and `max_tokens`.
- **Schemas:** `strictSchema` closes objects (`additionalProperties: false`) and turns
  `["x","null"]` into `anyOf`. Write schemas in the readable form and let it convert them.
- **Workspace header:** the key is not workspace-scoped, so requests send
  `anthropic-workspace-id` from `ANTHROPIC_WORKSPACE_ID`.
- **Prompts:** never invent invoice lines or numbers; lower `confidence` for anything unreadable;
  return `product_id: null` when not clearly matched; for product photos, return null rather
  than guess. Invoices may be Bulgarian or English.
- **No decisions here.** This service reads, matches, explains and drafts. Comparing quantities
  and changing stock belongs to `packages/api`.
- Use the `claude-api` skill (Claude Code) before changing request parameters; they change
  between models.

## Adding a capability

1. Add request/response types to `packages/shared/src/index.ts`.
2. Add the function and prompt in a new `capabilities/<name>.ts` using `callJson`, and the route in `routes.ts`.
3. Add the matching client function in `packages/api/src/aiClient.ts`.
4. Add its doc schema to `docs.ts` (`routeDocs`) and pass it as `{ schema }` on the route.
5. Document the endpoint in the table above and in the root `README.md` if the api exposes it.

## Verify

```bash
npm run typecheck -w @stockin/ai-service
```

There are no unit tests (the logic is a thin layer over Claude). Verify with the real service:
start it with `npm run dev -w @stockin/ai-service`, then call it through the api with
`samples/bg-invoice.png` (expect 4 lines, invoice 4471, language `bg`). Real calls cost money and
need a valid key; mention it before running many.
