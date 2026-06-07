import { Hono, Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { requireAuth, AuthUser, AppEnv } from '../../auth/middleware';
import { isLeagueMember } from '../leagues/service';
import { submitBallot, getBallot } from './service';
import { query } from '../../db';

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
router.put('/', requireAuth, async (c) => {
  try {
    const roundId = c.req.param('roundId')!;
    const user = c.get('user') as AuthUser;
    const userId = user.id;

    // Verify user is a league member
    const leagueId = await getLeagueIdForRound(roundId);
    if (leagueId === null) {
      return c.json({ error: 'Round not found' }, 404);
    }

    const member = await isLeagueMember(leagueId, userId);
    if (!member) {
      return c.json({ error: 'Forbidden: you are not a member of this league' }, 403);
    }

    const body = await c.req.json().catch(() => ({})) as {
      items?: Array<{ entryId?: string; rankPosition?: number }>;
    };

    const items = body.items;

    if (!Array.isArray(items)) {
      return c.json({ error: 'items must be an array' }, 400);
    }

    // Validate each item has required fields
    for (const item of items) {
      if (typeof item.entryId !== 'string' || item.entryId.trim() === '') {
        return c.json({ error: 'Each item must have a valid entryId' }, 400);
      }
      if (typeof item.rankPosition !== 'number' || item.rankPosition < 0) {
        return c.json({ error: 'Each item must have a non-negative rankPosition' }, 400);
      }
    }

    const ballot = await submitBallot({
      roundId,
      voterId: userId,
      items: items as Array<{ entryId: string; rankPosition: number }>,
    });

    return c.json(ballot, 201);
  } catch (err) {
    if (err instanceof Error && 'status' in err) {
      return handleServiceError(err, c);
    }
    throw err;
  }
});

// ─── GET /api/rounds/:roundId/ballot ─────────────────────────────────────────

/**
 * Get the authenticated player's current ballot for a round.
 * Returns 404 if no ballot has been submitted yet.
 *
 * Requires authentication.
 */
router.get('/', requireAuth, async (c) => {
  try {
    const roundId = c.req.param('roundId')!;
    const user = c.get('user') as AuthUser;
    const userId = user.id;

    const ballot = await getBallot(roundId, userId);

    if (ballot === null) {
      return c.json({ error: 'No ballot found for this round' }, 404);
    }

    return c.json(ballot, 200);
  } catch (err) {
    throw err;
  }
});

export default router;
