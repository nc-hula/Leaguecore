import { query, pool } from '../../db';
import { checkFlexibleAdvancement } from '../rounds/service';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BallotItemInput {
  entryId: string;
  rankPosition: number;
}

export interface BallotResponse {
  roundId: string;
  voterId: string;
  submittedAt: string;
  items: BallotItemInput[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function serviceError(message: string, status: number): Error {
  return Object.assign(new Error(message), { status });
}

// ─── Service functions ───────────────────────────────────────────────────────

export interface SubmitBallotInput {
  roundId: string;
  voterId: string;
  items: BallotItemInput[];
}

/**
 * Submit a ballot for a round.
 *
 * Validation order:
 * 1. Load round — 404 if not found
 * 2. Check round phase is 'voting' — 409 if not
 * 3. Check if ballot already submitted — 409 if yes
 * 4. Load all non-bonus entry IDs for this round
 * 5. Validate ballot completeness — 422 if any non-bonus entry is missing
 * 6. Persist ballot and ballot_items in a transaction
 * 7. If league reveal_mode = 'per_player': insert identity_reveals row for voter
 * 8. Fire-and-forget checkFlexibleAdvancement
 * 9. Return 201 with the submitted ballot
 */
export async function submitBallot(input: SubmitBallotInput): Promise<BallotResponse> {
  const { roundId, voterId, items } = input;

  // 1. Load round (with league reveal_mode)
  const roundResult = await query<{
    id: string;
    league_id: string;
    phase: string;
    reveal_mode: string;
  }>(
    `SELECT r.id, r.league_id, r.phase, l.reveal_mode
     FROM rounds r
     INNER JOIN leagues l ON l.id = r.league_id
     WHERE r.id = $1`,
    [roundId]
  );

  if (roundResult.rows.length === 0) {
    throw serviceError('Round not found', 404);
  }

  const round = roundResult.rows[0];

  // 2. Check round phase
  if (round.phase !== 'voting') {
    throw serviceError('This round is not currently accepting votes.', 409);
  }

  // 3. Check if ballot already submitted
  const existingBallot = await query<{ id: string }>(
    `SELECT id FROM ballots WHERE round_id = $1 AND voter_id = $2`,
    [roundId, voterId]
  );

  if (existingBallot.rows.length > 0) {
    throw serviceError('Your ballot has already been submitted and cannot be changed.', 409);
  }

  // 4. Load all non-bonus entry IDs for this round
  const entriesResult = await query<{ id: string }>(
    `SELECT id FROM entries WHERE round_id = $1 AND is_bonus_track = false`,
    [roundId]
  );

  const requiredEntryIds = new Set(entriesResult.rows.map((r) => r.id));

  // 5. Validate ballot completeness
  const submittedEntryIds = new Set(items.map((item) => item.entryId));
  for (const entryId of requiredEntryIds) {
    if (!submittedEntryIds.has(entryId)) {
      throw serviceError('All entries must be ranked before submitting.', 422);
    }
  }

  // 6. Persist ballot and ballot_items in a transaction
  const client = await pool.connect();
  let ballotId: string;
  let submittedAt: string;

  try {
    await client.query('BEGIN');

    // Insert ballot row
    const ballotResult = await client.query<{ id: string; submitted_at: string }>(
      `INSERT INTO ballots (round_id, voter_id)
       VALUES ($1, $2)
       RETURNING id, submitted_at`,
      [roundId, voterId]
    );

    ballotId = ballotResult.rows[0].id;
    submittedAt = ballotResult.rows[0].submitted_at;

    // Insert ballot_items rows
    for (const item of items) {
      await client.query(
        `INSERT INTO ballot_items (ballot_id, entry_id, rank_position)
         VALUES ($1, $2, $3)`,
        [ballotId, item.entryId, item.rankPosition]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // 7. If league reveal_mode = 'per_player': insert identity_reveals row for voter
  if (round.reveal_mode === 'per_player') {
    await query(
      `INSERT INTO identity_reveals (round_id, viewer_id)
       VALUES ($1, $2)
       ON CONFLICT (round_id, viewer_id) DO NOTHING`,
      [roundId, voterId]
    );
  }

  // 8. Fire-and-forget flexible advancement check
  checkFlexibleAdvancement(roundId).catch(() => {
    // Intentionally ignored — advancement failure should not affect the response
  });

  // 9. Return the submitted ballot
  return {
    roundId,
    voterId,
    submittedAt,
    items,
  };
}

/**
 * Get the authenticated player's current ballot for a round.
 * Returns null if no ballot has been submitted yet.
 */
export async function getBallot(
  roundId: string,
  voterId: string
): Promise<BallotResponse | null> {
  // Load ballot
  const ballotResult = await query<{
    id: string;
    round_id: string;
    voter_id: string;
    submitted_at: string;
  }>(
    `SELECT id, round_id, voter_id, submitted_at
     FROM ballots
     WHERE round_id = $1 AND voter_id = $2`,
    [roundId, voterId]
  );

  if (ballotResult.rows.length === 0) {
    return null;
  }

  const ballot = ballotResult.rows[0];

  // Load ballot items
  const itemsResult = await query<{ entry_id: string; rank_position: number }>(
    `SELECT entry_id, rank_position
     FROM ballot_items
     WHERE ballot_id = $1
     ORDER BY rank_position ASC, entry_id ASC`,
    [ballot.id]
  );

  return {
    roundId: ballot.round_id,
    voterId: ballot.voter_id,
    submittedAt: ballot.submitted_at,
    items: itemsResult.rows.map((row) => ({
      entryId: row.entry_id,
      rankPosition: row.rank_position,
    })),
  };
}
