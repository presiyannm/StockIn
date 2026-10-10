# packages/api

Fastify HTTP API on :3001. It is the only service that talks to Postgres and photo storage,
and the only one the web app talks to. Project-wide rules are in the root `AGENTS.md`.

## Responsibilities

- Delivery lifecycle: `draft -> scanning -> reconciled -> closed`.
- Stores invoices, scans, findings, issues, photos, reports and stock movements.
- Runs the deterministic reconciliation and stock rules.
- Calls `ai-service` over HTTP for anything that needs Claude.
- Serves the printable supplier report (`/api/deliveries/:id/report.html`).

## Files (`src/`)

| File | What it does |
|---|---|
| `index.ts` | Builds the Fastify app, registers CORS, multipart and routes |
| `routes.ts` | Every HTTP route and the shared error handler |
| `reconcile.ts` | Pure functions: `reconcile` (invoice vs scans -> findings), `stockSplit` (sellable vs excluded) and `buildItemRows` (every delivery item for the report) |
| `reconcile.test.ts` | Unit tests for the functions above |
| `aiClient.ts` | The only code that calls `ai-service` (`extractInvoice`, `identifyProduct`, `draftSupplierMessage`, `aiAvailable`) |
| `storage.ts` | R2 upload/download/presigned URLs, with a local `uploads/` fallback when `R2_*` is empty |
| `db.ts` | `pg` pool, `query` helper, DATE type parser |
| `reportHtml.ts` | HTML for the printable supplier report |
| `config.ts` | Reads `packages/api/.env` once |

Env vars (`.env.example` lists them): `DATABASE_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `PORT`, `AI_SERVICE_URL`, `AI_SERVICE_TOKEN`.
This package must never hold the Anthropic key.

## Rules

- **Stock rules** (`stockSplit`): received goods enter stock, except quantity reported
  `expired`, `damaged` or `wrong_item`, which is left out of stock and kept only in the report
  (capped at what was received). `short` and `other` reports do not move stock. Units above the invoiced quantity stay out of
  stock until confirmed per product (`excess_acceptances`, `PUT /api/deliveries/:id/excess/:productId`). Changing these changes real inventory, so
  update the tests and the README in the same change.
- **Idempotency:** `reconcile` and `finish` must be safe to call twice. `finish` on a closed
  delivery returns the existing report and writes nothing.
- **Dates:** DATE columns come back as `YYYY-MM-DD` strings via the type parser in `db.ts`.
  Do not remove it, or expiry dates shift by a day.
- **Transactions:** multi-statement writes use `pool.connect()` with BEGIN/COMMIT/ROLLBACK
  (see `invoice`, `reconcile`, `finish` in `routes.ts`).
- **AI availability:** check `aiAvailable()` before storing an invoice, so a down ai-service
  never leaves a half-saved invoice. Report drafting falls back to a plain template when the
  AI call fails. `AiServiceError` becomes a 503 through the error handler.
- **Report language:** the supplier report is always English, even for a Bulgarian invoice.
  The interface is English too. Invoice `language` is still extracted but does not affect the report.
- **Requested resolution** is set by the user once per delivery (`PATCH /api/deliveries/:id`) and
  copied to the report by `finish`. The AI never writes or suggests one.
- **Findings come only from `reconcile`.** Invoice lines the AI could not match to a product
  become `mismatch` findings for a human; never guess a match here.
- **Issues:** any product can be reported, including ones that matched perfectly. Types:
  `short`, `expired`, `damaged`, `wrong_item`, `other`.
- Multipart routes read files with `readMultipart` in `routes.ts`; photo fields are named
  `photo`.

## Adding or changing a route

1. Add it in `routes.ts` (use `query` for reads, a pooled client for multi-step writes).
2. Update the API table in the root `README.md`; the web app relies on it.
3. If it needs the DB shape to change, edit `db/schema.sql` and run `npm run db:reset`
   (this wipes data; say so), since the SQL only runs on a fresh volume.
4. If it needs Claude, add the capability in `packages/ai-service` and the contract in
   `packages/shared` first, then a function in `aiClient.ts`.

## Verify

```bash
npm run typecheck -w @stockin/api
npm test -w @stockin/api
```

For route changes, run the full flow from the root `AGENTS.md` ("Verifying your work") against
the real database, then clean up the test rows.
