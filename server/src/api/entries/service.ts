import { query } from '../../db';
import { mediaFetcherService } from '../../services/mediaFetcher';
import { checkFlexibleAdvancement } from '../rounds/service';

// ─── Types ───────────────────────────────────────────────────────────────────

type SubmissionSource = 'spotify' | 'youtube';

export interface EntryResponse {
  id: string;
  roundId: string;
  title: string;
  sourceUrl: string;
  source: SubmissionSource;
  embedHtml: string;
  thumbnailUrl: string | null;
  isBonusTrack: boolean;
  contextComment: string | null;
  // Only present when identity is revealed to the viewer:
  submitterDisplayName?: string;
  threadStarterComment?: string | null;
}

// ─── Raw DB row types ────────────────────────────────────────────────────────

interface EntryRow {
  id: string;
  round_id: string;
  submitter_id: string;
  submitter_display_name: string;
  source_url: string;
  source: string;
  title: string;
  embed_html: string;
  thumbnail_url: string | null;
  is_bonus_track: boolean;
  context_comment: string | null;
  thread_starter_comment: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function serviceError(message: string, status: number): Error {
  return Object.assign(new Error(message), { status });
}

/**
 * Check whether a submission source is enabled for a round.
 * Checks round_submission_source_overrides first; falls back to league_submission_sources.
 */
async function isSourceEnabledForRound(
  roundId: string,
  leagueId: string,
  source: string
): Promise<boolean> {
  // Check per-round overrides first
  const overrideResult = await query<{ enabled: boolean }>(
    `SELECT enabled FROM round_submission_source_overrides
     WHERE round_id = $1 AND source = $2`,
    [roundId, source]
  );

  if (overrideResult.rows.length > 0) {
    return overrideResult.rows[0].enabled;
  }

  // Fall back to league-level sources
  const leagueResult = await query<{ enabled: boolean }>(
    `SELECT enabled FROM league_submission_sources
     WHERE league_id = $1 AND source = $2`,
    [leagueId, source]
  );

  if (leagueResult.rows.length === 0) {
    // Source not configured at league level — treat as disabled
    return false;
  }

  return leagueResult.rows[0].enabled;
}

// ─── Service functions ───────────────────────────────────────────────────────

export interface SubmitEntryInput {
  roundId: string;
  submitterId: string;
  url: string;
  contextComment?: string;
  threadStarterComment?: string;
}

/**
 * Submit an entry to a round.
 *
 * Validation order:
 * 1. Load round — 404 if not found
 * 2. Check round phase is 'submission' — 409 if not
 * 3. Check submitted URL's source is enabled for the round — 422 if not
 * 4. Fetch media metadata — propagate 422 errors
 * 5. Count existing non-bonus entries by this player — enforce limits
 * 6. Insert entry row
 * 7. Fire-and-forget checkFlexibleAdvancement
 * 8. Return created entry (identity hidden)
 */
export async function submitEntry(input: SubmitEntryInput): Promise<EntryResponse> {
  const { roundId, submitterId, url, contextComment, threadStarterComment } = input;

  // 1. Load round
  const roundResult = await query<{
    id: string;
    league_id: string;
    phase: string;
    required_entry_count: number;
    bonus_tracks_allowed: boolean;
  }>(
    `SELECT id, league_id, phase, required_entry_count, bonus_tracks_allowed
     FROM rounds WHERE id = $1`,
    [roundId]
  );

  if (roundResult.rows.length === 0) {
    throw serviceError('Round not found', 404);
  }

  const round = roundResult.rows[0];

  // 2. Check round phase
  if (round.phase !== 'submission') {
    throw serviceError('This round is not currently accepting submissions.', 409);
  }

  // 3. Check source is enabled for the round
  // Detect source from URL first (mediaFetcherService.detectSource)
  const detectedSource = mediaFetcherService.detectSource(url);
  if (detectedSource === null) {
    // Will be caught by fetchMetadata with a 422, but we need the source for the check.
    // Let fetchMetadata handle the unsupported URL error.
  } else {
    const sourceEnabled = await isSourceEnabledForRound(roundId, round.league_id, detectedSource);
    if (!sourceEnabled) {
      throw serviceError(
        `Submissions from ${detectedSource} are not allowed in this round.`,
        422
      );
    }
  }

  // 4. Fetch media metadata (propagates 422 errors for unsupported/failed URLs)
  const metadata = await mediaFetcherService.fetchMetadata(url);

  // 5. Count existing non-bonus entries by this player for this round
  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM entries
     WHERE round_id = $1 AND submitter_id = $2 AND is_bonus_track = false`,
    [roundId, submitterId]
  );
  const existingCount = parseInt(countResult.rows[0].count, 10);

  let isBonusTrack = false;

  if (existingCount >= round.required_entry_count) {
    if (!round.bonus_tracks_allowed) {
      throw serviceError(
        'You have already submitted the maximum number of entries for this round.',
        422
      );
    }
    // bonus_tracks_allowed = true: mark as bonus track
    isBonusTrack = true;
  }

  // 6. Insert entry row
  const insertResult = await query<{ id: string }>(
    `INSERT INTO entries (
       round_id, submitter_id, source_url, source, title, embed_html,
       thumbnail_url, is_bonus_track, context_comment, thread_starter_comment
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      roundId,
      submitterId,
      metadata.sourceUrl,
      metadata.source,
      metadata.title,
      metadata.embedHtml,
      metadata.thumbnailUrl,
      isBonusTrack,
      contextComment ?? null,
      threadStarterComment ?? null,
    ]
  );

