import { Pool } from '@neondatabase/serverless';
import { closeRound } from './api/rounds/service';

/**
 * Runs the rigid-mode deadline checks once.
 * Queries the database for active rounds in rigid mode that have passed
 * their submission or voting deadlines and advances their phase.
 *
 * @param pool - The database connection pool
 */
export async function runDeadlineChecks(pool: Pool): Promise<void> {
  try {
    // Find all rigid-mode rounds that are not yet closed
    const result = await pool.query<{
      id: string;
      league_id: string;
      phase: string;
      submission_deadline: string | null;
      voting_deadline: string | null;
    }>(
      `SELECT id, league_id, phase, submission_deadline, voting_deadline
       FROM rounds
       WHERE deadline_mode = 'rigid' AND phase != 'closed'`
    );

    const now = new Date();

    for (const round of result.rows) {
      if (
        round.phase === 'submission' &&
        round.submission_deadline != null &&
        new Date(round.submission_deadline) <= now
      ) {
        // Advance submission → voting
        await pool.query(
          `UPDATE rounds SET phase = 'voting' WHERE id = $1 AND phase = 'submission'`,
          [round.id]
        );
        console.log(`[scheduler] Round ${round.id} advanced to voting (submission deadline passed)`);
      } else if (
        round.phase === 'voting' &&
        round.voting_deadline != null &&
        new Date(round.voting_deadline) <= now
      ) {
        // Advance voting → closed
        await pool.query(
          `UPDATE rounds SET phase = 'closed' WHERE id = $1 AND phase = 'voting'`,
          [round.id]
        );
        await closeRound(round.id);
        console.log(`[scheduler] Round ${round.id} advanced to closed (voting deadline passed)`);
      }
    }
  } catch (err) {
    console.error('[scheduler] Error during deadline checks:', err);
  }
}
