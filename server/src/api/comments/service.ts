import { query } from '../../db';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CommentResponse {
  id: string;
  entryId: string;
  authorId: string;
  authorDisplayName: string;
  body: string;
  createdAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function serviceError(message: string, status: number): Error {
  return Object.assign(new Error(message), { status });
}

// ─── Service functions ───────────────────────────────────────────────────────

export interface PostCommentInput {
  entryId: string;
  roundId: string;
  authorId: string;
  body: string;
}

/**
 * Post a comment on an entry.
 *
 * Validation order:
 * 1. Load the entry — 404 if not found
 * 2. Load the round for that entry, join with league for reveal_mode
 * 3. Verify the commenter is a league member — 403 if not
 * 4. Access control based on entry type:
 *    - Bonus track: allow if round phase != 'submission'; 403 otherwise
 *    - Regular entry: check identity reveal for commenter
 *      - global mode: revealed if ALL league members have submitted a ballot
 *      - per_player mode: revealed if viewer has identity_reveals row OR has submitted a ballot
 *      - 403 if not revealed
 * 5. Validate body — 400 if missing or empty
 * 6. Insert comment row
 * 7. Return 201 with comment data
 */
export async function postComment(input: PostCommentInput): Promise<CommentResponse> {
  const { entryId, roundId, authorId, body } = input;

  // 1. Load the entry — verify it exists and belongs to this round
  const entryResult = await query<{
    id: string;
    round_id: string;
    is_bonus_track: boolean;
  }>(
    `SELECT id, round_id, is_bonus_track FROM entries WHERE id = $1`,
    [entryId]
  );

  if (entryResult.rows.length === 0) {
    throw serviceError('Entry not found', 404);
  }

  const entry = entryResult.rows[0];

  // Verify the entry belongs to the stated round
  if (entry.round_id !== roundId) {
    throw serviceError('Entry not found', 404);
  }

  // 2. Load the round and league reveal_mode
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

  // 3. Verify the commenter is a league member
  const memberResult = await query<{ user_id: string }>(
    `SELECT user_id FROM league_members WHERE league_id = $1 AND user_id = $2`,
    [round.league_id, authorId]
  );

  if (memberResult.rows.length === 0) {
    throw serviceError('Forbidden: you are not a member of this league', 403);
  }

  // 4. Access control based on entry type
  if (entry.is_bonus_track) {
    // Bonus track: allow commenting if round phase != 'submission'
    if (round.phase === 'submission') {
      throw serviceError(
        'Bonus track comments are available after the submission phase ends.',
        403
      );
    }
  } else {
    // Regular entry: check if identity is revealed to this commenter
    let identityRevealed = false;

    if (round.reveal_mode === 'global') {
      // Global mode: revealed if ALL league members have submitted a ballot
      const memberCountResult = await query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM league_members WHERE league_id = $1`,
        [round.league_id]
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
        [roundId, authorId]
      );
      const hasReveal = parseInt(revealResult.rows[0].count, 10) > 0;

      if (!hasReveal) {
        const ballotResult = await query<{ count: string }>(
          `SELECT COUNT(*) AS count FROM ballots
           WHERE round_id = $1 AND voter_id = $2`,
          [roundId, authorId]
        );
        identityRevealed = parseInt(ballotResult.rows[0].count, 10) > 0;
      } else {
        identityRevealed = true;
      }
    }

    if (!identityRevealed) {
      throw serviceError(
        'Comments are available after submitter identity is revealed.',
        403
      );
    }
  }

  // 5. Validate body (already validated in router, but double-check here)
  if (!body || body.trim() === '') {
    throw serviceError('Comment body is required', 400);
  }

  // 6. Insert comment row
  const insertResult = await query<{
    id: string;
    entry_id: string;
    author_id: string;
    body: string;
    created_at: string;
  }>(
    `INSERT INTO comments (entry_id, author_id, body)
     VALUES ($1, $2, $3)
     RETURNING id, entry_id, author_id, body, created_at`,
    [entryId, authorId, body.trim()]
  );

  const comment = insertResult.rows[0];

  // 7. Fetch the author's display name
  const userResult = await query<{ display_name: string }>(
    `SELECT display_name FROM users WHERE id = $1`,
    [authorId]
  );

  const authorDisplayName = userResult.rows[0]?.display_name ?? '';

  return {
    id: comment.id,
    entryId: comment.entry_id,
    authorId: comment.author_id,
    authorDisplayName,
    body: comment.body,
    createdAt: comment.created_at,
  };
}

/**
 * List all comments for an entry in chronological order.
 *
 * Validation:
 * 1. Load the entry — 404 if not found (or doesn't belong to roundId)
 * 2. Verify the viewer is a league member — 403 if not
 * 3. Query comments joined with users for this entry, ordered by created_at ASC
 */
export async function listComments(
  entryId: string,
  roundId: string,
  viewerId: string
): Promise<CommentResponse[]> {
  // 1. Load the entry — verify it exists and belongs to this round
  const entryResult = await query<{
    id: string;
    round_id: string;
  }>(
    `SELECT id, round_id FROM entries WHERE id = $1`,
    [entryId]
  );

  if (entryResult.rows.length === 0) {
    throw serviceError('Entry not found', 404);
  }

  if (entryResult.rows[0].round_id !== roundId) {
    throw serviceError('Entry not found', 404);
  }

  // Load the round to get the league ID
  const roundResult = await query<{ league_id: string }>(
    `SELECT league_id FROM rounds WHERE id = $1`,
    [roundId]
  );

  if (roundResult.rows.length === 0) {
    throw serviceError('Round not found', 404);
  }

  const { league_id: leagueId } = roundResult.rows[0];

  // 2. Verify the viewer is a league member
  const memberResult = await query<{ user_id: string }>(
    `SELECT user_id FROM league_members WHERE league_id = $1 AND user_id = $2`,
    [leagueId, viewerId]
  );

  if (memberResult.rows.length === 0) {
    throw serviceError('Forbidden: you are not a member of this league', 403);
  }

  // 3. Query comments joined with users, ordered by created_at ASC
  const commentsResult = await query<{
    id: string;
    entry_id: string;
    author_id: string;
    display_name: string;
    body: string;
    created_at: string;
  }>(
    `SELECT
       c.id,
       c.entry_id,
       c.author_id,
       u.display_name,
       c.body,
       c.created_at
     FROM comments c
     INNER JOIN users u ON u.id = c.author_id
     WHERE c.entry_id = $1
     ORDER BY c.created_at ASC`,
    [entryId]
  );

  return commentsResult.rows.map((row) => ({
    id: row.id,
    entryId: row.entry_id,
    authorId: row.author_id,
    authorDisplayName: row.display_name,
    body: row.body,
    createdAt: row.created_at,
  }));
}
