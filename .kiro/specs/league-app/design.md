# Design Document: League App

## Overview

The League App is a web application for running league-style media submission and voting competitions. Players join leagues, submit media entries each round, and vote using a drag-to-order ranked-choice interface. Results are computed with the EqualRCV algorithm and cumulative standings are tracked across rounds.

### Key Design Decisions

- **Monorepo structure**: A single repository with `client/` (React) and `server/` (Hono/Cloudflare Worker) packages, sharing TypeScript types via a `shared/` package.
- **Session-based auth**: Stateless Google OAuth using secure, HTTP-only JWT cookies verified at the edge, avoiding database reads/writes for session data on every request.
- **Serverless PostgreSQL**: Queried via `@neondatabase/serverless` or Cloudflare Hyperdrive to handle high-concurrency, short-lived edge connections efficiently.
- **Workers Cron Triggers**: Ephemeral round deadline processing triggered every minute via Cloudflare Workers `scheduled` events, replacing a persistent `setInterval` server loop.
- **oEmbed for metadata**: Both Spotify and YouTube expose oEmbed endpoints that return title and embed HTML without requiring user-scoped API tokens. The backend fetches these at submission time and caches the result on the entry row.
- **dnd-kit for the Ranker**: `@dnd-kit/core` + `@dnd-kit/modifiers` provides the snap-to-grid, multi-container drag-and-drop needed for the ranked ballot UI without requiring a full canvas approach.
- **EqualRCV as a pure function**: The scoring engine is implemented as a stateless TypeScript function that takes ballots and returns rankings, making it straightforward to test and reuse for both per-round and cumulative standings.

### Research Findings