  const entryId = insertResult.rows[0].id;

  // 7. Fire-and-forget flexible advancement check
  checkFlexibleAdvancement(roundId).catch(() => {
    // Intentionally ignored — advancement failure should not affect the response
  });

  // 8. Return created entry (identity hidden — no submitter info)
  return {
    id: entryId,
    roundId,
    title: metadata.title,
    sourceUrl: metadata.sourceUrl,
    source: metadata.source,
    embedHtml: metadata.embedHtml,
    thumbnailUrl: metadata.thumbnailUrl,
    isBonusTrack,
    contextComment: contextComment ?? null,
    // submitterDisplayName and threadStarterComment intentionally omitted
  };
}

/**
 * List all entries for a round, with identity reveal logic applied for the viewer.
 *
 * Reveal logic:
 * - global mode: revealed if ALL league members have submitted a ballot for this round
 * - per_player mode: revealed if viewer has a row in identity_reveals OR has submitted a ballot
 */
export async function listEntries(
  roundId: string,
  viewerId: string
): Promise<EntryResponse[]> {
  // Load round and league reveal_mode
  const roundResult = await query<{
    id: string;
    league_id: string;
    reveal_mode: string;
  }>(
    `SELECT r.id, r.league_id, l.reveal_mode
     FROM rounds r
     INNER JOIN leagues l ON l.id = r.league_id
     WHERE r.id = $1`,
    [roundId]
  );

  if (roundResult.rows.length === 0) {
    throw serviceError('Round not found', 404);
  }

  const { league_id: leagueId, reveal_mode: revealMode } = roundResult.rows[0];

  // Determine if identity is revealed to this viewer
  let identityRevealed = false;

  if (revealMode === 'global') {
    // Revealed if ALL league members have submitted a ballot for this round
    const memberCountResult = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM league_members WHERE league_id = $1`,
      [leagueId]
    );
    const totalMembers = parseInt(memberCountResult.rows[0].count, 10);

    if (totalMembers > 0) {
      const ballotCountResult = await query<{ count: string }>(
        `SELECT COUNT(DISTINCT voter_id) AS count FROM ballots WHERE round_id = $1`,
        [roundId]
      );
      const ballotCount = parseInt(ballotCountResult.rows[0].count, 10);
      identityRevealed = ballotCount >= totalMembers;
    }
  } else {
    // per_player mode: revealed if viewer has identity_reveals row OR has submitted a ballot
    const revealResult = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM identity_reveals
       WHERE round_id = $1 AND viewer_id = $2`,
      [roundId, viewerId]
    );
    const hasReveal = parseInt(revealResult.rows[0].count, 10) > 0;

    if (!hasReveal) {
      const ballotResult = await query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM ballots
         WHERE round_id = $1 AND voter_id = $2`,
        [roundId, viewerId]
      );
      identityRevealed = parseInt(ballotResult.rows[0].count, 10) > 0;
    } else {
      identityRevealed = true;
    }
  }

  // Fetch all entries for the round, joining submitter display name
  const entriesResult = await query<EntryRow>(
    `SELECT
       e.id,
       e.round_id,
       e.submitter_id,
       u.display_name AS submitter_display_name,
       e.source_url,
       e.source,
       e.title,
       e.embed_html,
       e.thumbnail_url,
       e.is_bonus_track,
       e.context_comment,
       e.thread_starter_comment
     FROM entries e
     INNER JOIN users u ON u.id = e.submitter_id
     WHERE e.round_id = $1
     ORDER BY e.submitted_at ASC`,
    [roundId]
  );

  return entriesResult.rows.map((row): EntryResponse => {
    const base: EntryResponse = {
      id: row.id,
      roundId: row.round_id,
      title: row.title,
      sourceUrl: row.source_url,
      source: row.source as SubmissionSource,
      embedHtml: row.embed_html,
      thumbnailUrl: row.thumbnail_url,
      isBonusTrack: row.is_bonus_track,
      contextComment: row.context_comment,
    };

    if (identityRevealed) {
      base.submitterDisplayName = row.submitter_display_name;
      base.threadStarterComment = row.thread_starter_comment;
    }

    return base;
  });
}
