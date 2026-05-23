import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../auth/middleware';
import { isLeagueMember } from '../leagues/service';
import { submitBallot, getBallot } from './service';
import { query } from '../../db';

// mergeParams: true is required so that :roundId from the parent router
// is accessible in this sub-router's req.params
const router = Router({ mergeParams: true });

// ─── Helper ──────────────────────────────────────────────────────────────────

/** Forward service errors that carry a .status property to the client. */
function handleServiceError(err: unknown, res: Response): void {
  if (err instanceof Error && 'status' in err) {
    const status = (err as Error & { status: number }).status;
    res.status(status).json({ error: err.message });
    return;
  }
  throw err;
}

/**
 * Look up the league ID for a given round.
 * Returns null if the round does not exist.
 */
async function getLeagueIdForRound(roundId: string): Promise<string | null> {
  const result = await query<{ league_id: string }>(
    `SELECT league_id FROM rounds WHERE id = $1`,
    [roundId]
  );
  return result.rows.length > 0 ? result.rows[0].league_id : null;
}

// ─── PUT /api/rounds/:roundId/ballot ─────────────────────────────────────────

/**
 * Submit a ballot for a round.
 * Body: { items: Array<{ entryId: string, rankPosition: number }> }
 *
 * Requires authentication and league membership.
 * Returns 201 with the submitted ballot on success.
 */
router.put(
  '/',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { roundId } = req.params;
      const userId = req.user!.id;

      // Verify user is a league member
      const leagueId = await getLeagueIdForRound(roundId as string);
      if (leagueId === null) {
        res.status(404).json({ error: 'Round not found' });
        return;
      }

      const member = await isLeagueMember(leagueId, userId);
      if (!member) {
        res.status(403).json({ error: 'Forbidden: you are not a member of this league' });
        return;
      }

      const { items } = req.body as {
        items?: Array<{ entryId?: string; rankPosition?: number }>;
      };

      if (!Array.isArray(items)) {
        res.status(400).json({ error: 'items must be an array' });
        return;
      }

      // Validate each item has required fields
      for (const item of items) {
        if (typeof item.entryId !== 'string' || item.entryId.trim() === '') {
          res.status(400).json({ error: 'Each item must have a valid entryId' });
          return;
        }
        if (typeof item.rankPosition !== 'number' || item.rankPosition < 0) {
          res.status(400).json({ error: 'Each item must have a non-negative rankPosition' });
          return;
        }
      }

      const ballot = await submitBallot({
        roundId: roundId as string,
        voterId: userId,
        items: items as Array<{ entryId: string; rankPosition: number }>,
      });

      res.status(201).json(ballot);
    } catch (err) {
      if (err instanceof Error && 'status' in err) {
        handleServiceError(err, res);
      } else {
        next(err);
      }
    }
  }
);

// ─── GET /api/rounds/:roundId/ballot ─────────────────────────────────────────

/**
 * Get the authenticated player's current ballot for a round.
 * Returns 404 if no ballot has been submitted yet.
 *
 * Requires authentication.
 */
router.get(
  '/',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { roundId } = req.params;
      const userId = req.user!.id;

      const ballot = await getBallot(roundId as string, userId);

      if (ballot === null) {
        res.status(404).json({ error: 'No ballot found for this round' });
        return;
      }

      res.json(ballot);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