- **Spotify oEmbed** (`https://open.spotify.com/oembed?url=<track_url>`) returns `title`, `thumbnail_url`, and `html` (embed iframe) with no authentication required. [Source](https://developer.spotify.com/documentation/embeds/tutorials/using-the-oembed-api)
- **YouTube oEmbed** (`https://www.youtube.com/oembed?url=<video_url>&format=json`) returns `title`, `thumbnail_url`, and `html` with no API key required.
- **dnd-kit** provides a `Snap` modifier that constrains drag movement to a configurable grid size, and supports multiple droppable containers (unsorted bin + ranked grid). [Source](https://dndkit.com/extend/modifiers)

---

## Architecture

The system follows a standard three-tier web architecture:

```
┌─────────────────────────────────────────────────────────┐
│                     React Client                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │  Auth    │  │ League   │  │  Round   │  │ Ranker │  │
│  │  Pages   │  │  Pages   │  │  Pages   │  │   UI   │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │ HTTPS / REST + JSON
┌────────────────────────▼────────────────────────────────┐
│             Hono / Cloudflare Workers API               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │  Auth    │  │ League   │  │  Entry   │  │ Score  │  │
│  │ Router   │  │ Router   │  │ Router   │  │ Engine │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘  │
│  ┌──────────────────────────────────────────────────┐   │
│  │              Media Fetcher Service               │   │
│  │   (Spotify oEmbed + YouTube oEmbed)              │   │
│  └──────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────┘
                         │ TCP via Hyperdrive/WebSockets
┌────────────────────────▼────────────────────────────────┐
│              PostgreSQL (Serverless)                    │
│  users · leagues · league_members · rounds · entries   │
│  ballots · ballot_items · comments · round_results     │
└─────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, React Router v6, dnd-kit |
| Backend | Cloudflare Workers, Hono, TypeScript |
| Database | PostgreSQL (Neon / Supabase), `@neondatabase/serverless` or Hyperdrive |
| Auth | Stateless JWT session cookies, Hono Google OAuth middleware |
| Media | Spotify oEmbed API, YouTube oEmbed API |
| Testing | Vitest (unit + property), fast-check (PBT) |

---

## Components and Interfaces

### Backend Routers

#### Auth Router (`/auth`)

| Endpoint | Method | Description |
|---|---|---|
| `/auth/google` | GET | Initiates Google OAuth redirect |
| `/auth/google/callback` | GET | OAuth callback; creates/retrieves user, establishes session |
| `/auth/logout` | POST | Destroys session |
| `/auth/me` | GET | Returns current authenticated user or 401 |

#### League Router (`/api/leagues`)

| Endpoint | Method | Description |
|---|---|---|
| `/api/leagues` | POST | Create a new league |
| `/api/leagues` | GET | List leagues for authenticated user |
| `/api/leagues/:id` | GET | Get league details |
| `/api/leagues/:id` | PATCH | Update league settings (admin only) |
| `/api/leagues/:id/members` | GET | List members |
| `/api/leagues/:id/members/:userId` | DELETE | Remove member (admin only) |
| `/api/leagues/:id/members/:userId/admin` | PUT | Grant admin role (admin only) |
| `/api/leagues/:id/invite` | GET | Get invite link |
| `/api/leagues/join/:token` | POST | Join via invite token |

#### Round Router (`/api/leagues/:leagueId/rounds`)

| Endpoint | Method | Description |
|---|---|---|
| `/api/leagues/:leagueId/rounds` | POST | Create round (admin only) |
| `/api/leagues/:leagueId/rounds/:id` | GET | Get round details + entries |
| `/api/leagues/:leagueId/rounds/:id` | PATCH | Update round (admin only) |
| `/api/leagues/:leagueId/rounds/:id/advance` | POST | Manually advance phase (admin only) |

#### Entry Router (`/api/rounds/:roundId/entries`)

| Endpoint | Method | Description |
|---|---|---|
| `/api/rounds/:roundId/entries` | POST | Submit an entry |
| `/api/rounds/:roundId/entries` | GET | List entries (identity concealed if not revealed) |
| `/api/rounds/:roundId/entries/:id/comments` | POST | Post a comment |
| `/api/rounds/:roundId/entries/:id/comments` | GET | Get comments |

#### Ballot Router (`/api/rounds/:roundId/ballot`)

| Endpoint | Method | Description |
|---|---|---|
| `/api/rounds/:roundId/ballot` | PUT | Submit or update ballot (voting phase only) |
| `/api/rounds/:roundId/ballot` | GET | Get current player's ballot |

#### Results Router (`/api/rounds/:roundId/results`)

| Endpoint | Method | Description |
|---|---|---|
| `/api/rounds/:roundId/results` | GET | Get per-round results (closed rounds only) |
| `/api/leagues/:leagueId/standings` | GET | Get cumulative league standings |

### Frontend Components

```
src/
  pages/
    LoginPage
    DashboardPage          ← league list + pending actions
    LeaguePage             ← current round, member list
    LeagueSettingsPage     ← admin: media type, sources, members
    RoundPage              ← submission or voting view
    ResultsPage            ← per-round results + standings
  components/
    Ranker/
      RankerBoard          ← dnd-kit DndContext wrapper
      UnsortedBin          ← droppable container for unranked entries
      RankingGrid          ← droppable grid with rank rows
      EntryTile            ← draggable entry card
      BonusTrackSection    ← non-draggable bonus display
    MediaEmbed/
      SpotifyEmbed         ← Spotify iframe widget with fallback link
      YouTubeEmbed         ← YouTube iframe widget with fallback link
    EntryCard              ← entry display with embed + comments
    CommentThread          ← comment list + post form
    InviteLink             ← copy-to-clipboard invite URL
    PhaseTimer             ← countdown for Rigid Mode deadlines
    PendingActionBadge     ← dashboard indicator
```

### Media Fetcher Service

The `MediaFetcherService` runs server-side and is called at entry submission time:

```typescript
interface MediaMetadata {
  title: string;
  embedHtml: string;       // raw iframe HTML from oEmbed
  thumbnailUrl: string | null;
  sourceUrl: string;
  source: 'spotify' | 'youtube';
}

class MediaFetcherService {
  async fetchMetadata(url: string): Promise<MediaMetadata>;
  private fetchSpotifyMetadata(url: string): Promise<MediaMetadata>;
  private fetchYouTubeMetadata(url: string): Promise<MediaMetadata>;
  detectSource(url: string): 'spotify' | 'youtube' | null;
}
```

- **Spotify**: `GET https://open.spotify.com/oembed?url=<url>` — returns `title`, `html`, `thumbnail_url`. No auth required.
- **YouTube**: `GET https://www.youtube.com/oembed?url=<url>&format=json` — returns `title`, `html`, `thumbnail_url`. No auth required.
- Metadata is stored on the `entries` row at submission time; the embed HTML is sanitized before storage.

### EqualRCV Engine

The scoring engine is a pure TypeScript function with no side effects:

```typescript
type Tier = string[];          // entry IDs tied at the same rank
type Ballot = Tier[];          // ordered tiers, index 0 = highest rank

interface RCVResult {
  rank: number;
  candidateId: string;
  finalScore: number;
}

function runEqualRCV(
  ballots: Ballot[],
  weights?: Map<string, number>   // candidateId → weight (for cumulative)
): RCVResult[];
```

**Algorithm summary** (from requirements §9):
1. Each ballot distributes 1 vote equally among all tied top-ranked *active* candidates.
2. In each elimination round, the candidate(s) with the fewest accumulated votes are eliminated.
3. Tie-breaking: consult prior elimination rounds' scores in reverse chronological order. If still tied, eliminate all tied candidates simultaneously.
4. Repeat until one candidate remains (or all remaining are tied).
5. Final ranks are assigned based on elimination order (last eliminated = highest rank).

For cumulative standings, each round's winner is treated as a ballot and the engine is re-run over those ballots, applying per-round weights.

---

## Data Models

### PostgreSQL Schema

```sql
-- Users
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_id   TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  email       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Leagues
CREATE TABLE leagues (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  invite_token    TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  media_type_name TEXT NOT NULL DEFAULT 'Potpourri',
  media_type_emoji TEXT NOT NULL DEFAULT '🍲',
  reveal_mode     TEXT NOT NULL DEFAULT 'global'  -- 'global' | 'per_player'
    CHECK (reveal_mode IN ('global', 'per_player')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Submission sources enabled per league (at least one must be true)
CREATE TABLE league_submission_sources (
  league_id   UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  source      TEXT NOT NULL CHECK (source IN ('spotify', 'youtube')),
  enabled     BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (league_id, source)
);

-- League membership
CREATE TABLE league_members (
  league_id   UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'admin')),
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id, user_id)
);

-- Rounds
CREATE TABLE rounds (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id             UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  theme                 TEXT NOT NULL,
  description           TEXT NOT NULL,
  required_entry_count  INT NOT NULL CHECK (required_entry_count > 0),
  bonus_tracks_allowed  BOOLEAN NOT NULL DEFAULT false,
  deadline_mode         TEXT NOT NULL CHECK (deadline_mode IN ('rigid', 'flexible')),
  -- Rigid mode fields
  submission_days       INT,
  voting_days           INT,
  submission_deadline   TIMESTAMPTZ,
  voting_deadline       TIMESTAMPTZ,
  -- Phase
  phase                 TEXT NOT NULL DEFAULT 'submission'
    CHECK (phase IN ('submission', 'voting', 'closed')),
  -- Per-round overrides (NULL = use league defaults)
  override_media_type_name  TEXT,
  override_media_type_emoji TEXT,
  weight                NUMERIC NOT NULL DEFAULT 1.0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-round submission source overrides
CREATE TABLE round_submission_source_overrides (
  round_id    UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  source      TEXT NOT NULL CHECK (source IN ('spotify', 'youtube')),
  enabled     BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (round_id, source)
);

-- Entries
CREATE TABLE entries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id            UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  submitter_id        UUID NOT NULL REFERENCES users(id),
  source_url          TEXT NOT NULL,
  source              TEXT NOT NULL CHECK (source IN ('spotify', 'youtube')),
  title               TEXT NOT NULL,
  embed_html          TEXT NOT NULL,
  thumbnail_url       TEXT,
  is_bonus_track      BOOLEAN NOT NULL DEFAULT false,
  context_comment     TEXT,
  thread_starter_comment TEXT,
  submitted_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ballots
CREATE TABLE ballots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id    UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  voter_id    UUID NOT NULL REFERENCES users(id),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (round_id, voter_id)
);

-- Ballot items: each row is one entry at one rank position on one ballot
-- Multiple entries at the same rank_position = tie (tier)
CREATE TABLE ballot_items (
  ballot_id   UUID NOT NULL REFERENCES ballots(id) ON DELETE CASCADE,
  entry_id    UUID NOT NULL REFERENCES entries(id),
  rank_position INT NOT NULL CHECK (rank_position >= 0),
  PRIMARY KEY (ballot_id, entry_id)
);

-- Per-round results (computed by EqualRCV engine when round closes)
CREATE TABLE round_results (
  round_id    UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  entry_id    UUID NOT NULL REFERENCES entries(id),
  final_rank  INT NOT NULL,
  final_score NUMERIC NOT NULL,
  PRIMARY KEY (round_id, entry_id)
);

-- Comments
CREATE TABLE comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id    UUID NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES users(id),
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tracks which players have had identity revealed for a round (per-player mode)
CREATE TABLE identity_reveals (
  round_id    UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  viewer_id   UUID NOT NULL REFERENCES users(id),
  revealed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (round_id, viewer_id)
);
```

### TypeScript Shared Types

```typescript
// shared/types.ts

export type RevealMode = 'global' | 'per_player';
export type DeadlineMode = 'rigid' | 'flexible';
export type RoundPhase = 'submission' | 'voting' | 'closed';
export type SubmissionSource = 'spotify' | 'youtube';

export interface User {
  id: string;
  displayName: string;
  email: string;
}

export interface League {
  id: string;
  name: string;
  mediaTypeName: string;
  mediaTypeEmoji: string;
  revealMode: RevealMode;
  submissionSources: SubmissionSource[];
}

export interface Round {
  id: string;
  leagueId: string;
  theme: string;
  description: string;
  requiredEntryCount: number;
  bonusTracksAllowed: boolean;
  deadlineMode: DeadlineMode;
  phase: RoundPhase;
  submissionDeadline?: string;   // ISO 8601, Rigid mode only
  votingDeadline?: string;
  mediaTypeName: string;         // resolved (override or league default)
  mediaTypeEmoji: string;
  submissionSources: SubmissionSource[];
  weight: number;
}

export interface Entry {
  id: string;
  roundId: string;
  title: string;
  sourceUrl: string;
  source: SubmissionSource;
  embedHtml: string;
  thumbnailUrl?: string;
  isBonusTrack: boolean;
  contextComment?: string;
  // Only present when identity is revealed to the viewer
  submitterDisplayName?: string;
  threadStarterComment?: string;
}

export interface BallotItem {
  entryId: string;
  rankPosition: number;   // 0 = highest rank; ties share same position
}

export interface Ballot {
  roundId: string;
  items: BallotItem[];
}

export interface RoundResult {
  entryId: string;
  entryTitle: string;
  submitterDisplayName: string;
  finalRank: number;
  finalScore: number;
}
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: EqualRCV produces a complete ranking

*For any* non-empty set of entries and any non-empty set of ballots (each ballot ranking all entries), the EqualRCV engine SHALL produce exactly one result row per entry, with no duplicate ranks among entries that were not tied.

**Validates: Requirements 9.1**

### Property 2: Fractional vote distribution sums to one

*For any* ballot and any elimination round, the total votes distributed from that ballot across all active candidates SHALL sum to exactly 1.0.

**Validates: Requirements 9.7**

### Property 3: Submission source enforcement

*For any* round with a specific set of enabled submission sources, every entry accepted by the system SHALL have a source that is in the enabled set for that round, and every entry whose source is not in the enabled set SHALL be rejected.

**Validates: Requirements 3.6, 3.7, 5.3, 6.11**

### Property 4: Entry count enforcement

*For any* round with a required entry count and bonus track policy, the number of non-bonus entries submitted by any single player SHALL never exceed the required count, and any submission attempt that would exceed this limit SHALL be rejected.

**Validates: Requirements 6.1, 6.2, 6.8**

### Property 5: Identity concealment before reveal

*For any* entry in a round where identity has not yet been revealed to a given viewer, the API response for that viewer SHALL NOT include the submitter's display name or thread-starter comment.

**Validates: Requirements 7.7, 8.1, 8.2, 8.5**

### Property 6: Ballot completeness enforcement

*For any* ballot submission attempt where one or more non-bonus entries are absent from the ballot's ranked items, the system SHALL reject the submission.

**Validates: Requirements 7.5, 7.9**

### Property 7: Round settings resolution (media type and submission sources)

*For any* round, the effective media type SHALL equal the per-round override if one is set, otherwise the league-level media type; and the effective submission sources SHALL equal the per-round override set if one is configured, otherwise the league-level submission source settings.

**Validates: Requirements 3.5, 3.6, 5.5, 5.6**

### Property 8: At-least-one submission source invariant

*For any* league or round configuration update, the resulting set of enabled submission sources SHALL never be empty; any configuration that would produce an empty set SHALL be rejected.

**Validates: Requirements 3.6, 5.4**

### Property 9: Metadata fetch round-trip

*For any* valid Spotify or YouTube URL submitted as an entry, the title stored on the entry SHALL equal the title returned by the oEmbed API for that URL.

**Validates: Requirements 6.3**

### Property 10: OAuth user creation stores only allowed fields

*For any* OAuth authentication response, the user record created or retrieved by the system SHALL contain only the google_id, display_name, and email fields — no OAuth tokens or other provider data SHALL be persisted beyond the active session.

**Validates: Requirements 1.2, 1.5**

### Property 11: Flexible mode advances on completion

*For any* Flexible Mode round in the submission phase with N active league members, the round SHALL advance to the voting phase if and only if all N members have submitted their required entries (or the admin manually advances it); and similarly, a Flexible Mode round in the voting phase SHALL advance to closed if and only if all N members have submitted their ballot.

**Validates: Requirements 4.5, 4.6**

### Property 12: League join idempotency

*For any* user who is already a member of a league, following the league's invite link again SHALL leave the membership state unchanged (no duplicate membership, no error that prevents the user from continuing).

**Validates: Requirements 2.4**

### Property 13: Comment access requires identity reveal

*For any* league member and any entry, the member SHALL be permitted to post a comment on that entry if and only if the submitter's identity has been revealed to that member for the round containing the entry (or the entry is a bonus track and the submission phase has ended).

**Validates: Requirements 11.1, 11.2**

---

## Error Handling

### Authentication Errors

| Scenario | Behavior |
|---|---|
| OAuth provider returns error | Display error message, redirect to sign-in page |
| User denies authorization | Display message, redirect to sign-in page |
| Session expired | Redirect to sign-in page; after login, redirect back to original URL |
| Unauthenticated request to protected endpoint | 401 JSON response |

### Authorization Errors

| Scenario | Behavior |
|---|---|
| Non-admin attempts admin action | 403 JSON response |
| User not a member of league | 403 JSON response |
| User attempts to access another player's ballot | 403 JSON response |

### Entry Submission Errors

| Scenario | HTTP Status | User Message |
|---|---|---|
| Media fetcher cannot retrieve metadata | 422 | "Could not retrieve media info for that URL. Please check the link and try again." |
| Unsupported URL (not Spotify/YouTube) | 422 | "Only Spotify and YouTube links are supported." |
| Disabled submission source | 422 | "Submissions from [source] are not allowed in this round." |
| Exceeds entry count | 422 | "You have already submitted the maximum number of entries for this round." |
| Submission outside submission phase | 409 | "This round is not currently accepting submissions." |

### Ballot Errors

| Scenario | HTTP Status | User Message |
|---|---|---|
| Incomplete ballot (entries in bin) | 422 | "All entries must be ranked before submitting." |
| Ballot submitted outside voting phase | 409 | "This round is not currently accepting votes." |
| Ballot already submitted (global reveal mode) | 409 | "Your ballot has already been submitted and cannot be changed." |

### Configuration Errors

| Scenario | HTTP Status | User Message |
|---|---|---|
| Attempt to disable all submission sources | 422 | "At least one submission source must remain enabled." |
| Round creation missing required fields | 400 | Field-level validation errors |

### Media Embed Fallback

When an embedded widget fails to load in the browser, the `SpotifyEmbed` and `YouTubeEmbed` components catch the `onError` event and render a styled anchor tag pointing to `sourceUrl` as the primary interaction element.

---

## Testing Strategy

### Unit Tests (Vitest)

Unit tests cover specific examples, edge cases, and error conditions:

- **EqualRCV Engine**: concrete ballot scenarios (single winner, ties, multi-round elimination, weight application)
- **MediaFetcherService**: URL detection logic, oEmbed response parsing, error handling
- **Submission source resolution**: league defaults vs. per-round overrides
- **Media type resolution**: league defaults vs. per-round overrides
- **Identity reveal logic**: global vs. per-player mode, response field filtering
- **Phase advancement logic**: Rigid mode deadline calculation, Flexible mode completion checks

### Property-Based Tests (Vitest + fast-check)

Property-based tests use [fast-check](https://github.com/dubzzz/fast-check) to generate random inputs and verify universal properties. Each test runs a minimum of 100 iterations.

Each test is tagged with a comment in the format:
`// Feature: league-app, Property N: <property text>`

**Properties to implement:**

| Property | Test Description |
|---|---|
| P1: EqualRCV complete ranking | Generate arbitrary ballots; verify result count = candidate count, no duplicate ranks for non-tied entries |
| P2: Fractional vote sums to 1 | Generate arbitrary ballots with ties; verify vote distribution sums to 1.0 per ballot per elimination round |
| P3: Submission source enforcement | Generate round configs + entry sources; verify accepted entries have enabled sources, rejected entries have disabled sources |
| P4: Entry count enforcement | Generate player submission sequences with varying required counts; verify count invariants hold |
| P5: Identity concealment | Generate entries + reveal states; verify submitter fields absent when not revealed |
| P6: Ballot completeness | Generate partial ballots (missing 1+ entries); verify all are rejected |
| P7: Round settings resolution | Generate league + round configs with/without overrides; verify effective type and sources = override ?? league default |
| P8: At-least-one source invariant | Generate arbitrary source enable/disable configs; verify empty-set configs are rejected |
| P9: Metadata fetch round-trip | Generate valid Spotify/YouTube URLs (mocked oEmbed); verify stored title = fetched title |
| P10: OAuth user creation | Generate random OAuth profiles; verify only allowed fields stored, same google_id retrieves same user |
| P11: Flexible mode advancement | Generate N players; verify round advances exactly when all N complete their action |
| P12: League join idempotency | Generate user + league; join twice; verify membership count unchanged |
| P13: Comment access requires reveal | Generate members + reveal states; verify comment permission = identity revealed (or bonus track after submission phase) |

### Integration Tests (Hono Test Client)

Integration tests run using Hono's `app.request()` mock interface against a test PostgreSQL database and cover:

- Full OAuth flow (mocked Google responses)
- League creation → invite → join flow
- Round lifecycle: creation → submission → voting → close → results
- Concurrent ballot submissions in Flexible mode
- Cumulative standings after multiple rounds

### Frontend Tests

- **Ranker component**: drag-and-drop interactions using `@testing-library/user-event`, verify snap behavior and submission blocking
- **SpotifyEmbed / YouTubeEmbed**: fallback link renders on `onError`
- **Dashboard**: pending action badges appear correctly
