# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack: Hono on Cloudflare Workers

The backend is a **Hono app running on Cloudflare Workers**, backed by serverless **Neon Postgres**. This is the established architecture — README, `design.md`, and this file all describe it. Keep new backend work in this shape; do not introduce Node/Express idioms (`express-session`, Passport, `setInterval` loops, or a Node HTTP listener) — an earlier version of the app used them and they have been removed.

Backend shape:
- `server/src/index.ts` is the Worker entrypoint — it exports `{ fetch, scheduled }`. `server/src/app.ts` is the Hono app.
- Auth: **stateless JWT session cookies** (`hono/jwt` + `hono/cookie`); no server-side session store.
- DB: **Neon** — serverless Postgres — via `@neondatabase/serverless` (`server/src/db/db.ts`), connected over the edge. ("Neon" and "Postgres" are the same thing here: Neon is wire-compatible PostgreSQL.)
- Rigid-mode deadlines: a **Workers Cron Trigger** (`scheduled` handler → `runDeadlineChecks`), scheduled in `wrangler.toml` (`crons = ["* * * * *"]`).

`.kiro/specs/league-app/tasks.md` is a historical build plan whose task bodies still describe an earlier Express/Passport design (a note at its top flags this). For backend specifics, trust the code, `design.md`, and README.

### Hono router typing — don't regress this
Routers are registered as separate `router.METHOD(...)` statements (not a fluent chain), so Hono does **not** infer types into the handler context. Two consequences every router must handle, or `tsc` breaks:
- Declare routers as `new Hono<AppEnv>()` (import `AppEnv` from `auth/middleware`) so `c.get('user')` type-checks.
- `c.req.param('x')` is typed `string | undefined` for *every* key — assert with `!` (e.g. `c.req.param('leagueId')!`); params are guaranteed by the mount path.
- The shared `handleServiceError` helper casts the service error's numeric `status` to `ContentfulStatusCode` (from `hono/utils/http-status`).

## Commands

Run from the repo root unless noted. This is an **npm workspaces** monorepo (`client`, `server`, `shared`).

```bash
npm install              # installs all workspaces

# Build (order matters: shared must build before server/client)
npm run build            # shared → server (tsc) → client (tsc + vite build)

# Tests (root `test` runs the server suite only)
npm test                                    # server vitest run
npm test --workspace=server                 # same
npm test --workspace=client                 # client vitest (jsdom)
npx vitest run src/__tests__/equalRCV.test.ts   # single file (cwd: server/)
npx vitest run -t "two-way tie"             # single test by name (cwd: server/)

# Database migrations — Node CLI script, uses plain `pg` over Neon's standard
# TCP connection string (not the Worker's serverless driver)
DATABASE_URL=postgres://...neon.tech/... npm run migrate --workspace=server
```

### Running locally
```bash
npm run dev:server     # backend: `wrangler dev` (Workers runtime, http://localhost:8787)
npm run dev:client     # frontend: Vite dev server (http://localhost:5173)
```

Local Worker secrets live in `server/.dev.vars` (copy from `server/.dev.vars.example`; git-ignored). Non-secret vars (`NODE_ENV`, `CLIENT_URL`) and the cron schedule are in `server/wrangler.toml`. Vite proxies `/api` and `/auth` to the Worker at `http://localhost:8787` (see `client/vite.config.ts`). Deploy with `npm run deploy --workspace=server`.

## Architecture

Three workspaces sharing TypeScript types and the voting algorithm:

- **`shared/`** (`@league-app/shared`) — pure code imported by both client and server. `src/types.ts` (domain types) and `src/equalRCV.ts` (the scoring engine). Consumed as TS source via the workspace symlink; `main`/`types` point at `src/`.
- **`server/`** (`@league-app/server`) — Hono API + EqualRCV scoring + Cloudflare cron.
- **`client/`** (`@league-app/client`) — React 18 + Vite + React Router v6 + `@dnd-kit` ranker UI.

