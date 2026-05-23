import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requireLeagueAdmin } from '../../auth/middleware';
import {
  createLeague,
  getLeague,
  listUserLeagues,
  updateLeague,
  getInviteUrl,
  joinLeague,
  listMembers,
  removeMember,
  grantAdmin,
  isLeagueMember,
} from './service';

const router = Router();

// ─── Helper ─────────────────────────────────────────────────────────────────

/** Forward service errors that carry a .status property to the client. */
function handleServiceError(err: unknown, res: Response): void {
  if (err instanceof Error && 'status' in err) {
    const status = (err as Error & { status: number }).status;
    res.status(status).json({ error: err.message });
    return;
  }
  throw err; // let Express error handler deal with unexpected errors
}

// ─── POST /api/leagues ───────────────────────────────────────────────────────

/**
 * Create a new league.
 * Body: { name, mediaTypeName?, mediaTypeEmoji?, revealMode? }
 */
router.post(
  '/',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, mediaTypeName, mediaTypeEmoji, revealMode } = req.body as {
        name?: string;
        mediaTypeName?: string;
        mediaTypeEmoji?: string;
        revealMode?: string;
      };

      if (!name || typeof name !== 'string' || name.trim() === '') {
        res.status(400).json({ error: 'name is required' });
        return;
      }

      const league = await createLeague({
        name: name.trim(),
        mediaTypeName,
        mediaTypeEmoji,
        revealMode,
        creatorId: req.user!.id,
      });

      res.status(201).json(league);
    } catch (err) {
      if (err instanceof Error && 'status' in err) {
        handleServiceError(err, res);
      } else {
        next(err);
      }
    }
  }
);

// ─── POST /api/leagues/join/:token ───────────────────────────────────────────

/**
 * Join a league via invite token.
 * Must be defined before /:id routes to avoid token being matched as an id.
 */
router.post(
  '/join/:token',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token } = req.params;
      const result = await joinLeague(token as string, req.user!.id);

      if (result.alreadyMember) {
        res.status(200).json({ message: result.message, alreadyMember: true });
      } else {
        res.status(201).json({ message: result.message });
      }
    } catch (err) {
      if (err instanceof Error && 'status' in err) {
        handleServiceError(err, res);
      } else {
        next(err);
      }
    }
  }
);

// ─── GET /api/leagues ────────────────────────────────────────────────────────

/**
 * List all leagues the authenticated user is a member of.
 */
router.get(
  '/',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const leagues = await listUserLeagues(req.user!.id);
      res.json(leagues);
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/leagues/:id ────────────────────────────────────────────────────

/**
 * Get league details. User must be a member.
 */
router.get(
  '/:id',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      const member = await isLeagueMember(id as string, req.user!.id);
      if (!member) {
        res.status(403).json({ error: 'Forbidden: you are not a member of this league' });
        return;
      }

      const league = await getLeague(id as string);
      if (!league) {
        res.status(404).json({ error: 'League not found' });
        return;
      }

      res.json(league);
    } catch (err) {
      next(err);
    }
  }
);

// ─── PATCH /api/leagues/:id ──────────────────────────────────────────────────

/**
 * Update league settings. Admin only.
 * Body: { name?, mediaTypeName?, mediaTypeEmoji?, revealMode?, submissionSources? }
 */
router.patch(
  '/:id',
  requireAuth,
  requireLeagueAdmin,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { name, mediaTypeName, mediaTypeEmoji, revealMode, submissionSources } =
        req.body as {
          name?: string;
          mediaTypeName?: string;
          mediaTypeEmoji?: string;
          revealMode?: string;
          submissionSources?: string[];
        };

      const updated = await updateLeague(id as string, {
        name,
        mediaTypeName,
        mediaTypeEmoji,
        revealMode,
        submissionSources,
      });

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

// ─── GET /api/leagues/:id/invite ─────────────────────────────────────────────

/**
 * Get the invite URL for a league. Admin only.
 */
router.get(
  '/:id/invite',
  requireAuth,
  requireLeagueAdmin,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const inviteUrl = await getInviteUrl(id as string);
      res.json({ inviteUrl });
    } catch (err) {
      if (err instanceof Error && 'status' in err) {
        handleServiceError(err, res);
      } else {
        next(err);
      }
    }
  }
);

// ─── GET /api/leagues/:id/members ────────────────────────────────────────────

/**
 * List members of a league. User must be a member.
 */
router.get(
  '/:id/members',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      const member = await isLeagueMember(id as string, req.user!.id);
      if (!member) {
        res.status(403).json({ error: 'Forbidden: you are not a member of this league' });
        return;
      }

      const members = await listMembers(id as string);
      res.json(members);
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /api/leagues/:id/members/:userId ─────────────────────────────────

/**
 * Remove a member from a league. Admin only.
 */
router.delete(
  '/:id/members/:userId',
  requireAuth,
  requireLeagueAdmin,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id, userId } = req.params;
      await removeMember(id as string, userId as string, req.user!.id);
      res.json({ message: 'Member removed' });
    } catch (err) {
      if (err instanceof Error && 'status' in err) {
        handleServiceError(err, res);
      } else {
        next(err);
      }
    }
  }
);

// ─── PUT /api/leagues/:id/members/:userId/admin ──────────────────────────────

/**
 * Grant admin role to a league member. Admin only.
 */
router.put(
  '/:id/members/:userId/admin',
  requireAuth,
  requireLeagueAdmin,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id, userId } = req.params;
      await grantAdmin(id as string, userId as string);
      res.json({ message: 'Admin role granted' });
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
