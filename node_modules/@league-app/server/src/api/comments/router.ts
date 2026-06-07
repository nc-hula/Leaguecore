import { Hono, Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { requireAuth, AuthUser, AppEnv } from '../../auth/middleware';
import { postComment, listComments } from './service';

const router = new Hono<AppEnv>();

// ─── Helper ──────────────────────────────────────────────────────────────────

/** Forward service errors that carry a .status property to the client. */
function handleServiceError(err: unknown, c: Context): Response {
  if (err instanceof Error && 'status' in err) {
    const status = (err as Error & { status: number }).status;
    return c.json({ error: err.message }, status as ContentfulStatusCode);
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
router.post('/', requireAuth, async (c) => {
  try {
    const roundId = c.req.param('roundId')!;
    const entryId = c.req.param('entryId')!;
    const user = c.get('user') as AuthUser;
    const userId = user.id;

    const bodyObj = await c.req.json().catch(() => ({})) as { body?: unknown };
    const body = bodyObj.body;

    if (typeof body !== 'string' || body.trim() === '') {
      return c.json({ error: 'body is required and must be a non-empty string' }, 400);
    }

    const comment = await postComment({
      entryId,
      roundId,
      authorId: userId,
      body: body.trim(),
    });

    return c.json(comment, 201);
  } catch (err) {
    if (err instanceof Error && 'status' in err) {
      return handleServiceError(err, c);
    }
    throw err;
  }
});

// ─── GET /api/rounds/:roundId/entries/:entryId/comments ──────────────────────

/**
 * Get all comments for an entry in chronological order.
 *
 * Requires authentication and league membership.
 * Returns an array of comments ordered by created_at ASC.
 */
router.get('/', requireAuth, async (c) => {
  try {
    const roundId = c.req.param('roundId')!;
    const entryId = c.req.param('entryId')!;
    const user = c.get('user') as AuthUser;
    const userId = user.id;

    const comments = await listComments(
      entryId,
      roundId,
      userId
    );

    return c.json(comments, 200);
  } catch (err) {
    if (err instanceof Error && 'status' in err) {
      return handleServiceError(err, c);
    }
    throw err;
  }
});

export default router;