### Backend request flow
`index.ts` (Worker `fetch`/`scheduled`) → `app.ts` (Hono root: env→`process.env` shim, session-decode middleware, CSP headers, plus `app.onError`/`app.notFound` returning JSON) → `api/router.ts` mounts feature routers. Each feature is a `router.ts` (HTTP/validation) + `service.ts` (DB + business logic) pair under `server/src/api/<feature>/` (`leagues`, `rounds`, `entries`, `ballots`, `comments`). Services throw errors carrying a numeric `status`; routers forward them via `handleServiceError`, and anything uncaught is caught by `app.onError`.

- **Auth middleware** (`auth/middleware.ts`): `authSessionMiddleware` decodes the `session` JWT cookie into `c.get('user')`; `requireAuth` (401) and `requireLeagueAdmin` (403, checks `league_members.role`) guard routes. `AppEnv` types the Hono context.
- **`process.env` shim**: both `index.ts` and `app.ts` copy Cloudflare `env` bindings onto `globalThis.process.env` so existing `process.env.DATABASE_URL`-style reads keep working under Workers. Keep this in mind when adding config.
- **Media fetching** (`services/mediaFetcher.ts`): at entry-submission time, fetches Spotify/YouTube **oEmbed** metadata (no API key needed), sanitizes the embed HTML, and stores title + embed on the `entries` row.

### EqualRCV scoring engine (`shared/src/equalRCV.ts`)
The core domain logic and the most-tested code. A **pure function**: takes ballots (ordered tiers of tied entry IDs), returns a complete ranking. Each ballot distributes 1 vote split equally among its tied top *active* candidates; lowest-vote candidate(s) are eliminated each round; ties are broken by prior elimination rounds in reverse order, else eliminated simultaneously. Used both for per-round results and for cumulative standings (round winners re-run as ballots with per-round `weight` multipliers). See design.md §"EqualRCV Engine" and the 13 correctness properties before changing it.

### Data model
Neon Postgres, single migration at `server/src/db/migrations/001_initial_schema.sql`. Full schema and the canonical type definitions are in `design.md` (§Data Models) — the most reliable reference for table shapes and the `shared` types. Ties are modeled as multiple `ballot_items` sharing a `rank_position`. Identity concealment (submitter name / thread-starter comment hidden until reveal) is enforced server-side per viewer.

## Testing

Vitest everywhere. The backend uses **property-based tests** with `fast-check` tagged `// Feature: league-app, Property N: ...`, validating the correctness properties in `design.md` (see `server/src/__tests__/equalRCV.property.test.ts` for P1/P2 over the pure engine). When adding backend behavior covered by a property, prefer adding the corresponding fast-check test.

Integration tests (`server/src/__tests__/integration.test.ts`) hit the real Hono app via `app.request()` with a forged JWT cookie and mocked oEmbed. They **skip unless `TEST_DATABASE_URL` is set**, and it must point at a **Neon** database — they go through `db.ts`'s `@neondatabase/serverless` driver, which targets Neon (a bare local Postgres won't work without extra `neonConfig` proxy setup). Apply the schema first (`DATABASE_URL=$TEST_DATABASE_URL npm run migrate --workspace=server`); a throwaway Neon branch is the clean approach. Client tests run in jsdom (`npm test --workspace=client`).

## Gotchas

- **`node_modules/` is still committed** (~9.6k tracked files). A `.gitignore` now lists `node_modules/`, but the already-tracked copy stays in the index until someone runs `git rm -r --cached node_modules` — until then `git status` shows churn there, and the workspace symlink means edits under `server/src/` are mirrored at `node_modules/@league-app/server/src/`. Edit the real source in `server/src/` (etc.), not the `node_modules` copy.
- Two ways into the **same Neon database**: the Worker (`server/src/db/db.ts`) uses the `@neondatabase/serverless` driver (edge/WebSocket); the migration runner (`migrate.ts`) uses plain `pg` over Neon's standard TCP connection string, because it's a Node CLI script, not Worker code.
- `shared` exports raw `.ts`; if you add a build/publish step, keep client and server importing the same source to avoid type drift (note `client/src/api.ts` currently re-declares some types inline rather than importing from `shared`).
