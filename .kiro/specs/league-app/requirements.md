# Requirements Document

## Introduction

The League App is a web application for running league-style media submission and voting competitions. Participants join a league, submit media entries each round according to a theme, and vote on each other's submissions using a ranked-choice drag-to-order interface. Submitter identities are hidden during voting to ensure unbiased ranking. Results are calculated using the EqualRCV algorithm, and cumulative standings are tracked across all rounds in a league.

The app supports a variety of media types — including music, video, memes, podcasts, and more — configurable at the league level with optional per-round overrides. The admin experience follows a "quick to start, deep to customize" philosophy: sensible defaults allow a league or round to be created with minimal configuration, while all settings remain available for admins who want them.

The application is built with a React frontend, Node.js backend, and PostgreSQL database.

## Glossary

- **League**: A named competition containing multiple rounds, administered by one or more admins.
- **Round**: A single competition cycle within a league, defined by a theme and description, with a submission phase and a voting phase.
- **Player**: A user who is a member of a league and participates in rounds.
- **Admin**: A player with elevated privileges to manage a league and its rounds.
- **Entry**: A link to a media item (e.g., a Spotify song, YouTube video, or other supported source) submitted by a player for a round.
- **Media_Type**: A league-level (or round-level) setting that describes the category of media being submitted in a competition (e.g., Music, Video, Meme, Podcast, Potpourri, or a custom type).
- **Submission_Source**: A supported platform from which players may submit entries (e.g., Spotify, YouTube).
- **Bonus Track**: An extra entry submitted beyond the required count; visible and commentable but excluded from voting.
- **Submission Phase**: The period during which players submit entries for a round.
- **Voting Phase**: The period during which players rank entries for a round.
- **EqualRCV**: The ranked-choice voting algorithm used to compute round and league standings.
- **Ballot**: A player's complete ranked ordering of entries for a round.
- **Tier**: A group of entries placed at the same rank on a ballot (tied entries).
- **Baseline**: A special rank boundary on the voting UI representing the like/dislike threshold.
- **Context Comment**: A comment left by the submitter at submission time, visible during voting with submitter identity hidden.
- **Thread-Starter Comment**: A comment left by the submitter at submission time, revealed only when submitter identity is revealed.
- **Invite Link**: A unique URL that allows a user to join a specific league.
- **Rigid Mode**: A deadline mode where submission and voting phases each last a fixed number of days.
- **Flexible Mode**: A deadline mode where phases advance when all players complete their action or when the admin manually advances.
- **System**: The League App backend and frontend application.
- **OAuth_Provider**: The external OAuth service (e.g., Google) used for user authentication.
- **Media_Fetcher**: The System component responsible for retrieving metadata from Spotify and YouTube links.
- **Ranker**: The drag-to-order ranked-choice voting UI component.
- **EqualRCV_Engine**: The System component that executes the EqualRCV algorithm.

---

## Requirements

### Requirement 1: User Authentication

**User Story:** As a visitor, I want to sign in with my Google account, so that I can access the app without managing a separate password.

#### Acceptance Criteria

1. WHEN a visitor initiates sign-in, THE System SHALL redirect the visitor to the OAuth_Provider for authentication.
2. WHEN the OAuth_Provider returns a successful authentication response, THE System SHALL create or retrieve the user account associated with that OAuth identity and establish an authenticated session.
3. IF the OAuth_Provider returns an error or the user denies authorization, THEN THE System SHALL display an error message and return the visitor to the sign-in page.
4. WHEN an authenticated session expires, THE System SHALL redirect the user to the sign-in page before allowing access to protected resources.
5. THE System SHALL store only the OAuth provider identifier, display name, and email address for each user account; THE System SHALL NOT store OAuth tokens beyond the active session.

---

### Requirement 2: League Creation and Administration

**User Story:** As an authenticated user, I want to create a league and manage its membership, so that I can run a competition with my friends.

#### Acceptance Criteria

