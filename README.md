# StockIn

AI-assisted goods receiving. A person at the door photographs the supplier invoice,
scans what arrives, and reports problems (short, expired, damaged...). The AI reads the
invoice, reconciliation flags differences, and a printable report goes back to the supplier.
Stock is updated with reported goods kept out of sellable stock.

## Layout

```
packages/
  api/          Fastify. Owns Postgres, photo storage (R2), reconciliation, stock rules, report page.
  ai-service/   Fastify, stateless. Owns the Anthropic key. Read invoice, identify product, draft message.
  shared/       TypeScript contracts between api and ai-service (types only).
  web/          Phone app (owned by the frontend developer; talks only to the api).
db/             schema.sql, seed.sql (loaded automatically by docker compose on first start)
samples/        Test invoice image
```

Each service reads only its own `.env`, so the Anthropic key never reaches the api, and the
DB/R2 credentials never reach the ai-service.

## Run it

Requires Node 20+ and Docker.

```bash
npm install
npm run db:up                                   # Postgres on localhost:5433
cp packages/api/.env.example packages/api/.env  # fill in R2 values (optional) and AI_SERVICE_TOKEN
cp packages/ai-service/.env.example packages/ai-service/.env   # fill in ANTHROPIC_API_KEY, same AI_SERVICE_TOKEN
npm run dev                                     # api on :3001, ai-service on :3002
```

- Leave the `R2_*` values empty to store photos in `packages/api/uploads/` instead of Cloudflare R2.
- `npm run db:reset` wipes the database and reloads the schema and seed data.
- `npm test` runs the reconciliation unit tests; `npm run typecheck` checks all packages.

## API (api, port 3001)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | DB and ai-service status |
| GET | `/api/products`, `/api/suppliers` | Catalogue |
| GET/POST | `/api/deliveries` | List / start a delivery |
| GET | `/api/deliveries/:id` | Everything for the screens: lines, scans, findings, issues (with photo URLs), report |
| POST | `/api/deliveries/:id/invoice` | Upload invoice photo(s) (multipart `photo`); AI reads them into lines |
| PATCH | `/api/invoice-lines/:id` | Fix a line (`qty`, `product_id`) |
| POST | `/api/deliveries/:id/scans` | `{barcode}` or `{product_id, qty, method}` |
| DELETE | `/api/deliveries/:id/scans/:productId` | Remove scans for a product |
| POST | `/api/deliveries/:id/identify` | Photo of an item with no barcode; AI matches it to the catalogue |
| POST | `/api/deliveries/:id/reconcile` | Compare invoice vs scans into findings (idempotent) |
| POST | `/api/deliveries/:id/issues` | Report on any product (multipart: `product_id`, `type`, `qty`, `expiry_date`, `note`, `photo`) |
| DELETE | `/api/issues/:id` | Remove a report |
| POST | `/api/deliveries/:id/finish` | Write stock, draft the supplier report, close (idempotent) |
| GET | `/api/deliveries/:id/report.html` | Printable report for the supplier |
| GET | `/api/files/*` | Serves stored photos when R2 is not configured |

Issue types: `short`, `expired`, `damaged`, `wrong_item`, `other`.
Finding types: `short`, `missing`, `extra`, `mismatch`.

## Stock rules

On finish: received goods count as `sellable`, except quantities reported `expired`, `damaged`,
`wrong_item` or `other`, which go to `quarantine`. A `short` report does not move stock
(those goods never arrived).

## ai-service (port 3002)

All routes except `/health` need the `x-service-token` header (`AI_SERVICE_TOKEN`).
`POST /extract-invoice` and `POST /identify-product` take multipart (`image` files and a JSON
`products` field); `POST /draft-message` takes JSON. Types are in `packages/shared`.
