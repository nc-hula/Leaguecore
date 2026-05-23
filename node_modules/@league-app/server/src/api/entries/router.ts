import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../auth/middleware';
import { isLeagueMember } from '../leagues/service';
import { submitEntry, listEntries } from './service';
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

// ─── POST /api/rounds/:roundId/entries ───────────────────────────────────────

/**
 * Submit an entry to a round.
 * Body: { url: string, contextComment?: string, threadStarterComment?: string }
 */
router.post(
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

      const { url, contextComment, threadStarterComment } = req.body as {
        url?: string;
        contextComment?: string;
        threadStarterComment?: string;
      };

      if (!url || typeof url !== 'string' || url.trim() === '') {
        res.status(400).json({ error: 'url is required' });
        return;
      }

      const entry = await submitEntry({
        roundId: roundId as string,
        submitterId: userId,
        url: url.trim(),
        contextComment,
        threadStarterComment,
      });

      res.status(201).json(entry);
    } catch (err) {
      if (err instanceof Error && 'status' in err) {
        handleServiceError(err, res);
      } else {
        next(err);
      }
    }
  }
);

// ─── GET /api/rounds/:roundId/entries ────────────────────────────────────────

/**
 * List all entries for a round.
 * Identity (submitterDisplayName, threadStarterComment) is conditionally included
 * based on the league's reveal mode and the viewer's reveal state.
 */
router.get(
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

      const entries = await listEntries(roundId as string, userId);
      res.json(entries);
    } catch (err) {
      if (err instanceof Error && 'status' in err) {
        handleServiceError(err, res);
      } else {
        next(err);
      }
    }
  }
);

export default router;
