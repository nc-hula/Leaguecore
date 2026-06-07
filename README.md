# 🏆 Leaguecore

**Leaguecore** is a modern, open-source media submission and ranked-choice voting platform designed for hosting thematic league-style competitions among friends. 

Scaffolded with **Kiro**, this project provides a robust TypeScript-based monorepo structure containing a **Hono backend running on Cloudflare Workers**, a React frontend, and a shared module housing types and custom voting algorithms.

---

## 📖 Overview

How Leaguecore works:
1. **Join a League**: Users sign in via Google OAuth and join specific leagues via custom invite links.
2. **Submit Entries**: In each round, players submit entries (such as Spotify tracks, YouTube videos, memes, or podcasts) corresponding to the round's theme. Submissions are anonymous to prevent voting bias.
3. **Rank & Vote**: During the voting phase, players use a drag-and-drop interface to order submissions. Ties are fully supported by placing multiple items in the same rank tier.
4. **EqualRCV Scoring**: Once voting closes, the custom **EqualRCV** voting engine calculates round standings, resolving tie-breakers and applying round weights to compile cumulative league leaderboards.
5. **Reveal & Discuss**: After voting ends, submitter identities and thread-starter comments are revealed. Members can then comment and debate each entry in chronological threads.

---

## 🛠️ Tech Stack

Leaguecore is built using a modern, type-safe stack:

