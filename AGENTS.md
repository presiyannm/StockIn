# StockIn: guide for AI agents

Project-wide context for everyone working on this repo (people and AI tools). Each package
has its own `AGENTS.md` with the rules for that package; when you work inside a package, read
that file too. Where they differ, the package file wins for that package.

## Shared business requirements

Read [BUSINESS_REQUIREMENTS.md](BUSINESS_REQUIREMENTS.md) for the agreed MVP workflow,
business rules, acceptance examples and open product decisions. Its confirmed product
decisions take precedence over older product descriptions here or in package guides:
supplier reports must be **English** and include **all delivery items**, including correctly
received ones. This supersedes the invoice-language report statement below. Existing
technical settings and contributor instructions remain in effect. Requirements describe
the target behavior, not a guarantee that every feature is already implemented.

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

## Layout

```
packages/
  api/          Fastify :3001. Postgres, photo storage, reconciliation, stock rules, report page.
  ai-service/   Fastify :3002, stateless. The only place the Anthropic key lives.
  shared/       Types only: the contract between api and ai-service.
  web/          Phone app (React). Talks only to `api`.
db/             schema.sql + seed.sql (docker compose loads them on first start only)
samples/        bg-invoice.png: a Bulgarian test invoice for smoke tests
```

Each package has its own `AGENTS.md` (and a `CLAUDE.md` that imports it). Create one when you
add a package.

Boundaries:
- `web` talks only to `api`. `api` is the only service that talks to Postgres and R2.
  `ai-service` never touches the database or storage; it gets images and the catalogue in each
  request.
- The HTTP API in `README.md` is the contract with `web`. When you change a route, field or
  response shape, update the README table in the same change.

## Commands

```bash
npm install
npm run db:up        # Postgres 16 in Docker on localhost:5433
npm run db:reset     # wipe + reload schema.sql and seed.sql
npm run dev          # api + ai-service together
npm run typecheck    # all packages
npm test             # unit tests (node:test via tsx)
```

Env files are per service: `packages/api/.env` and `packages/ai-service/.env` (see the
`.env.example` next to each). `AI_SERVICE_TOKEN` must match in both.

## Stack and decisions (already made, do not relitigate without asking)

- TypeScript ESM, Node 20+, Fastify, `pg` with plain SQL (no ORM), npm workspaces.
- Postgres in Docker (host port 5433 to avoid clashing with a local Postgres on 5432).
- Photos in Cloudflare R2 (S3 API); with empty `R2_*` vars the api falls back to local disk.
- AI: Claude API via `@anthropic-ai/sdk`, model `claude-sonnet-5-5` (set by `CLAUDE_MODEL`).
- UI language is English. Invoices may be Bulgarian or English and are read in either language.
  The supplier report is always English, whatever the invoice language.
- No login. Single business.

## Rules for the whole repo

- Never let the AI silently "fix" data. Comparison and stock logic is deterministic code; the AI
  reads, matches, explains and drafts. Anything uncertain goes to a human.
- A Report must be possible on ANY product, including ones that matched perfectly.
- Secrets: never print, log, commit or paste API keys, R2 keys or `.env` contents. `.env` is
  gitignored. If a secret lands in chat, write it to the right `.env` without echoing it and
  recommend rotating it. Before a commit or push, run
  `git grep --cached -nE "sk-ant|cfat_"` and confirm no `.env` is tracked.
- Shared types live in `packages/shared`; a change there affects both `api` and `ai-service`, so
  update both sides together.
- On Windows from Git Bash, free a dev port with PowerShell
  (`Get-NetTCPConnection -LocalPort <p> -State Listen`, then `Stop-Process`); `pkill` does not
  work. Keep curl temp files inside the repo, since Git Bash `/tmp` is not visible to native tools.

## Code conventions

- Match the surrounding code. ESM imports use the `.js` extension (`from "./db.js"`).
- Config is read once per package in `config.ts`; do not read `process.env` elsewhere.
- Comments only for the non-obvious "why". No new dependencies without a reason.
- Validate at least the fields a route depends on and return `{ error }` with a proper status.

## Verifying your work

1. `npm run typecheck` and `npm test` pass. Add a unit test for any new pure logic.
2. For route or flow changes, run the services and exercise the real flow:
   `npm run db:up && npm run dev`, then create a delivery, upload `samples/bg-invoice.png` to
   `/api/deliveries/:id/invoice`, scan barcodes from `db/seed.sql` (e.g. `3800000000011`),
   `reconcile`, add an issue, `finish`, and check the `stock_movements` rows.
3. Clean up test data afterwards (`TRUNCATE deliveries RESTART IDENTITY CASCADE` and delete
   suppliers with id > 1) and stop the dev servers.
4. Report results honestly, including what you could not test. The AI on messy real-world
   invoice photos is not yet validated.

## Git workflow

Remote: `https://github.com/presiyannm/StockIn.git`.

### Branches

| Branch | Purpose | Who changes it |
|---|---|---|
| `dev` | Integration branch. Every finished feature lands here first. | Pull requests from feature branches |
| `prod` | What is released/deployed. | Pull requests from `dev` |

Code only moves forward: `feature branch -> dev -> prod`. Never commit or push directly to
`dev` or `prod`, and never force-push them. A `main` branch still exists on the remote but is
not part of the workflow: do not branch from it, target it, or merge into it.

### Working on a feature

1. Start from an up-to-date `dev`: `git checkout dev && git pull`.
2. Create your own branch for the work: `git checkout -b feature/<short-description>`.
   Prefixes: `feature/` new behaviour, `fix/` bug fixes, `docs/` documentation only,
   `chore/` tooling and housekeeping. Use lowercase and hyphens, e.g. `feature/issue-photos`.
3. Commit small and often: one logical change per commit, with an imperative message that says
   what and why ("Quarantine expired goods on finish"). Do not wait until the end to commit, and
   do not bundle unrelated changes.
4. Push the branch regularly: `git push -u origin feature/<short-description>`.
5. Keep it current: merge `dev` into your branch when `dev` moves (`git fetch && git merge
   origin/dev`) and resolve conflicts on your branch, not on `dev`.
6. When it is ready, open a pull request into `dev`.

### Pull requests

- Target `dev`. The only exception is a release PR, `dev -> prod`.
- Title says what changed. The description says why, what you tested, and what a reviewer should
  look at. Link the issue or task if there is one.
- Before opening: `npm run typecheck` and `npm test` pass, test data is cleaned up, no secrets in
  the diff (see the secrets rule above), and `README.md` and the relevant `AGENTS.md` are updated
  if you changed a route, a type, a rule or a command.
- Keep PRs small and about one thing. A PR that touches several packages should say so.
- Merge with a merge commit, so the small commits on your branch are preserved. Delete the branch
  after merging.

### Hotfixes

For a production bug: branch `hotfix/<description>` from `prod`, open a PR into `prod`, then
merge the same fix back into `dev` so it does not lose it.

### For AI agents

- Before changing any file, check the current branch. If it is `dev` or `prod`, create a
  feature branch first.
- Commit as you go in small commits. Push the branch and open (or give the user the link to open)
  a PR into `dev`. Do not merge PRs yourself unless asked.
- Ask before pushing, and never rewrite shared history. Rebasing or amending is only acceptable on
  your own unpushed commits.
