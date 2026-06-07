# Implementation Plan: League App

## Overview

Implement the League App as a TypeScript monorepo with a React 18 client, Node.js/Express 5 server, and PostgreSQL 16 database. Tasks are ordered to build foundational infrastructure first, then layer in features incrementally, wiring everything together at the end.

## Tasks

- [x] 1. Initialize monorepo structure and shared types
  - Create `client/`, `server/`, and `shared/` directories with `package.json` files and TypeScript configs
  - Write all shared TypeScript types in `shared/types.ts`: `User`, `League`, `Round`, `Entry`, `Ballot`, `BallotItem`, `RoundResult`, `RevealMode`, `DeadlineMode`, `RoundPhase`, `SubmissionSource`
  - Configure path aliases so `client` and `server` can import from `shared`
  - Set up Vitest in `server/` with fast-check for property-based tests
  - _Requirements: 1.5, 2.1, 4.1, 6.1, 9.1_

- [x] 2. Database schema and migrations
  - [x] 2.1 Write PostgreSQL migration file creating all tables: `users`, `leagues`, `league_submission_sources`, `league_members`, `rounds`, `round_submission_source_overrides`, `entries`, `ballots`, `ballot_items`, `round_results`, `comments`, `identity_reveals`
    - Include all constraints, foreign keys, and default values as specified in the design schema
    - _Requirements: 1.2, 2.1, 3.1, 4.1, 6.1, 7.1, 9.1, 11.1_
  - [x] 2.2 Create a `db.ts` module in `server/` that exports a configured `pg.Pool` instance and a typed `query` helper
    - _Requirements: 1.2_

- [x] 3. Authentication — server
  - [x] 3.1 Configure Express app with `express-session` and `connect-pg-simple` for PostgreSQL-backed sessions
    - _Requirements: 1.2, 1.4_
  - [x] 3.2 Configure Passport.js with `passport-google-oauth20` strategy; on successful OAuth callback, upsert user by `google_id` storing only `display_name` and `email`; establish session
    - _Requirements: 1.1, 1.2, 1.5_
  - [x] 3.3 Implement Auth Router: `GET /auth/google`, `GET /auth/google/callback`, `POST /auth/logout`, `GET /auth/me`
    - Return 401 from `/auth/me` when unauthenticated; redirect to sign-in on OAuth error
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - [ ]* 3.4 Write property test for OAuth user creation (P10)
    - **Property 10: OAuth user creation stores only allowed fields**
    - Generate random OAuth profiles with arbitrary extra fields; verify persisted user record contains only `google_id`, `display_name`, `email`; verify same `google_id` retrieves the same user on repeated calls
    - **Validates: Requirements 1.2, 1.5**

