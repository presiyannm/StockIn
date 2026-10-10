# StockIn: guide for AI agents

Read this before changing anything. It explains what the system is, who owns what, the rules
that are easy to break, and how to verify your work.

## What this is

AI-assisted goods receiving for small shops. A person at the door photographs the supplier
invoice, scans what arrives, and reports problems (short, expired, damaged, wrong item).
The AI reads the invoice, reconciliation flags the differences, and a printable report goes
back to the supplier. Stock is updated, with reported goods kept out of sellable stock.
The product thesis (hackathon theme "AI That Does the Work"): the human only confirms, the AI
does the reading, matching, comparing and drafting.

Full flow: invoice photo -> AI reads lines -> scan goods (barcode, or photo for unlabelled
items) -> reconcile -> report any problem on ANY product (even a perfect 12/12) with type,
qty, expiry, note, photos -> finish -> stock written + supplier report drafted and printable.

## Layout and ownership

```
packages/
  api/          Fastify :3001. Postgres, photo storage, reconciliation, stock rules, report page.
  ai-service/   Fastify :3002, stateless. The ONLY place the Anthropic key lives.
  shared/       Types only: the contract between api and ai-service.
  web/          Phone app. OWNED BY ANOTHER DEVELOPER. See rules below.
db/             schema.sql + seed.sql (docker compose loads them on first start only)
samples/        bg-invoice.png: a Bulgarian test invoice for smoke tests
```

- **Backend only for now.** Do not create or modify `packages/web` unless the user explicitly
  asks. The web developer consumes the HTTP API documented in `README.md`; keep it stable and
  tell the user when you change a route, field or response shape.
- `web` talks only to `api`. `api` is the only service that talks to Postgres and R2.
  `ai-service` never touches the database or storage and receives images and the catalogue in
  each request.

## Commands

```bash
npm install
npm run db:up        # Postgres 16 in Docker on localhost:5433 (5432 is taken on the dev machine)
npm run db:reset     # wipe + reload schema.sql and seed.sql
npm run dev          # api + ai-service together
npm run typecheck    # all packages
npm test             # reconciliation unit tests (node:test via tsx)
```

Env files are per service: `packages/api/.env` and `packages/ai-service/.env` (see the
`.env.example` next to each). `AI_SERVICE_TOKEN` must match in both.

## Stack and decisions (already made, do not relitigate without asking)

- TypeScript ESM, Node 20+, Fastify, `pg` with plain SQL (no ORM), npm workspaces.
- Postgres in Docker. Photos in Cloudflare R2 (S3 API); when the `R2_*` vars are empty the api
  falls back to `packages/api/uploads/` and serves files at `/api/files/*`.
- AI: Claude API via `@anthropic-ai/sdk`, model `claude-sonnet-5-5` (set by `CLAUDE_MODEL`).
- UI language is English. Invoices may be Bulgarian or English. The supplier report is written
  in the invoice language (Cyrillic in the invoice lines => Bulgarian, otherwise English).
- No login. Single business.

## Rules that are easy to break

**AI calls**
- `claude-sonnet-5-5` rejects forced `tool_choice` (400). Get JSON with structured outputs:
  `output_config.format = { type: "json_schema", schema }`, then `JSON.parse` the text block.
  `packages/ai-service/src/ai.ts` `callJson` + `strictSchema` already do this (closed objects,
  `anyOf` for nullable). Reuse them; do not reintroduce tool-forcing.
- The Anthropic key is not workspace-scoped, so requests send `anthropic-workspace-id`
  (`ANTHROPIC_WORKSPACE_ID`).
- Never let the AI silently "fix" data. Reconciliation is deterministic code
  (`packages/api/src/reconcile.ts`); the AI only reads, matches, explains and drafts. Lines it
  cannot match to the catalogue become `mismatch` findings for a human.
- To add an AI capability: add the request/response types to `packages/shared`, a route and
  prompt in `ai-service`, and a client function in `packages/api/src/aiClient.ts`.
- The api checks `aiAvailable()` BEFORE storing an invoice, so a down ai-service never leaves a
  half-saved invoice. Report drafting falls back to a plain template if the AI fails.

**Data and money-adjacent logic**
- Stock rules (in `reconcile.ts` `stockSplit`): received goods are `sellable`, except quantity
  reported `expired`, `damaged`, `wrong_item` or `other`, which goes to `quarantine` (capped at
  what was received). A `short` report does not move stock (the goods never arrived).
- `reconcile` and `finish` are idempotent. Finishing twice must not double-count stock; keep it so.
- A Report must be possible on ANY product, including ones that matched perfectly.
- DATE columns are returned as plain `YYYY-MM-DD` strings (type parser in `db.ts`). Without it,
  timezone shifting moves dates by a day. Do not remove it.
- `db/*.sql` only run on a fresh volume. A schema change needs an edit to `schema.sql` plus
  `npm run db:reset` (and tell the user data was wiped), or a migration if data must be kept.
- Multi-statement writes use a pooled client with BEGIN/COMMIT/ROLLBACK (see `routes.ts`).

**Secrets**
- Never print, log, commit or paste API keys, R2 keys or `.env` contents. `.env` is gitignored.
  If a user pastes a secret into chat, write it to the right `.env` without echoing it back and
  suggest rotating it afterwards.
- Before any commit/push: `git grep --cached -nE "sk-ant|cfat_"` and confirm no `.env` is tracked.

**Environment quirks (Windows dev machine)**
- Port 5432 is taken, Postgres is on **5433**.
- To free a dev port from Git Bash, use PowerShell: `Get-NetTCPConnection -LocalPort <p> -State
  Listen` then `Stop-Process`. `pkill` does not work here.
- When testing with curl, keep temp files inside the repo or use PowerShell; Git Bash `/tmp`
  paths are not visible to native tools.

## Code conventions

- Match the surrounding code. ESM imports use the `.js` extension (`from "./db.js"`).
- Shared types live in `packages/shared/src/index.ts` and are imported with `import type`.
- Config is read once in each package's `config.ts`; do not read `process.env` elsewhere.
- Keep comments to the non-obvious "why". No new dependencies without a reason.
- Request validation is light (hackathon); validate at least the fields a route depends on and
  return `{ error }` with a proper status.

## Verifying your work

1. `npm run typecheck` and `npm test` must pass. Add a unit test for any new pure logic.
2. For route or flow changes, run the services and exercise the real flow:
   `npm run db:up && npm run dev`, then create a delivery, upload `samples/bg-invoice.png` to
   `/api/deliveries/:id/invoice`, scan barcodes from `db/seed.sql` (e.g. `3800000000011`),
   `reconcile`, add an issue, `finish`, and check the `stock_movements` rows.
3. Clean up test data afterwards: `TRUNCATE deliveries RESTART IDENTITY CASCADE` (and delete
   suppliers with id > 1), and stop the dev servers.
4. Report results honestly, including anything you could not test (for example the AI on messy,
   real-world invoice photos is not yet validated).

## Git

Remote: `https://github.com/presiyannm/StockIn.git`, branch `main`. Commit small, descriptive
messages. Ask before pushing or force-pushing, and never rewrite shared history.
