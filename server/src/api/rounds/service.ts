import { query } from '../../db';
import { runEqualRCV } from '@league-app/shared';
import type { RCVBallot } from '@league-app/shared';

// ─── Types ───────────────────────────────────────────────────────────────────

type SubmissionSource = 'spotify' | 'youtube';
type DeadlineMode = 'rigid' | 'flexible';
type RoundPhase = 'submission' | 'voting' | 'closed';

export interface RoundResponse {
  id: string;
  leagueId: string;
  theme: string;
  description: string;
  requiredEntryCount: number;
  bonusTracksAllowed: boolean;
  deadlineMode: DeadlineMode;
  phase: RoundPhase;
  submissionDeadline?: string;
  votingDeadline?: string;
  mediaTypeName: string;      // resolved (override ?? league default)
  mediaTypeEmoji: string;     // resolved (override ?? league default)
  submissionSources: SubmissionSource[]; // resolved (per-round overrides ?? league defaults)
  weight: number;
}

// ─── Raw DB row types ────────────────────────────────────────────────────────

interface RoundRow {
  id: string;
  league_id: string;
  theme: string;
  description: string;
  required_entry_count: number;
  bonus_tracks_allowed: boolean;
  deadline_mode: string;
  phase: string;
  submission_deadline: string | null;
  voting_deadline: string | null;
  override_media_type_name: string | null;
  override_media_type_emoji: string | null;
  weight: string; // NUMERIC comes back as string from pg
  // League defaults (joined)
  league_media_type_name: string;
  league_media_type_emoji: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Resolve the effective submission sources for a round.
 * Uses per-round overrides if any exist, otherwise falls back to league sources.
 */
async function resolveSubmissionSources(
  roundId: string,
  leagueId: string
): Promise<SubmissionSource[]> {
  // Check for per-round overrides
  const overrideResult = await query<{ source: string; enabled: boolean }>(
    `SELECT source, enabled FROM round_submission_source_overrides WHERE round_id = $1`,
    [roundId]
  );

  if (overrideResult.rows.length > 0) {
    return overrideResult.rows
      .filter((r) => r.enabled)
      .map((r) => r.source as SubmissionSource);
  }

  // Fall back to league sources
  const leagueResult = await query<{ source: string }>(
    `SELECT source FROM league_submission_sources WHERE league_id = $1 AND enabled = true`,
    [leagueId]
  );
  return leagueResult.rows.map((r) => r.source as SubmissionSource);
}

/**
 * Map a raw DB row (with joined league defaults) to a RoundResponse.
 */
async function rowToRoundResponse(row: RoundRow): Promise<RoundResponse> {
  const submissionSources = await resolveSubmissionSources(row.id, row.league_id);

  const response: RoundResponse = {
    id: row.id,
    leagueId: row.league_id,
    theme: row.theme,
    description: row.description,
    requiredEntryCount: row.required_entry_count,
    bonusTracksAllowed: row.bonus_tracks_allowed,
    deadlineMode: row.deadline_mode as DeadlineMode,
    phase: row.phase as RoundPhase,
    mediaTypeName: row.override_media_type_name ?? row.league_media_type_name,
    mediaTypeEmoji: row.override_media_type_emoji ?? row.league_media_type_emoji,
    submissionSources,
    weight: parseFloat(row.weight),
  };

  if (row.submission_deadline) {
    response.submissionDeadline = row.submission_deadline;
  }
  if (row.voting_deadline) {
    response.votingDeadline = row.voting_deadline;
  }

  return response;
}

// SQL fragment to join league defaults onto a round row
const ROUND_SELECT = `
  SELECT
    r.id,
    r.league_id,
    r.theme,
    r.description,
    r.required_entry_count,
    r.bonus_tracks_allowed,
    r.deadline_mode,
    r.phase,
    r.submission_deadline,
    r.voting_deadline,
    r.override_media_type_name,
    r.override_media_type_emoji,
    r.weight,
    l.media_type_name  AS league_media_type_name,
    l.media_type_emoji AS league_media_type_emoji
  FROM rounds r
  INNER JOIN leagues l ON l.id = r.league_id
`;

// ─── Service functions ───────────────────────────────────────────────────────

export interface CreateRoundInput {
  leagueId: string;
  theme: string;
  description: string;
  requiredEntryCount: number;
  deadlineMode?: DeadlineMode;
  bonusTracksAllowed?: boolean;
  overrideMediaTypeName?: string;
  overrideMediaTypeEmoji?: string;
  overrideSubmissionSources?: string[];
  weight?: number;
  submissionDays?: number;
  votingDays?: number;
}

/**
 * Create a new round for a league.
 */
export async function createRound(input: CreateRoundInput): Promise<RoundResponse> {
  const {
    leagueId,
    theme,
    description,
    requiredEntryCount,
    deadlineMode = 'flexible',
    bonusTracksAllowed = false,
    overrideMediaTypeName,
    overrideMediaTypeEmoji,
    overrideSubmissionSources,
    weight = 1.0,
    submissionDays,
    votingDays,
  } = input;

  // Validate rigid mode requirements
  if (deadlineMode === 'rigid') {
    if (submissionDays == null || votingDays == null) {
      throw Object.assign(
        new Error('submissionDays and votingDays are required for rigid deadline mode'),
        { status: 400 }
      );
    }
  }

  // Validate overrideSubmissionSources if provided
  if (overrideSubmissionSources !== undefined) {
    if (overrideSubmissionSources.length === 0) {
      throw Object.assign(
        new Error('At least one submission source must remain enabled.'),
        { status: 422 }
      );
    }
    const validSources: SubmissionSource[] = ['spotify', 'youtube'];
    for (const src of overrideSubmissionSources) {
      if (!validSources.includes(src as SubmissionSource)) {
        throw Object.assign(
          new Error(`Invalid submission source: ${src}. Must be 'spotify' or 'youtube'.`),
          { status: 422 }
        );
      }
    }
  }

  // Compute deadlines for rigid mode
  let submissionDeadline: Date | null = null;
  let votingDeadline: Date | null = null;

  if (deadlineMode === 'rigid' && submissionDays != null && votingDays != null) {
    submissionDeadline = new Date();
    submissionDeadline.setDate(submissionDeadline.getDate() + submissionDays);
    votingDeadline = new Date(submissionDeadline);
    votingDeadline.setDate(votingDeadline.getDate() + votingDays);
  }

  // Insert round
  const roundResult = await query<{ id: string }>(
    `INSERT INTO rounds (
       league_id, theme, description, required_entry_count,
       bonus_tracks_allowed, deadline_mode,
       submission_days, voting_days,
       submission_deadline, voting_deadline,
       override_media_type_name, override_media_type_emoji,
       weight
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING id`,
    [
      leagueId,
      theme,
      description,
      requiredEntryCount,
      bonusTracksAllowed,
      deadlineMode,
      submissionDays ?? null,
      votingDays ?? null,
      submissionDeadline,
      votingDeadline,
      overrideMediaTypeName ?? null,
      overrideMediaTypeEmoji ?? null,
      weight,
    ]
  );

  const roundId = roundResult.rows[0].id;

  // Insert per-round source overrides if provided
  if (overrideSubmissionSources !== undefined) {
    const allSources: SubmissionSource[] = ['spotify', 'youtube'];
    for (const src of allSources) {
      const enabled = overrideSubmissionSources.includes(src);
      await query(
        `INSERT INTO round_submission_source_overrides (round_id, source, enabled)
         VALUES ($1, $2, $3)`,
        [roundId, src, enabled]
      );
    }
  }

  // Fetch and return the created round with resolved settings
  const round = await getRound(roundId, leagueId);
  if (!round) {
    throw new Error('Failed to retrieve created round');
  }
  return round;
}

/**
 * Get a single round by ID, verifying it belongs to the given league.
 * Returns null if not found.
 */
export async function getRound(
  roundId: string,
  leagueId: string
): Promise<RoundResponse | null> {
  const result = await query<RoundRow>(
    `${ROUND_SELECT} WHERE r.id = $1 AND r.league_id = $2`,
    [roundId, leagueId]
  );

  if (result.rows.length === 0) return null;

  return rowToRoundResponse(result.rows[0]);
}

/**
 * List all rounds for a league.
 */
export async function listRounds(leagueId: string): Promise<RoundResponse[]> {
  const result = await query<RoundRow>(
    `${ROUND_SELECT} WHERE r.league_id = $1 ORDER BY r.created_at ASC`,
    [leagueId]
  );

  const rounds: RoundResponse[] = [];
  for (const row of result.rows) {
    rounds.push(await rowToRoundResponse(row));
  }
  return rounds;
}

/**
 * Advance a round's phase: submission → voting → closed.
 * Returns the updated round.
 */
export async function advanceRoundPhase(
  roundId: string,
  leagueId: string
): Promise<RoundResponse> {
  // Load current phase
  const current = await query<{ phase: string }>(
    `SELECT phase FROM rounds WHERE id = $1 AND league_id = $2`,
    [roundId, leagueId]
  );

  if (current.rows.length === 0) {
    throw Object.assign(new Error('Round not found'), { status: 404 });
  }

  const currentPhase = current.rows[0].phase as RoundPhase;

  if (currentPhase === 'closed') {
    throw Object.assign(new Error('Round is already closed'), { status: 409 });
  }

  const nextPhase: RoundPhase = currentPhase === 'submission' ? 'voting' : 'closed';

  await query(
    `UPDATE rounds SET phase = $1 WHERE id = $2`,
    [nextPhase, roundId]
  );

  // If advancing to closed, call the close handler (task 12 will implement full scoring)
  if (nextPhase === 'closed') {
    await closeRound(roundId);
  }

  const updated = await getRound(roundId, leagueId);
  if (!updated) {
    throw new Error('Failed to retrieve updated round');
  }
  return updated;
}

/**
 * Close a round — load all submitted ballots, run EqualRCV, and persist
 * results to the round_results table.
 *
 * Edge case: if no ballots exist, all entries are assigned final_rank = 1.
 */
export async function closeRound(roundId: string): Promise<void> {
  // 1. Load all non-bonus entries for this round (these are the candidates)
  const entriesResult = await query<{ id: string }>(
    `SELECT id FROM entries WHERE round_id = $1 AND is_bonus_track = false`,
    [roundId]
  );
  const candidateIds = entriesResult.rows.map((r) => r.id);

  if (candidateIds.length === 0) {
    // Nothing to score
    return;
  }

  // 2. Load all submitted ballots for this round with their items
  const ballotsResult = await query<{ ballot_id: string; entry_id: string; rank_position: number }>(
    `SELECT b.id AS ballot_id, bi.entry_id, bi.rank_position
     FROM ballots b
     INNER JOIN ballot_items bi ON bi.ballot_id = b.id
     WHERE b.round_id = $1
     ORDER BY b.id, bi.rank_position ASC, bi.entry_id ASC`,
    [roundId]
  );

  // 3. Convert to RCVBallot[] format
  // Group items by ballot_id, then by rank_position to form tiers
  const ballotMap = new Map<string, Map<number, string[]>>();
  for (const row of ballotsResult.rows) {
    if (!ballotMap.has(row.ballot_id)) {
      ballotMap.set(row.ballot_id, new Map());
    }
    const tierMap = ballotMap.get(row.ballot_id)!;
    if (!tierMap.has(row.rank_position)) {
      tierMap.set(row.rank_position, []);
    }
    tierMap.get(row.rank_position)!.push(row.entry_id);
  }

  const rcvBallots: RCVBallot[] = [];
  for (const [, tierMap] of ballotMap) {
    // Sort tiers by rank_position ascending (0 = highest preference)
    const sortedPositions = Array.from(tierMap.keys()).sort((a, b) => a - b);
    const ballot: RCVBallot = sortedPositions.map((pos) => tierMap.get(pos)!);
    rcvBallots.push(ballot);
  }

  // 4. If no ballots exist, upsert all entries with final_rank = 1
  if (rcvBallots.length === 0) {
    for (const entryId of candidateIds) {
      await query(
        `INSERT INTO round_results (round_id, entry_id, final_rank, final_score)
         VALUES ($1, $2, 1, 0)
         ON CONFLICT (round_id, entry_id)
         DO UPDATE SET final_rank = EXCLUDED.final_rank, final_score = EXCLUDED.final_score`,
        [roundId, entryId]
      );
    }
    return;
  }

  // 5. Run EqualRCV
  const results = runEqualRCV(rcvBallots, candidateIds);

  // 6. Persist results to round_results (upsert)
  for (const result of results) {
    await query(
      `INSERT INTO round_results (round_id, entry_id, final_rank, final_score)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (round_id, entry_id)
       DO UPDATE SET final_rank = EXCLUDED.final_rank, final_score = EXCLUDED.final_score`,
      [roundId, result.candidateId, result.rank, result.finalScore]
    );
  }
}

/**
 * Check whether flexible mode advancement conditions are met and advance if so.
 *
 * - submission phase: advance to voting if all league members have submitted
 *   at least `required_entry_count` non-bonus entries
 * - voting phase: advance to closed if all league members have submitted a ballot
 */
export async function checkFlexibleAdvancement(roundId: string): Promise<void> {
  // Load round details
  const roundResult = await query<{
    id: string;
    league_id: string;
    phase: string;
    deadline_mode: string;
    required_entry_count: number;
  }>(
    `SELECT id, league_id, phase, deadline_mode, required_entry_count
     FROM rounds WHERE id = $1`,
    [roundId]
  );

  if (roundResult.rows.length === 0) return;

  const round = roundResult.rows[0];

  // Only applies to flexible mode rounds that are not closed
  if (round.deadline_mode !== 'flexible' || round.phase === 'closed') return;

  // Count total league members
  const memberCountResult = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM league_members WHERE league_id = $1`,
    [round.league_id]
  );
  const totalMembers = parseInt(memberCountResult.rows[0].count, 10);

  if (totalMembers === 0) return;

  if (round.phase === 'submission') {
    // Count players who have submitted at least required_entry_count non-bonus entries
    const submittedResult = await query<{ count: string }>(
      `SELECT COUNT(DISTINCT submitter_id) AS count
       FROM (
         SELECT submitter_id
         FROM entries
         WHERE round_id = $1 AND is_bonus_track = false
         GROUP BY submitter_id
         HAVING COUNT(*) >= $2
       ) AS qualified_submitters`,
      [roundId, round.required_entry_count]
    );
    const submittedCount = parseInt(submittedResult.rows[0].count, 10);

    if (submittedCount >= totalMembers) {
      await query(`UPDATE rounds SET phase = 'voting' WHERE id = $1`, [roundId]);
    }
  } else if (round.phase === 'voting') {
    // Count distinct voters who have submitted a ballot
    const votedResult = await query<{ count: string }>(
      `SELECT COUNT(DISTINCT voter_id) AS count FROM ballots WHERE round_id = $1`,
      [roundId]
    );
    const votedCount = parseInt(votedResult.rows[0].count, 10);

    if (votedCount >= totalMembers) {
      await query(`UPDATE rounds SET phase = 'closed' WHERE id = $1`, [roundId]);
      await closeRound(roundId);
    }
  }
}

// ─── Round results response type ─────────────────────────────────────────────

export interface RoundResultResponse {
  entryId: string;
  entryTitle: string;
  submitterDisplayName: string;
  finalRank: number;
  finalScore: number;
  sourceUrl: string;
  source: string;
  thumbnailUrl: string | null;
  isBonusTrack: boolean;
}

/**
 * Get the computed results for a closed round.
 * Joins round_results with entries and users to return enriched result rows.
 * Ordered by final_rank ASC, entry_title ASC.
 */
export async function getRoundResults(roundId: string): Promise<RoundResultResponse[]> {
  const result = await query<{
    entry_id: string;
    title: string;
    display_name: string;
    final_rank: number;
    final_score: string;
    source_url: string;
    source: string;
    thumbnail_url: string | null;
    is_bonus_track: boolean;
  }>(
    `SELECT
       rr.entry_id,
       e.title,
       u.display_name,
       rr.final_rank,
       rr.final_score,
       e.source_url,
       e.source,
       e.thumbnail_url,
       e.is_bonus_track
     FROM round_results rr
     INNER JOIN entries e ON e.id = rr.entry_id
     INNER JOIN users u ON u.id = e.submitter_id
     WHERE rr.round_id = $1
     ORDER BY rr.final_rank ASC, e.title ASC`,
    [roundId]
  );

  return result.rows.map((row) => ({
    entryId: row.entry_id,
    entryTitle: row.title,
    submitterDisplayName: row.display_name,
    finalRank: row.final_rank,
    finalScore: parseFloat(row.final_score),
    sourceUrl: row.source_url,
    source: row.source,
    thumbnailUrl: row.thumbnail_url,
    isBonusTrack: row.is_bonus_track,
  }));
}

// ─── Update round ─────────────────────────────────────────────────────────────

export interface UpdateRoundInput {
  theme?: string;
  description?: string;
  overrideMediaTypeName?: string;
  overrideMediaTypeEmoji?: string;
  overrideSubmissionSources?: string[];
  weight?: number;
}

/**
 * Update editable fields on a round that hasn't closed yet.
 * Admins can change theme, description, media type override, source overrides, and weight.
 */
export async function updateRound(
  roundId: string,
  leagueId: string,
  input: UpdateRoundInput
): Promise<RoundResponse> {
  const {
    theme,
    description,
    overrideMediaTypeName,
    overrideMediaTypeEmoji,
    overrideSubmissionSources,
    weight,
  } = input;

  // Validate overrideSubmissionSources if provided
  if (overrideSubmissionSources !== undefined) {
    if (overrideSubmissionSources.length === 0) {
      throw Object.assign(
        new Error('At least one submission source must remain enabled.'),
        { status: 422 }
      );
    }
    const valid: SubmissionSource[] = ['spotify', 'youtube'];
    for (const src of overrideSubmissionSources) {
      if (!valid.includes(src as SubmissionSource)) {
        throw Object.assign(
          new Error(`Invalid submission source: ${src}`),
          { status: 400 }
        );
      }
    }
    // Upsert round_submission_source_overrides
    for (const src of valid) {
      const enabled = overrideSubmissionSources.includes(src);
      await query(
        `INSERT INTO round_submission_source_overrides (round_id, source, enabled)
         VALUES ($1, $2, $3)
         ON CONFLICT (round_id, source)
         DO UPDATE SET enabled = EXCLUDED.enabled`,
        [roundId, src, enabled]
      );
    }
  }

  // Build dynamic SET clause
  const setClauses: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (theme !== undefined) { setClauses.push(`theme = $${idx++}`); params.push(theme); }
  if (description !== undefined) { setClauses.push(`description = $${idx++}`); params.push(description); }
  if (overrideMediaTypeName !== undefined) { setClauses.push(`override_media_type_name = $${idx++}`); params.push(overrideMediaTypeName); }
  if (overrideMediaTypeEmoji !== undefined) { setClauses.push(`override_media_type_emoji = $${idx++}`); params.push(overrideMediaTypeEmoji); }
  if (weight !== undefined) { setClauses.push(`weight = $${idx++}`); params.push(weight); }

  if (setClauses.length > 0) {
    params.push(roundId);
    await query(
      `UPDATE rounds SET ${setClauses.join(', ')} WHERE id = $${idx}`,
      params
    );
  }

  const updated = await getRound(roundId, leagueId);
  if (!updated) throw Object.assign(new Error('Round not found'), { status: 404 });
  return updated;
}