- [x] 4. League creation and membership — server
  - [x] 4.1 Implement `POST /api/leagues`: create league with name, set defaults (Potpourri media type, both sources enabled), assign creator as admin, generate `invite_token`
    - _Requirements: 2.1, 3.1, 3.2, 3.8_
  - [x] 4.2 Implement `GET /api/leagues` (list user's leagues), `GET /api/leagues/:id` (league details), `PATCH /api/leagues/:id` (admin only: update name, media type, reveal mode)
    - _Requirements: 2.1, 3.3, 3.4, 3.5, 12.1_
  - [x] 4.3 Implement `GET /api/leagues/:id/invite` (return invite URL) and `POST /api/leagues/join/:token` (join league; if already member, return 200 with "already a member" message without creating duplicate row)
    - _Requirements: 2.2, 2.3, 2.4_
  - [ ]* 4.4 Write property test for league join idempotency (P12)
    - **Property 12: League join idempotency**
    - Generate a user and league; call join endpoint twice with the same token; verify `league_members` row count for that user+league is exactly 1 and no error is thrown on the second call
    - **Validates: Requirements 2.4**
  - [x] 4.5 Implement `GET /api/leagues/:id/members`, `DELETE /api/leagues/:id/members/:userId` (admin only), `PUT /api/leagues/:id/members/:userId/admin` (admin only)
    - _Requirements: 2.5, 2.6, 2.7_
  - [x] 4.6 Implement submission source management: `PATCH /api/leagues/:id` must validate that at least one source remains enabled after update; return 422 with error message if not
    - _Requirements: 3.6_
  - [ ]* 4.7 Write property test for at-least-one submission source invariant (P8)
    - **Property 8: At-least-one submission source invariant**
    - Generate arbitrary combinations of source enable/disable payloads for league update; verify any payload that would leave zero sources enabled is rejected with 422; verify valid payloads are accepted
    - **Validates: Requirements 3.6, 5.4**

- [ ] 5. Checkpoint — core auth and league APIs
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Round management — server
  - [x] 6.1 Implement `POST /api/leagues/:leagueId/rounds`: require theme, description, required_entry_count; accept deadline_mode, bonus_tracks_allowed, per-round media type override, per-round source overrides, weight; validate at-least-one source if overrides provided
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, 5.7_
  - [x] 6.2 Implement `GET /api/leagues/:leagueId/rounds/:id`: return round with resolved effective media type and submission sources (override ?? league default)
    - _Requirements: 5.5, 5.6_
  - [ ]* 6.3 Write property test for round settings resolution (P7)
    - **Property 7: Round settings resolution (media type and submission sources)**
    - Generate league configs and round configs with and without overrides; verify effective media type = per-round override if set, else league default; verify effective sources = per-round override set if configured, else league-level settings
    - **Validates: Requirements 3.5, 3.6, 5.5, 5.6**
  - [x] 6.4 Implement `POST /api/leagues/:leagueId/rounds/:id/advance` (admin only): advance phase from submission→voting→closed; on close, trigger EqualRCV scoring
    - _Requirements: 4.7, 9.1_
  - [x] 6.5 Implement Rigid Mode deadline scheduler: when a round is created in rigid mode, schedule automatic phase advancement at `submission_deadline` and `voting_deadline` using a simple interval-based check or `node-cron`
    - _Requirements: 4.4_
  - [x] 6.6 Implement Flexible Mode advancement check: after each entry submission and each ballot submission, check if all current league members have completed their action; if so, automatically advance the round phase
    - _Requirements: 4.5, 4.6_
  - [ ]* 6.7 Write property test for flexible mode advancement (P11)
    - **Property 11: Flexible mode advances on completion**
    - Generate N players in a flexible mode round; simulate all N submitting entries; verify round advances to voting phase exactly when the Nth submission is recorded; repeat for voting phase advancing to closed
    - **Validates: Requirements 4.5, 4.6**

- [x] 7. Media Fetcher Service
  - [x] 7.1 Implement `MediaFetcherService` class with `detectSource(url)`, `fetchSpotifyMetadata(url)`, `fetchYouTubeMetadata(url)`, and `fetchMetadata(url)` methods
    - Fetch Spotify oEmbed: `GET https://open.spotify.com/oembed?url=<url>`
    - Fetch YouTube oEmbed: `GET https://www.youtube.com/oembed?url=<url>&format=json`
    - Sanitize `embed_html` before returning (strip disallowed attributes)
    - Return 422 with user-facing message if fetch fails or URL is unsupported
    - _Requirements: 6.3, 6.4, 10.1, 10.2_
  - [ ]* 7.2 Write property test for metadata fetch round-trip (P9)
    - **Property 9: Metadata fetch round-trip**
    - Generate valid Spotify and YouTube URLs with mocked oEmbed responses; verify the `title` stored on the entry equals the `title` field returned by the mocked oEmbed response for that URL
    - **Validates: Requirements 6.3**

- [x] 8. Entry submission — server
  - [x] 8.1 Implement `POST /api/rounds/:roundId/entries`: validate round is in submission phase, validate source is enabled for round, validate player has not exceeded entry count, call `MediaFetcherService`, persist entry with `context_comment` and `thread_starter_comment`
    - Return appropriate 422/409 error messages per the error handling table
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.11_
  - [ ]* 8.2 Write property test for submission source enforcement (P3)
    - **Property 3: Submission source enforcement**
    - Generate round configs with arbitrary enabled source sets and entry submission attempts with arbitrary sources; verify every accepted entry has a source in the enabled set; verify every rejected entry has a source not in the enabled set
    - **Validates: Requirements 3.6, 3.7, 5.3, 6.11**
  - [ ]* 8.3 Write property test for entry count enforcement (P4)
    - **Property 4: Entry count enforcement**
    - Generate players with varying required entry counts and bonus track policies; simulate submission sequences; verify non-bonus entry count never exceeds required count for any player; verify submissions that would exceed the limit are rejected
    - **Validates: Requirements 6.1, 6.2, 6.8**
  - [x] 8.4 Implement `GET /api/rounds/:roundId/entries`: return entries with submitter identity conditionally included based on reveal state (global: all revealed after all voted; per-player: revealed after viewer voted)
    - _Requirements: 6.7, 8.1, 8.2, 8.3, 8.4, 8.5_
  - [ ]* 8.5 Write property test for identity concealment (P5)
    - **Property 5: Identity concealment before reveal**
    - Generate entries and reveal states for arbitrary viewer/round combinations; verify `submitterDisplayName` and `threadStarterComment` are absent from API response when identity has not been revealed to that viewer; verify they are present when revealed
    - **Validates: Requirements 7.7, 8.1, 8.2, 8.5**

- [ ] 9. Checkpoint — entry submission and identity reveal
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Ballot submission — server
  - [x] 10.1 Implement `PUT /api/rounds/:roundId/ballot`: validate round is in voting phase, validate ballot includes all non-bonus entries (no entries left unranked), persist ballot and ballot_items; trigger identity reveal for per-player mode; trigger flexible mode advancement check
    - Return 422 if ballot is incomplete, 409 if round not in voting phase
    - _Requirements: 7.5, 7.8, 7.9, 8.2_
  - [ ]* 10.2 Write property test for ballot completeness enforcement (P6)
    - **Property 6: Ballot completeness enforcement**
    - Generate rounds with N non-bonus entries and ballot submissions missing 1 to N entries; verify all such submissions are rejected with 422; verify a ballot containing all N entries is accepted
    - **Validates: Requirements 7.5, 7.9**
  - [x] 10.3 Implement `GET /api/rounds/:roundId/ballot`: return the authenticated player's current ballot
    - _Requirements: 7.8_

- [x] 11. EqualRCV Engine
  - [x] 11.1 Implement `runEqualRCV(ballots, weights?)` as a pure TypeScript function in `shared/equalRCV.ts`
    - Distribute 1 vote equally among tied top-ranked active candidates per ballot per elimination round
    - Eliminate candidate(s) with fewest votes each round; break ties using prior rounds' scores in reverse chronological order; if still tied, eliminate all simultaneously
    - Assign final ranks based on elimination order (last eliminated = rank 1)
    - Apply weights when provided (for cumulative standings)
    - _Requirements: 9.1, 9.2, 9.3, 9.6, 9.7_
  - [ ]* 11.2 Write property test for EqualRCV complete ranking (P1)
    - **Property 1: EqualRCV produces a complete ranking**
    - Generate arbitrary non-empty candidate sets and non-empty ballot sets (each ballot ranking all candidates); verify result array length equals candidate count; verify no duplicate `final_rank` values among entries that were not tied in the same elimination round
    - **Validates: Requirements 9.1**
  - [ ]* 11.3 Write property test for fractional vote distribution (P2)
    - **Property 2: Fractional vote distribution sums to one**
    - Generate arbitrary ballots with ties (multiple candidates at same rank); for each elimination round of the algorithm, verify the sum of votes distributed from any single ballot across all active candidates equals exactly 1.0 (within floating-point tolerance)
    - **Validates: Requirements 9.7**
  - [x] 11.4 Write unit tests for EqualRCV with concrete scenarios: single winner, two-way tie broken by history, three-way tie with simultaneous elimination, weight application for cumulative standings
    - _Requirements: 9.1, 9.2, 9.3, 9.6, 9.7_

- [x] 12. Scoring and results — server
  - [x] 12.1 Implement the round-close handler: when a round advances to closed, load all ballots from DB, convert to `Ballot[]` format, call `runEqualRCV`, persist results to `round_results`
    - _Requirements: 9.1_
  - [x] 12.2 Implement `GET /api/rounds/:roundId/results`: return per-round results with entry title and submitter display name (closed rounds only)
    - _Requirements: 9.4_
  - [x] 12.3 Implement `GET /api/leagues/:leagueId/standings`: load all closed round results, treat each round winner as a ballot, call `runEqualRCV` with round weights, return cumulative standings
    - _Requirements: 9.2, 9.3, 9.5_

- [x] 13. Comments — server
  - [x] 13.1 Implement `POST /api/rounds/:roundId/entries/:id/comments`: validate commenter is a league member; for regular entries, validate identity has been revealed to commenter; for bonus tracks, validate submission phase has ended; persist comment with author and timestamp
    - _Requirements: 11.1, 11.2, 11.3_
  - [ ]* 13.2 Write property test for comment access requires identity reveal (P13)
    - **Property 13: Comment access requires identity reveal**
    - Generate league members and reveal states for arbitrary entry/viewer combinations; verify comment posting is permitted if and only if identity is revealed to that member (or entry is a bonus track and submission phase has ended); verify all other combinations are rejected with 403
    - **Validates: Requirements 11.1, 11.2**
  - [x] 13.3 Implement `GET /api/rounds/:roundId/entries/:id/comments`: return comments in chronological order with author display name and timestamp
    - _Requirements: 11.3, 11.4_

- [ ] 14. Checkpoint — scoring, results, and comments
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. React client — project setup and routing
  - [x] 15.1 Initialize React 18 + TypeScript client with Vite; install React Router v6, dnd-kit (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/modifiers`), and Vitest + `@testing-library/react` + `@testing-library/user-event`
    - _Requirements: 7.1_
  - [x] 15.2 Set up React Router with routes for: `/login` (LoginPage), `/` (DashboardPage), `/leagues/:id` (LeaguePage), `/leagues/:id/settings` (LeagueSettingsPage), `/leagues/:id/rounds/:roundId` (RoundPage), `/leagues/:id/rounds/:roundId/results` (ResultsPage)
    - Implement a route guard that redirects unauthenticated users to `/login`
    - _Requirements: 1.4, 12.1_
  - [x] 15.3 Implement a global API client module (`client/src/api.ts`) with typed fetch wrappers for all server endpoints; handle 401 responses by redirecting to `/login`
    - _Requirements: 1.4_

- [x] 16. Authentication — client
  - [x] 16.1 Implement `LoginPage`: render a "Sign in with Google" button that navigates to `/auth/google`; display error message when OAuth error query param is present
    - _Requirements: 1.1, 1.3_
  - [x] 16.2 Implement an `AuthContext` provider that calls `GET /auth/me` on mount and exposes the current user; wrap the app in this provider
    - _Requirements: 1.2, 1.4_

- [x] 17. Dashboard and league navigation — client
  - [x] 17.1 Implement `DashboardPage`: fetch and display the user's leagues list; show `PendingActionBadge` on leagues where the user has a pending submission or vote
    - _Requirements: 12.1, 12.2, 12.3_
  - [x] 17.2 Implement `LeaguePage`: display current round with phase, theme, and description; show member list; show `InviteLink` component with copy-to-clipboard functionality for admins
    - _Requirements: 2.2, 12.2_
  - [x] 17.3 Implement `LeagueSettingsPage` (admin only): form to update league name, media type (built-in picker + custom name/emoji fields), reveal mode, and submission source toggles (enforce at-least-one on client side with error message)
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 8.1, 8.2_

- [x] 18. Media embed components — client
  - [x] 18.1 Implement `SpotifyEmbed`: render the `embed_html` iframe for Spotify entries; on `onError`, hide the iframe and render a styled anchor tag pointing to `sourceUrl`
    - _Requirements: 6.9, 6.10, 10.1, 10.3, 10.4_
  - [x] 18.2 Implement `YouTubeEmbed`: render the `embed_html` iframe for YouTube entries; on `onError`, hide the iframe and render a styled anchor tag pointing to `sourceUrl`
    - _Requirements: 6.9, 6.10, 10.2, 10.3, 10.4_
  - [x] 18.3 Implement `EntryCard`: compose `SpotifyEmbed` or `YouTubeEmbed` based on `entry.source`; display title, context comment, submitter name (when revealed), thread-starter comment (when revealed), and `CommentThread`
    - _Requirements: 6.5, 6.7, 8.3, 8.4, 8.5_
  - [ ]* 18.4 Write unit tests for `SpotifyEmbed` and `YouTubeEmbed`: verify fallback anchor renders when `onError` fires; verify iframe is hidden on error
    - _Requirements: 6.10, 10.4_

- [ ] 19. Ranker UI — client
  - [-] 19.1 Implement `RankerBoard`: wrap with `DndContext` from dnd-kit; manage state for unsorted bin entries and ranked grid entries; apply `Snap` modifier to constrain drag to grid increments
    - _Requirements: 7.1, 7.2, 7.3_
  - [-] 19.2 Implement `UnsortedBin`: droppable container displaying all unranked entry tiles; entries start here at the beginning of voting
    - _Requirements: 7.1, 7.2_
  - [-] 19.3 Implement `RankingGrid`: droppable grid with rank rows; support multiple tiles at the same rank position (ties); display baseline rank row with ⚠️ tooltip "Really don't know how to feel about this one, huh?" when an entry is placed there
    - _Requirements: 7.2, 7.3, 7.4, 7.7_
  - [-] 19.4 Implement `EntryTile`: draggable card showing entry title and thumbnail; used in both `UnsortedBin` and `RankingGrid`
    - _Requirements: 7.2_
  - [-] 19.5 Implement `BonusTrackSection`: non-draggable section below the ranking grid displaying bonus track entries
    - _Requirements: 7.6_
  - [ ] 19.6 Wire ballot submission in `RankerBoard`: disable submit button and show error message if any entries remain in the unsorted bin; on submit, call `PUT /api/rounds/:roundId/ballot` with ranked items; lock UI after successful submission
    - _Requirements: 7.5, 7.8, 7.9_
  - [ ]* 19.7 Write unit tests for `RankerBoard`: verify submit is blocked when bin is non-empty; verify snap behavior moves tile to nearest grid position; verify tiles move between bin and grid on drag-and-drop
    - _Requirements: 7.2, 7.3, 7.5, 7.9_

- [ ] 20. Round page and submission form — client
  - [~] 20.1 Implement `RoundPage`: conditionally render submission form (submission phase) or `RankerBoard` (voting phase) or results link (closed phase); display `PhaseTimer` for Rigid Mode rounds
    - _Requirements: 4.4, 6.1, 7.1, 12.2_
  - [~] 20.2 Implement the submission form within `RoundPage`: URL input field, optional context comment field, optional thread-starter comment field; call `POST /api/rounds/:roundId/entries`; display inline error messages for rejected submissions (disabled source, count exceeded, metadata fetch failure)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.8, 6.11_
  - [~] 20.3 Implement `PhaseTimer`: display countdown to `submissionDeadline` or `votingDeadline` for Rigid Mode rounds
    - _Requirements: 4.4_

- [ ] 21. Results page — client
  - [~] 21.1 Implement `ResultsPage`: fetch and display per-round results (entry rank, title, submitter name); fetch and display cumulative league standings leaderboard
    - _Requirements: 9.4, 9.5_

- [ ] 22. Checkpoint — full client implementation
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 23. Integration tests
  - [ ]* 23.1 Write Supertest integration test: full OAuth flow with mocked Google responses — verify user is created with only allowed fields, session is established, `/auth/me` returns user
    - _Requirements: 1.1, 1.2, 1.5_
  - [ ]* 23.2 Write Supertest integration test: league creation → invite link → join flow — verify league created with defaults, invite token generated, second user joins, duplicate join returns 200 with "already a member"
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1_
  - [ ]* 23.3 Write Supertest integration test: full round lifecycle — create round → submit entries → advance to voting → submit ballots → advance to closed → verify results computed and stored
    - _Requirements: 4.1, 6.1, 7.8, 9.1, 9.4_
  - [ ]* 23.4 Write Supertest integration test: concurrent ballot submissions in Flexible Mode — simulate all N players submitting ballots; verify round advances to closed exactly once
    - _Requirements: 4.6_
  - [ ]* 23.5 Write Supertest integration test: cumulative standings after multiple rounds — create 3 rounds, close each, verify standings reflect EqualRCV over round winners with weights applied
    - _Requirements: 9.2, 9.3, 9.5_

- [ ] 24. Final wiring and end-to-end validation
  - [~] 24.1 Wire the Rigid Mode scheduler into the Express app startup so it begins checking deadlines on server start
    - _Requirements: 4.4_
  - [~] 24.2 Add `PATCH /api/leagues/:leagueId/rounds/:id` endpoint for admins to edit round settings (theme, description, overrides) before the round closes
    - _Requirements: 5.1, 5.3_
  - [~] 24.3 Ensure all API error responses match the error handling table in the design (correct HTTP status codes and user-facing messages for all error scenarios)
    - _Requirements: 1.3, 2.4, 3.6, 5.4, 6.4, 6.8, 6.11, 7.9_
  - [~] 24.4 Add `Content-Security-Policy` headers to the Express app to allow Spotify and YouTube iframes while restricting other origins
    - _Requirements: 10.1, 10.2_

- [ ] 25. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints at tasks 5, 9, 14, 22, and 25 ensure incremental validation
- Property tests (P1–P13) validate universal correctness properties using fast-check
- Unit tests validate specific examples and edge cases
- Integration tests (task 23) cover full end-to-end flows against a test PostgreSQL database
