import { query } from '../../db';

// Inline types to avoid rootDir constraint (shared types are imported via alias in tests)
type SubmissionSource = 'spotify' | 'youtube';
type RevealMode = 'global' | 'per_player';

interface League {
  id: string;
  name: string;
  mediaTypeName: string;
  mediaTypeEmoji: string;
  revealMode: RevealMode;
  submissionSources: SubmissionSource[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Resolve the enabled submission sources for a league from the
 * league_submission_sources table.
 */
async function resolveSubmissionSources(leagueId: string): Promise<SubmissionSource[]> {
  const result = await query<{ source: string }>(
    `SELECT source FROM league_submission_sources WHERE league_id = $1 AND enabled = true`,
    [leagueId]
  );
  return result.rows.map((r) => r.source as SubmissionSource);
}

/**
 * Map a raw DB row to the shared League type.
 */
function rowToLeague(row: {
  id: string;
  name: string;
  media_type_name: string;
  media_type_emoji: string;
  reveal_mode: string;
}): Omit<League, 'submissionSources'> {
  return {
    id: row.id,
    name: row.name,
    mediaTypeName: row.media_type_name,
    mediaTypeEmoji: row.media_type_emoji,
    revealMode: row.reveal_mode as League['revealMode'],
  };
}

// ─── Service functions ───────────────────────────────────────────────────────

export interface CreateLeagueInput {
  name: string;
  mediaTypeName?: string;
  mediaTypeEmoji?: string;
  revealMode?: string;
  creatorId: string;
}

/**
 * Create a new league, insert both submission sources as enabled, and add the
 * creator as an admin member.
 */
export async function createLeague(input: CreateLeagueInput): Promise<League> {
  const {
    name,
    mediaTypeName = 'Potpourri',
    mediaTypeEmoji = '🍲',
    revealMode = 'global',
    creatorId,
  } = input;

  // Validate revealMode
  if (!['global', 'per_player'].includes(revealMode)) {
    throw Object.assign(new Error('Invalid revealMode'), { status: 400 });
  }

  // Insert league
  const leagueResult = await query<{
    id: string;
    name: string;
    media_type_name: string;
    media_type_emoji: string;
    reveal_mode: string;
  }>(
    `INSERT INTO leagues (name, media_type_name, media_type_emoji, reveal_mode)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, media_type_name, media_type_emoji, reveal_mode`,
    [name, mediaTypeName, mediaTypeEmoji, revealMode]
  );

  const leagueRow = leagueResult.rows[0];

  // Insert both sources as enabled
  await query(
    `INSERT INTO league_submission_sources (league_id, source, enabled) VALUES
     ($1, 'spotify', true),
     ($1, 'youtube', true)`,
    [leagueRow.id]
  );

  // Insert creator as admin
  await query(
    `INSERT INTO league_members (league_id, user_id, role) VALUES ($1, $2, 'admin')`,
    [leagueRow.id, creatorId]
  );

  const submissionSources = await resolveSubmissionSources(leagueRow.id);

  return {
    ...rowToLeague(leagueRow),
    submissionSources,
  };
}

/**
 * Get a single league by ID. Returns null if not found.
 */
export async function getLeague(leagueId: string): Promise<League | null> {
  const result = await query<{
    id: string;
    name: string;
    media_type_name: string;
    media_type_emoji: string;
    reveal_mode: string;
  }>(
    `SELECT id, name, media_type_name, media_type_emoji, reveal_mode
     FROM leagues WHERE id = $1`,
    [leagueId]
  );

  if (result.rows.length === 0) return null;

  const submissionSources = await resolveSubmissionSources(leagueId);

  return {
    ...rowToLeague(result.rows[0]),
    submissionSources,
  };
}

/**
 * List all leagues the given user is a member of.
 */
export async function listUserLeagues(userId: string): Promise<League[]> {
  const result = await query<{
    id: string;
    name: string;
    media_type_name: string;
    media_type_emoji: string;
    reveal_mode: string;
  }>(
    `SELECT l.id, l.name, l.media_type_name, l.media_type_emoji, l.reveal_mode
     FROM leagues l
     INNER JOIN league_members lm ON lm.league_id = l.id
     WHERE lm.user_id = $1
     ORDER BY l.created_at ASC`,
    [userId]
  );

  const leagues: League[] = [];
  for (const row of result.rows) {
    const submissionSources = await resolveSubmissionSources(row.id);
    leagues.push({ ...rowToLeague(row), submissionSources });
  }

  return leagues;
}

export interface UpdateLeagueInput {
  name?: string;
  mediaTypeName?: string;
  mediaTypeEmoji?: string;
  revealMode?: string;
  submissionSources?: string[];
}

/**
 * Update league settings. Handles submission source updates with at-least-one
 * validation.
 */
export async function updateLeague(
  leagueId: string,
  input: UpdateLeagueInput
): Promise<League> {
  const { name, mediaTypeName, mediaTypeEmoji, revealMode, submissionSources } = input;

  // Validate revealMode if provided
  if (revealMode !== undefined && !['global', 'per_player'].includes(revealMode)) {
    throw Object.assign(new Error('Invalid revealMode'), { status: 400 });
  }

  // Handle submission sources update (task 4.6)
  if (submissionSources !== undefined) {
    const validSources = ['spotify', 'youtube'];

    // Validate non-empty
    if (submissionSources.length === 0) {
      throw Object.assign(
        new Error('At least one submission source must remain enabled.'),
        { status: 422 }
      );
    }

    // Validate all provided sources are valid
    for (const src of submissionSources) {
      if (!validSources.includes(src)) {
        throw Object.assign(new Error(`Invalid submission source: ${src}`), { status: 400 });
      }
    }

    // Update enabled/disabled for each known source
    for (const src of validSources) {
      const enabled = submissionSources.includes(src);
      await query(
        `INSERT INTO league_submission_sources (league_id, source, enabled)
         VALUES ($1, $2, $3)
         ON CONFLICT (league_id, source)
         DO UPDATE SET enabled = EXCLUDED.enabled`,
        [leagueId, src, enabled]
      );
    }
  }

  // Build dynamic SET clause for league fields
  const setClauses: string[] = [];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (name !== undefined) {
    setClauses.push(`name = $${paramIdx++}`);
    params.push(name);
  }
  if (mediaTypeName !== undefined) {
    setClauses.push(`media_type_name = $${paramIdx++}`);
    params.push(mediaTypeName);
  }
  if (mediaTypeEmoji !== undefined) {
    setClauses.push(`media_type_emoji = $${paramIdx++}`);
    params.push(mediaTypeEmoji);
  }
  if (revealMode !== undefined) {
    setClauses.push(`reveal_mode = $${paramIdx++}`);
    params.push(revealMode);
  }

  if (setClauses.length > 0) {
    params.push(leagueId);
    await query(
      `UPDATE leagues SET ${setClauses.join(', ')} WHERE id = $${paramIdx}`,
      params
    );
  }

  const updated = await getLeague(leagueId);
  if (!updated) {
    throw Object.assign(new Error('League not found'), { status: 404 });
  }

  return updated;
}

/**
 * Get the invite URL for a league.
 */
export async function getInviteUrl(leagueId: string): Promise<string> {
  const result = await query<{ invite_token: string }>(
    `SELECT invite_token FROM leagues WHERE id = $1`,
    [leagueId]
  );

  if (result.rows.length === 0) {
    throw Object.assign(new Error('League not found'), { status: 404 });
  }

  const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:5173';
  return `${clientUrl}/join/${result.rows[0].invite_token}`;
}

export interface JoinLeagueResult {
  alreadyMember: boolean;
  message: string;
}

/**
 * Join a league via invite token. Returns whether the user was already a member.
 */
export async function joinLeague(token: string, userId: string): Promise<JoinLeagueResult> {
  // Look up league by token
  const leagueResult = await query<{ id: string }>(
    `SELECT id FROM leagues WHERE invite_token = $1`,
    [token]
  );

  if (leagueResult.rows.length === 0) {
    throw Object.assign(new Error('Invalid invite link'), { status: 404 });
  }

  const leagueId = leagueResult.rows[0].id;

  // Check if already a member
  const memberResult = await query<{ user_id: string }>(
    `SELECT user_id FROM league_members WHERE league_id = $1 AND user_id = $2`,
    [leagueId, userId]
  );

  if (memberResult.rows.length > 0) {
    return { alreadyMember: true, message: 'Already a member' };
  }

  // Insert as player
  await query(
    `INSERT INTO league_members (league_id, user_id, role) VALUES ($1, $2, 'player')`,
    [leagueId, userId]
  );

  return { alreadyMember: false, message: 'Joined successfully' };
}

export interface MemberRow {
  userId: string;
  displayName: string;
  email: string;
  role: string;
  joinedAt: string;
}

/**
 * List all members of a league.
 */
export async function listMembers(leagueId: string): Promise<MemberRow[]> {
  const result = await query<{
    user_id: string;
    display_name: string;
    email: string;
    role: string;
    joined_at: string;
  }>(
    `SELECT lm.user_id, u.display_name, u.email, lm.role, lm.joined_at
     FROM league_members lm
     INNER JOIN users u ON u.id = lm.user_id
     WHERE lm.league_id = $1
     ORDER BY lm.joined_at ASC`,
    [leagueId]
  );

  return result.rows.map((r) => ({
    userId: r.user_id,
    displayName: r.display_name,
    email: r.email,
    role: r.role,
    joinedAt: r.joined_at,
  }));
}

/**
 * Remove a member from a league. Throws if trying to remove the last admin.
 */
export async function removeMember(
  leagueId: string,
  targetUserId: string,
  requestingUserId: string
): Promise<void> {
  // Check if target is an admin
  const targetResult = await query<{ role: string }>(
    `SELECT role FROM league_members WHERE league_id = $1 AND user_id = $2`,
    [leagueId, targetUserId]
  );

  if (targetResult.rows.length === 0) {
    throw Object.assign(new Error('Member not found'), { status: 404 });
  }

  const targetRole = targetResult.rows[0].role;

  // If removing yourself and you are an admin, check if you are the last admin
  if (targetUserId === requestingUserId && targetRole === 'admin') {
    const adminCountResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM league_members WHERE league_id = $1 AND role = 'admin'`,
      [leagueId]
    );
    const adminCount = parseInt(adminCountResult.rows[0].count, 10);
    if (adminCount <= 1) {
      throw Object.assign(
        new Error('Cannot remove yourself as the last admin'),
        { status: 400 }
      );
    }
  }

  await query(
    `DELETE FROM league_members WHERE league_id = $1 AND user_id = $2`,
    [leagueId, targetUserId]
  );
}

/**
 * Grant admin role to a league member.
 */
export async function grantAdmin(leagueId: string, targetUserId: string): Promise<void> {
  const result = await query(
    `UPDATE league_members SET role = 'admin' WHERE league_id = $1 AND user_id = $2`,
    [leagueId, targetUserId]
  );

  if ((result as { rowCount: number | null }).rowCount === 0) {
    throw Object.assign(new Error('Member not found'), { status: 404 });
  }
}

/**
 * Check whether a user is a member of a league.
 */
export async function isLeagueMember(leagueId: string, userId: string): Promise<boolean> {
  const result = await query<{ user_id: string }>(
    `SELECT user_id FROM league_members WHERE league_id = $1 AND user_id = $2`,
    [leagueId, userId]
  );
  return result.rows.length > 0;
}

// ─── Cumulative standings ────────────────────────────────────────────────────

import { runEqualRCV } from '@league-app/shared';
import type { RCVBallot } from '@league-app/shared';

export interface StandingsEntry {
  rank: number;
  userId: string;
  displayName: string;
  finalScore: number;
}

export interface StandingsResponse {
  standings: StandingsEntry[];
}

/**
 * Compute cumulative standings for a league.
 *
 * Algorithm:
 * 1. Load all closed rounds for the league with their weights.
 * 2. For each closed round, load winner(s) from round_results (final_rank = 1).
 * 3. Build one cumulative ballot per round where the winner(s) form the top tier.
 *    The "candidates" in cumulative standings are submitter_ids of winning entries.
 * 4. Build a weights map: each player's weight = sum of round weights for rounds they won.
 * 5. Run runEqualRCV(cumulativeBallots, allPlayerIds, weights).
 * 6. Return standings with rank, userId, displayName, finalScore.
 */
export async function getLeagueStandings(leagueId: string): Promise<StandingsResponse> {
  // 1. Load all closed rounds with weights
  const roundsResult = await query<{ id: string; weight: string }>(
    `SELECT id, weight FROM rounds WHERE league_id = $1 AND phase = 'closed' ORDER BY created_at ASC`,
    [leagueId]
  );

  // 2. Load all league members (these are the candidates in cumulative standings)
  const membersResult = await query<{ user_id: string; display_name: string }>(
    `SELECT lm.user_id, u.display_name
     FROM league_members lm
     INNER JOIN users u ON u.id = lm.user_id
     WHERE lm.league_id = $1`,
    [leagueId]
  );

  const allPlayerIds = membersResult.rows.map((r) => r.user_id);
  const playerDisplayNames = new Map(membersResult.rows.map((r) => [r.user_id, r.display_name]));

  if (allPlayerIds.length === 0) {
    return { standings: [] };
  }

  // 3 & 4. For each closed round, get winner(s), build ballots, accumulate weights
  const cumulativeBallots: RCVBallot[] = [];
  const playerWeights = new Map<string, number>();

  for (const round of roundsResult.rows) {
    const roundWeight = parseFloat(round.weight);

    // Get winner(s): entries with final_rank = 1, joined with submitter_id
    const winnersResult = await query<{ submitter_id: string }>(
      `SELECT e.submitter_id
       FROM round_results rr
       INNER JOIN entries e ON e.id = rr.entry_id
       WHERE rr.round_id = $1 AND rr.final_rank = 1`,
      [round.id]
    );

    if (winnersResult.rows.length === 0) continue;

    const winnerIds = winnersResult.rows.map((r) => r.submitter_id);

    // Build ballot: winner(s) form the top tier (single ballot per round)
    const ballot: RCVBallot = [winnerIds];
    cumulativeBallots.push(ballot);

    // Accumulate round weights per winning player
    for (const winnerId of winnerIds) {
      const existing = playerWeights.get(winnerId) ?? 0;
      playerWeights.set(winnerId, existing + roundWeight);
    }
  }

  if (cumulativeBallots.length === 0) {
    // No closed rounds with results yet — return all members at rank 1 with score 0
    const standings: StandingsEntry[] = allPlayerIds.map((userId) => ({
      rank: 1,
      userId,
      displayName: playerDisplayNames.get(userId) ?? '',
      finalScore: 0,
    }));
    return { standings };
  }

  // 5. Run EqualRCV over cumulative ballots with accumulated weights
  const rcvResults = runEqualRCV(cumulativeBallots, allPlayerIds, playerWeights);

  // 6. Build standings response
  const standings: StandingsEntry[] = rcvResults.map((result) => ({
    rank: result.rank,
    userId: result.candidateId,
    displayName: playerDisplayNames.get(result.candidateId) ?? '',
    finalScore: result.finalScore,
  }));

  return { standings };
}
