import { query } from '../../db';

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
 * Close a round — placeholder for task 12's EqualRCV scoring.
 * Currently just a no-op; task 12 will implement full scoring logic.
 */
export async function closeRound(roundId: string): Promise<void> {
  // Task 12 will implement: load ballots, run EqualRCV, persist round_results
  // For now, the phase update in advanceRoundPhase is sufficient
  void roundId;
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