1. WHEN an authenticated user submits a league creation request with a name, THE System SHALL create a new league and assign the creating user as its first admin.
2. THE System SHALL generate a unique invite link for each league that allows any authenticated user to join that league as a player.
3. WHEN an authenticated user follows a valid invite link, THE System SHALL add that user as a player in the corresponding league.
4. IF an authenticated user follows an invite link for a league they are already a member of, THEN THE System SHALL display a message indicating they are already a member and take no further action.
5. WHEN an admin removes a user from a league, THE System SHALL revoke that user's membership and prevent them from accessing league content.
6. WHEN an admin appoints another league member as admin, THE System SHALL grant that member admin privileges for the league.
7. THE System SHALL allow a league to have multiple admins simultaneously.
8. THE System SHALL allow an admin to participate in rounds as a player within the same league.
9. THE System SHALL allow a user to be a member of multiple leagues simultaneously.

---

### Requirement 3: League Media Type and Submission Sources

**User Story:** As a league admin, I want to configure what kind of media my league focuses on and which platforms players can submit from, so that the competition fits our group's interests without requiring complex setup.

#### Acceptance Criteria

1. WHEN an admin creates a league, THE System SHALL apply the following defaults without requiring explicit configuration: Media_Type set to Potpourri (🍲) and all supported Submission_Sources (Spotify and YouTube) enabled.
2. THE System SHALL provide the following built-in Media_Type options for a league: Video (🎞️), Music (🎶), Meme (🐸), Podcast (🎙️), and Potpourri (🍲).
3. WHEN an admin selects a built-in Media_Type for a league, THE System SHALL associate that Media_Type and its corresponding emoji with the league.
4. WHERE an admin chooses to define a custom Media_Type, THE System SHALL require the admin to provide a name and an emoji, and SHALL associate that custom Media_Type with the league.
5. WHEN an admin updates the league's Media_Type, THE System SHALL apply the new Media_Type to all future rounds that do not have a per-round Media_Type override.
6. THE System SHALL allow an admin to enable or disable each Submission_Source (Spotify, YouTube) at the league level; at least one Submission_Source SHALL remain enabled at all times.
7. WHEN an admin disables a Submission_Source at the league level, THE System SHALL prevent players from submitting entries from that source in rounds that do not have a per-round Submission_Source override.
8. WHEN an admin creates a league without configuring Media_Type or Submission_Sources, THE System SHALL proceed with the defaults described in criterion 1, requiring only a league name to complete creation.

---

### Requirement 4: Round Management

**User Story:** As a league admin, I want to create and configure rounds with themes and deadlines, so that players know what to submit and when.

#### Acceptance Criteria

1. WHEN an admin creates a round, THE System SHALL require a theme and description, and SHALL associate the round with the admin's league.
2. WHEN an admin creates a round, THE System SHALL require the admin to specify the number of entries required per player.
3. WHEN an admin creates a round, THE System SHALL allow the admin to specify whether bonus tracks are permitted.
4. WHEN an admin creates a round in Rigid Mode, THE System SHALL require the admin to specify a submission phase duration in days and a voting phase duration in days, and THE System SHALL automatically advance the round from submission phase to voting phase and from voting phase to closed at the configured times.
5. WHEN an admin creates a round in Flexible Mode, THE System SHALL advance the round from submission phase to voting phase when all current league members have submitted their required entries, or when the admin manually triggers advancement.
6. WHEN a Flexible Mode round is in the voting phase, THE System SHALL advance the round to closed when all current league members have submitted their ballot, or when the admin manually triggers advancement.
7. THE System SHALL allow an admin to manually advance a round to the next phase at any time, regardless of deadline mode.
8. WHERE round weighting is enabled by the admin, THE System SHALL apply the configured weight to that round's results when computing cumulative league standings.

---

### Requirement 5: Per-Round Media Type and Submission Source Overrides

**User Story:** As a league admin, I want to override the media type and allowed submission sources for a specific round, so that I can run themed or one-off rounds without changing the league's default settings.

#### Acceptance Criteria

