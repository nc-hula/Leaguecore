-- Migration 001: Initial Schema
-- Creates all tables for the League App

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
  reveal_mode     TEXT NOT NULL DEFAULT 'global'
    CHECK (reveal_mode IN ('global', 'per_player')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Submission sources enabled per league
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
  submission_days       INT,
  voting_days           INT,
  submission_deadline   TIMESTAMPTZ,
  voting_deadline       TIMESTAMPTZ,
  phase                 TEXT NOT NULL DEFAULT 'submission'
    CHECK (phase IN ('submission', 'voting', 'closed')),
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

-- Identity reveals (per-player mode tracking)
CREATE TABLE identity_reveals (
  round_id    UUID NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  viewer_id   UUID NOT NULL REFERENCES users(id),
  revealed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (round_id, viewer_id)
);
