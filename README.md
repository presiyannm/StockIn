# StockIn

AI-assisted goods receiving. A person at the door photographs the supplier invoice,
scans what arrives, and reports problems (short, expired, damaged...). The AI reads the
invoice, reconciliation flags differences, and a printable report goes back to the supplier.
Stock is updated with reported goods kept out of sellable stock.

See [BUSINESS_REQUIREMENTS.md](BUSINESS_REQUIREMENTS.md) for the agreed MVP behavior,
acceptance examples and open decisions. Supplier reports must be English and include all
delivery items. These requirements describe the target behavior; the API and stock rules
below document the current implementation.

## Layout

```
packages/
  api/          Fastify. Owns Postgres, photo storage (R2), reconciliation, stock rules, report page.
  ai-service/   Fastify, stateless. Owns the Anthropic key. Read invoice, identify product, draft message.
  shared/       TypeScript contracts between api and ai-service (types only).
  web/          Phone app (React + TanStack Start). Talks only to the api, through the Vite /api proxy.
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
npm run dev                                     # api on :3001, ai-service on :3002, web on :5173
```

- Open http://localhost:5173 (or `http://<your-PC-IP>:5173` on a phone on the same Wi-Fi). The
  web app proxies `/api` to :3001, so it needs no config. `npm run dev:web` starts only the web app.
- Leave the `R2_*` values empty to store photos in `packages/api/uploads/` instead of Cloudflare R2.
- `npm run db:reset` wipes the database and reloads the schema and seed data.
- `npm test` runs the reconciliation unit tests; `npm run typecheck` checks all packages.

## API (api, port 3001)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | DB and ai-service status |
| GET | `/api/products`, `/api/suppliers` | Catalogue |
| POST | `/api/products` | `{name, barcode?, unit?}`: add a product the catalogue does not know (409 if the barcode is taken) |
| GET | `/api/stock` | Current stock per product (sum of stock movements) |
| GET/POST | `/api/deliveries` | List / start a delivery |
| PATCH | `/api/deliveries/:id` | Requested resolution for the whole delivery: `{requested_resolution: "credit" \| "replacement" \| null, resolution_note}` (409 once closed) |
| PUT | `/api/deliveries/:id/excess/:productId` | `{accept: boolean}`: confirm that units above the invoice may enter stock (409 once closed) |
| GET | `/api/deliveries/:id` | Everything for the screens: lines, scans, findings, issues (with photo URLs), `excess_accepted` product ids, `items` (preview of what finish writes to stock), report |
| POST | `/api/deliveries/:id/invoice` | Upload invoice photo(s) (multipart `photo`); AI reads them into lines |
| PATCH | `/api/invoice-lines/:id` | Fix a line (`qty`, `product_id`) |
| POST | `/api/deliveries/:id/invoice-lines` | `{product_id, qty}`: add a line the AI missed (409 once closed) |
| DELETE | `/api/invoice-lines/:id` | Remove a misread line (409 once closed) |
| POST | `/api/deliveries/:id/scans` | `{barcode}` or `{product_id, qty, method}` |
| DELETE | `/api/deliveries/:id/scans/:productId` | Remove scans for a product |
| POST | `/api/deliveries/:id/identify` | Photo of an item with no barcode; AI matches it to the catalogue |
| POST | `/api/deliveries/:id/reconcile` | Compare invoice vs scans into findings (idempotent) |
| POST | `/api/deliveries/:id/issues` | Report on any product (multipart: `product_id`, `type`, `qty`, `expiry_date`, `note`, `photo`) |
| DELETE | `/api/issues/:id` | Remove a report |
| POST | `/api/deliveries/:id/finish` | (409 with `products` when expired/damaged/wrong-item quantities exceed what was received) Write stock, draft the supplier report (lists every delivery item plus problems), close (idempotent) |
| GET | `/api/deliveries/:id/report.html` | Printable report for the supplier |
| GET | `/api/files/*` | Serves stored photos when R2 is not configured |
| GET | `/docs` | Swagger UI; the raw OpenAPI document is at `/docs/json` |

The OpenAPI document is hand-written in `packages/api/src/openapi.ts`; update it together with this table.

Issue types: `short`, `expired`, `damaged`, `wrong_item`, `other`.
Finding types: `short`, `missing`, `extra`, `mismatch`.

## Stock rules

On finish: received goods are added to stock (`stock_movements`), except quantities reported
`expired`, `damaged` or `wrong_item`, which are not counted in stock and exist only in the
report. Stock follows what was scanned: a shortage is already reflected because the missing goods
were never scanned. A `short` or `other` report does not change stock; it is a note for the report. There is no quarantine bucket:
goods are either sellable or left out of inventory.

Units above the invoiced quantity (including products not on the invoice) are not added to stock
until the user confirms them with the excess route; the report lists them as not yet confirmed.

## ai-service (port 3002)

All routes except `/health` need the `x-service-token` header (`AI_SERVICE_TOKEN`).
`POST /extract-invoice` and `POST /identify-product` take multipart (`image` files and a JSON
`products` field); `POST /draft-message` takes JSON. Types are in `packages/shared`.