*   **Monorepo Tooling**: npm Workspaces
*   **Frontend**: React 18, Vite, TypeScript, React Router v6, `@dnd-kit/core` (for drag-and-drop ranking UI)
*   **Backend**: Cloudflare Workers, [Hono](https://hono.dev), TypeScript
*   **Auth**: Google OAuth 2.0 with stateless, HTTP-only **JWT session cookies** (`hono/jwt` + `hono/cookie`) — no server-side session store
*   **Database**: PostgreSQL (Neon / serverless) via `@neondatabase/serverless`
*   **Scheduling**: Cloudflare Workers **Cron Triggers** (rigid-mode deadline advancement runs every minute)
*   **Local dev / deploy**: [Wrangler](https://developers.cloudflare.com/workers/wrangler/)
*   **Testing**: Vitest, `fast-check` (for property-based testing of core algorithms and flows)

---

## 📁 Repository Structure

```tree
├── client/                  # React 18 frontend (Vite + TypeScript)
│   ├── src/                 # Client source code (views, context, dnd components)
│   ├── package.json
│   └── tsconfig.json
├── server/                  # Hono backend (Cloudflare Worker)
│   ├── src/
│   │   ├── index.ts        # Worker entrypoint (fetch + scheduled handlers)
│   │   ├── app.ts          # Hono app: middleware, CSP, router mounting
│   │   ├── __tests__/       # Test suites and property-based tests
│   │   ├── api/             # API routers & services (Leagues, Rounds, Entries, Ballots, Comments)
│   │   ├── auth/            # Google OAuth routes + JWT session middleware
│   │   ├── db/              # Serverless Postgres pool & migration manager
│   │   ├── services/        # MediaFetcherService (Spotify/YouTube oEmbed)
│   │   └── scheduler.ts     # Rigid-mode deadline check, invoked by the Cron Trigger
│   ├── wrangler.toml        # Worker config (vars, cron trigger, compat flags)
│   ├── package.json
│   └── tsconfig.json
├── shared/                  # Common code imported by both client and server
│   ├── src/
│   │   ├── equalRCV.ts      # EqualRCV ranked-choice voting algorithm
│   │   └── types.ts         # Shared TypeScript interfaces & types
│   ├── package.json
│   └── tsconfig.json
├── package.json             # Root monorepo configuration & dev scripts
└── README.md
```

---

## ✨ Features (V1)

### 🔒 1. User Authentication
*   **Google OAuth Sign-In**: Securely logs users in using Google accounts.
*   **Stateless Sessions**: A signed, HTTP-only **JWT cookie** carries the session and is verified at the edge on every request — no server-side session store required.
*   **Data Minimization**: The database stores only the OAuth provider ID, display name, and email address; OAuth access tokens are discarded immediately post-authentication.

### 🏆 2. League Creation & Administration
*   **Invite-Link System**: Admins can generate a unique invite token/URL to easily onboard new players.
*   **Multi-Admin Support**: Any admin can assign administrative privileges to other league members.
*   **Defaults-First Approach**: Setting up a league requires only a name; by default, the media type is set to "Potpourri" (🍲) and both Spotify and YouTube submissions are enabled.
*   **Custom Media Types**: Configure the league to focus on specific media categories (Video 🎞️, Music 🎶, Meme 🐸, Podcast 🎙️, Potpourri 🍲, or custom categories defined with a custom name and emoji).

### ⏱️ 3. Round Management & Deadline Modes
*   **Rigid Mode**: Rounds have strict, pre-configured deadlines for both submission and voting phases. A Cloudflare Workers **Cron Trigger** fires every minute and automatically advances any round whose deadline has passed.
*   **Flexible Mode**: The round automatically advances to the next phase as soon as all players have finished their respective actions (all submitted entries, or all voted), with options for manual admin overrides.
*   **Round Weighting**: Assign custom weights to rounds (e.g., a "Double Points" finale) which are calculated into the cumulative standings.
*   **Per-Round Overrides**: Admins can override the league-level media type and allowed submission platforms for a single round without changing league defaults.

### 🎵 4. Media Fetching & Sandboxed Embedding
*   **Automated Metadata Fetching**: When players submit a Spotify or YouTube URL, the backend retrieves metadata (titles and thumbnails) automatically using oEmbed APIs.
*   **In-App Media Player**: Renders embedded, sandboxed Spotify and YouTube players.
*   **Clickable Fallbacks**: If the embed widget fails to load, a direct clickable link is always provided as a fallback.

### 🗳️ 5. Ranked-Choice Ballot UI (Drag-and-Drop)
*   **Drag-to-Order Grid**: An interactive, visual drag-and-drop workspace powered by `@dnd-kit/core` that snaps entry tiles to clean grid positions.
*   **Tiered Ties**: Enables users to place multiple entry tiles on the same row, representing a shared tie.
*   **Completeness Validation**: Blocks ballot submission until every non-bonus entry is dragged out of the unsorted bin.
*   **Easter Egg Tooltip**: Dragging an entry to the lowest/baseline rank row displays a subtle warning tooltip: `Really don't know how to feel about this one, huh? ⚠️`.

### ⚖️ 6. EqualRCV Voting Engine
*   **Fractional Vote Sharing**: Distributes a ballot's single vote equally among all tied, active candidates in that voter's highest preference tier.
*   **Historical Tie-Breaker**: Resolves RCV elimination ties by examining the candidates' performance in prior rounds of the elimination process in reverse chronological order. If still tied, candidates are eliminated simultaneously.
*   **Weighted Leaderboard**: Compiles cumulative standings across all closed rounds in the league, treating each round's winner as a ballot and applying round weight multipliers.

### 🎭 7. Submitter Identity Reveal & Discussion
*   **Concealed Identities**: Submitter names and optional "thread-starter comments" remain entirely hidden during the voting phase.
*   **Reveal Modes**:
    *   *Global Mode*: All submitter identities and thread-starter comments are revealed simultaneously when the round closes.
    *   *Per-Player Mode*: Submitter identities are revealed to an individual player immediately after they submit their own ballot.
*   **Chronological Comment Threads**: Players can leave comments and discuss entries after their identities are revealed.
*   **Bonus Tracks**: Support for submitting non-voting "bonus tracks" that players can comment on as soon as the submission phase ends.

### 🧭 8. Multi-League Dashboard
*   **Consolidated League List**: Displays all leagues a user is enrolled in.
*   **Actionable Badges**: Highlights pending actions (e.g., "Submit Entry" or "Vote Pending") directly on the dashboard.

---

## 🗄️ Database Schema

Leaguecore uses a relational PostgreSQL schema designed for high integrity and cascading cleanups:
*   `users`: Core account details (OAuth info, display name, email).
*   `leagues` & `league_members`: Defines league parameters and user roles (`player` / `admin`).
*   `rounds`: Stores themes, deadline modes, phase states, and media overrides.
*   `entries`: Keeps track of submission titles, oEmbed code, source URLs, and submitter links.
*   `ballots` & `ballot_items`: Records ranked-choice selections (with positions mapping to ties).
*   `round_results`: Stores calculated results (score & rank) generated by the EqualRCV engine.
*   `comments`: Chronological feedback linked to entries.
*   `identity_reveals`: Tracks which players have unlocked submitter details in per-player reveal mode.

---

## 🚀 Getting Started

### 1. Prerequisites
Ensure you have the following installed:
*   [Node.js](https://nodejs.org/) (v18+ recommended)
*   A PostgreSQL database — a serverless [Neon](https://neon.tech/) database is recommended (the Worker connects via `@neondatabase/serverless`), or any PostgreSQL 16+ instance reachable over TLS.
*   [Wrangler](https://developers.cloudflare.com/workers/wrangler/) (installed automatically as a dev dependency) for running and deploying the Worker.

### 2. Setup & Installation
Clone the repository and run the following command in the root directory to install dependencies across the monorepo workspaces:
```bash
npm install
```

### 3. Environment Variables
The backend runs as a Cloudflare Worker, so local secrets live in `server/.dev.vars` (Wrangler loads this automatically; it is git-ignored). Copy the example and fill it in:
```bash
cp server/.dev.vars.example server/.dev.vars
```
```ini
# server/.dev.vars
DATABASE_URL=postgresql://user:password@host/league_app?sslmode=require
NODE_ENV=development
SESSION_SECRET=your-random-session-secret
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
CLIENT_URL=http://localhost:5173
```
Non-secret defaults (`NODE_ENV`, `CLIENT_URL`) and the cron schedule live in `server/wrangler.toml`. For production, set secrets with `npx wrangler secret put <NAME>`.

### 4. Database Setup & Migration
The migration runner is a plain Node script (it uses `pg`, not the Worker runtime). With `DATABASE_URL` exported in your shell, run:
```bash
# From the server/ directory:
npx ts-node src/db/migrate.ts
```

### 5. Running the Application
Run the backend Worker and the frontend dev server from the repository root:
```bash
# Backend — Cloudflare Worker via Wrangler (http://localhost:8787)
npm run dev:server

# Frontend — Vite dev server (http://localhost:5173)
npm run dev:client
```
The Vite dev server proxies `/api` and `/auth` to the Worker; update the proxy target in `client/vite.config.ts` to `http://localhost:8787` so the two line up.

---

## 🧪 Testing

The codebase includes standard unit tests as well as advanced **property-based tests** using `fast-check` to verify mathematical invariants, security, and edge cases.

To run the backend test suite:
```bash
# From the server/ directory:
npm run test
```