1. WHEN an admin creates or edits a round, THE System SHALL allow the admin to set a per-round Media_Type override that takes precedence over the league-level Media_Type for that round.
2. WHEN an admin sets a per-round Media_Type override, THE System SHALL accept any built-in Media_Type or a custom Media_Type (name and emoji) as the override value.
3. WHEN an admin creates or edits a round, THE System SHALL allow the admin to set a per-round Submission_Source override that specifies which Submission_Sources are enabled for that round, independent of the league-level Submission_Source settings.
4. IF an admin attempts to disable all Submission_Sources in a per-round override, THEN THE System SHALL reject the configuration and display an error message indicating that at least one Submission_Source must remain enabled.
5. WHEN a round has no per-round Media_Type override, THE System SHALL apply the league-level Media_Type to that round.
6. WHEN a round has no per-round Submission_Source override, THE System SHALL apply the league-level Submission_Source settings to that round.
7. WHEN an admin creates a round without configuring any overrides, THE System SHALL proceed using the league-level defaults, requiring only a theme, description, and entry count to complete round creation.

---

### Requirement 6: Entry Submission

**User Story:** As a player, I want to submit a media link as my entry for a round, so that other players can experience and vote on my pick.

#### Acceptance Criteria

1. WHILE a round is in the submission phase, THE System SHALL allow each league member to submit entries up to the required entry count for that round.
2. WHERE bonus tracks are enabled for a round, THE System SHALL allow each league member to submit additional entries beyond the required count, marked as bonus tracks.
3. WHEN a player submits a valid Spotify or YouTube URL, THE Media_Fetcher SHALL retrieve the title of the song or video from the source platform and associate it with the entry.
4. IF the Media_Fetcher cannot retrieve metadata for a submitted URL, THEN THE System SHALL notify the submitting player and reject the submission.
5. WHEN a player submits an entry, THE System SHALL allow the player to provide an optional context comment to be displayed during the voting phase.
6. WHEN a player submits an entry, THE System SHALL allow the player to provide an optional thread-starter comment to be revealed when submitter identity is revealed.
7. THE System SHALL conceal the identity of each entry's submitter from all other players until submitter identity is revealed for that round.
8. IF a player attempts to submit more entries than the required count plus any permitted bonus tracks, THEN THE System SHALL reject the submission and display an error message.
9. WHEN a player submits an entry, THE System SHALL display an embedded media widget (Spotify player or YouTube player) and a direct link to the source URL alongside the entry.
10. IF the embedded media widget cannot be loaded, THEN THE System SHALL display the direct link to the source URL as a fallback.
11. IF a player attempts to submit an entry from a Submission_Source that is disabled for the current round, THEN THE System SHALL reject the submission and display an error message identifying the disallowed source.

---

### Requirement 7: Voting Phase — Ranked-Choice Ballot

**User Story:** As a player, I want to drag and rank all entries in a round, so that my preferences are captured accurately for scoring.

#### Acceptance Criteria

1. WHILE a round is in the voting phase, THE Ranker SHALL display all non-bonus entries for that round in an unsorted bin.
2. WHEN a player drags an entry tile from the bin and releases it onto the ranking area, THE Ranker SHALL place the tile at the nearest grid increment and remove it from the bin.
3. WHEN a player releases a dragged tile, THE Ranker SHALL animate the tile snapping to the nearest grid position.
4. THE Ranker SHALL allow a player to place multiple entry tiles at the same rank position, representing a tie.
5. THE Ranker SHALL require a player to rank all non-bonus entries before the ballot can be submitted; THE Ranker SHALL prevent submission if any entry remains in the unsorted bin.
6. THE Ranker SHALL display bonus track entries in a separate section that is not part of the ranking area.
7. WHEN a player places an entry tile at the baseline rank position, THE Ranker SHALL display a tooltip with the text "Really don't know how to feel about this one, huh?" accompanied by a ⚠️ icon.
8. WHEN a player submits a completed ballot, THE System SHALL record the ballot and prevent the player from modifying it.
9. IF a player attempts to submit a ballot with one or more entries remaining in the unsorted bin, THEN THE System SHALL display an error message and prevent submission.

