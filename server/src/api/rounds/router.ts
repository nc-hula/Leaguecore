import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requireLeagueAdmin } from '../../auth/middleware';
import { isLeagueMember } from '../leagues/service';
import {
  createRound,
  getRound,
  listRounds,
  advanceRoundPhase,
} from './service';

// mergeParams: true is required so that :leagueId from the parent router
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

// ─── POST /api/leagues/:leagueId/rounds ──────────────────────────────────────

/**
 * Create a new round. Admin only.
 * Required body: { theme, description, requiredEntryCount }
 * Optional body: { deadlineMode, bonusTracksAllowed, overrideMediaTypeName,
 *                  overrideMediaTypeEmoji, overrideSubmissionSources, weight,
 *                  submissionDays, votingDays }
 */
router.post(
  '/',
  requireAuth,
  requireLeagueAdmin,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { leagueId } = req.params;

      const {
        theme,
        description,
        requiredEntryCount,
        deadlineMode,
        bonusTracksAllowed,
        overrideMediaTypeName,
        overrideMediaTypeEmoji,
        overrideSubmissionSources,
        weight,
        submissionDays,
        votingDays,
      } = req.body as {
        theme?: string;
        description?: string;
        requiredEntryCount?: number;
        deadlineMode?: string;
        bonusTracksAllowed?: boolean;
        overrideMediaTypeName?: string;
        overrideMediaTypeEmoji?: string;
        overrideSubmissionSources?: string[];
        weight?: number;
        submissionDays?: number;
        votingDays?: number;
      };

      // Validate required fields
      if (!theme || typeof theme !== 'string' || theme.trim() === '') {
        res.status(400).json({ error: 'theme is required' });
        return;
      }
      if (!description || typeof description !== 'string' || description.trim() === '') {
        res.status(400).json({ error: 'description is required' });
        return;
      }
      if (requiredEntryCount == null || typeof requiredEntryCount !== 'number' || requiredEntryCount < 1) {
        res.status(400).json({ error: 'requiredEntryCount must be a positive integer' });
        return;
      }

      // Validate deadlineMode if provided
      if (deadlineMode !== undefined && !['rigid', 'flexible'].includes(deadlineMode)) {
        res.status(400).json({ error: "deadlineMode must be 'rigid' or 'flexible'" });
        return;
      }

      const round = await createRound({
        leagueId: leagueId as string,
        theme: theme.trim(),
        description: description.trim(),
        requiredEntryCount,
        deadlineMode: deadlineMode as 'rigid' | 'flexible' | undefined,
        bonusTracksAllowed,
        overrideMediaTypeName,
        overrideMediaTypeEmoji,
        overrideSubmissionSources,
        weight,
        submissionDays,
        votingDays,
      });

      res.status(201).json(round);
    } catch (err) {
      if (err instanceof Error && 'status' in err) {
        handleServiceError(err, res);
      } else {
        next(err);
      }
    }
  }
);

// ─── GET /api/leagues/:leagueId/rounds ───────────────────────────────────────

/**
 * List all rounds for a league. Member only.
 */
router.get(
  '/',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { leagueId } = req.params;

      const member = await isLeagueMember(leagueId as string, req.user!.id);
      if (!member) {
        res.status(403).json({ error: 'Forbidden: you are not a member of this league' });
        return;
      }

      const rounds = await listRounds(leagueId as string);
      res.json(rounds);
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/leagues/:leagueId/rounds/:id ───────────────────────────────────

/**
 * Get a single round with resolved effective media type and submission sources.
 * Member only.
 */
router.get(
  '/:id',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { leagueId, id } = req.params;

      const member = await isLeagueMember(leagueId as string, req.user!.id);
      if (!member) {
        res.status(403).json({ error: 'Forbidden: you are not a member of this league' });
        return;
      }

      const round = await getRound(id as string, leagueId as string);
      if (!round) {
        res.status(404).json({ error: 'Round not found' });
        return;
      }

      res.json(round);
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/leagues/:leagueId/rounds/:id/advance ──────────────────────────

/**
 * Advance the round phase: submission → voting → closed. Admin only.
 */
router.post(
  '/:id/advance',
  requireAuth,
  requireLeagueAdmin,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { leagueId, id } = req.params;

      const updated = await advanceRoundPhase(id as string, leagueId as string);
      res.json(updated);
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
