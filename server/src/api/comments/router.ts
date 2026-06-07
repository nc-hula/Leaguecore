import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../auth/middleware';
import { postComment, listComments } from './service';

// mergeParams: true so that :roundId and :entryId from parent routers are accessible.
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

// ─── POST /api/rounds/:roundId/entries/:entryId/comments ─────────────────────

/**
 * Post a comment on an entry.
 * Body: { body: string }
 *
 * Requires authentication.
 * Access control:
 *   - Bonus tracks: allowed if round phase != 'submission'
 *   - Regular entries: allowed if submitter identity has been revealed to commenter
 */
router.post(
  '/',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { roundId, entryId } = req.params;
      const userId = req.user!.id;

      const { body } = req.body as { body?: unknown };

      if (typeof body !== 'string' || body.trim() === '') {
        res.status(400).json({ error: 'body is required and must be a non-empty string' });
        return;
      }

      const comment = await postComment({
        entryId: entryId as string,
        roundId: roundId as string,
        authorId: userId,
        body: body.trim(),
      });

      res.status(201).json(comment);
    } catch (err) {
      if (err instanceof Error && 'status' in err) {
        handleServiceError(err, res);
      } else {
        next(err);
      }
    }
  }
);

// ─── GET /api/rounds/:roundId/entries/:entryId/comments ──────────────────────

/**
 * Get all comments for an entry in chronological order.
 *
 * Requires authentication and league membership.
 * Returns an array of comments ordered by created_at ASC.
 */
router.get(
  '/',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { roundId, entryId } = req.params;
      const userId = req.user!.id;

      const comments = await listComments(
        entryId as string,
        roundId as string,
        userId
      );

      res.json(comments);
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