---

### Requirement 8: Submitter Identity Reveal

**User Story:** As a player, I want to see who submitted each entry after voting is complete, so that I can discuss picks with the group.

#### Acceptance Criteria

1. WHEN an admin configures a league with global reveal mode, THE System SHALL reveal all submitter identities and thread-starter comments for a round to all players simultaneously after all players in the league have submitted their ballot for that round.
2. WHEN an admin configures a league with per-player reveal mode, THE System SHALL reveal all submitter identities and thread-starter comments for a round to an individual player as soon as that player submits their ballot.
3. WHEN submitter identity is revealed for an entry, THE System SHALL display the submitter's display name on the entry tile alongside the entry title.
4. WHEN submitter identity is revealed for an entry, THE System SHALL display the thread-starter comment beneath the entry.
5. THE System SHALL display the context comment for each entry to all players throughout the voting phase, with the submitter's identity concealed.

---

### Requirement 9: Scoring and Results

**User Story:** As a player, I want to see round results and cumulative league standings after voting closes, so that I know how everyone ranked.

#### Acceptance Criteria

1. WHEN a round advances to closed, THE EqualRCV_Engine SHALL compute per-round rankings by executing the EqualRCV algorithm over all submitted ballots for that round, treating each entry as a candidate and each ballot's tier ordering as the preference list.
2. THE EqualRCV_Engine SHALL compute cumulative league standings by treating each round's winner as a ballot and executing the EqualRCV algorithm over those ballots.
3. WHERE round weighting is configured, THE EqualRCV_Engine SHALL apply the configured weight when incorporating a round's result into cumulative standings.
4. WHEN a round advances to closed, THE System SHALL display per-round results showing each entry's final rank, the entry title, and the submitter's display name.
5. WHEN a round advances to closed, THE System SHALL display the cumulative league leaderboard showing each player's overall standing.
6. THE EqualRCV_Engine SHALL resolve ties in a given RCV elimination round by consulting prior RCV elimination rounds' scores in reverse chronological order; IF the tie cannot be broken by historical scores, THEN THE EqualRCV_Engine SHALL eliminate all tied candidates simultaneously.
7. THE EqualRCV_Engine SHALL distribute fractional votes equally among all tied top-ranked active candidates on a ballot.

---

### Requirement 10: Media Embedding and Link Handling

**User Story:** As a player, I want to preview entries directly in the app, so that I can experience them without leaving the page.

#### Acceptance Criteria

1. WHEN an entry with a Spotify URL is displayed, THE System SHALL render a Spotify embedded player widget for that entry.
2. WHEN an entry with a YouTube URL is displayed, THE System SHALL render a YouTube embedded player widget for that entry.
3. THE System SHALL display a direct clickable link to the source URL for every entry, regardless of whether the embedded widget loads successfully.
4. IF an embedded widget fails to load, THEN THE System SHALL display the direct link as the primary interaction element for that entry.

---

### Requirement 11: Comments and Discussion

**User Story:** As a player, I want to comment on entries and bonus tracks, so that I can share my thoughts with the group.

#### Acceptance Criteria

1. THE System SHALL allow any league member to post comments on any entry in a round after submitter identity has been revealed to that member.
2. THE System SHALL allow any league member to post comments on bonus track entries at any time after the submission phase ends.
3. WHEN a comment is posted, THE System SHALL associate the comment with the commenter's display name and the timestamp of submission.
4. THE System SHALL display comments on an entry in chronological order.

---

### Requirement 12: Multi-League Membership and Navigation

**User Story:** As a user, I want to navigate between my leagues and see the current state of each, so that I can stay on top of all my active competitions.

#### Acceptance Criteria

1. THE System SHALL display a list of all leagues the authenticated user is a member of on the user's home dashboard.
2. WHEN a user selects a league from the dashboard, THE System SHALL display the league's current round, phase, and any pending actions required from that user (submission or voting).
3. THE System SHALL indicate on the dashboard when a user has a pending submission or vote due in any of their leagues.
