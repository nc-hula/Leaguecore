import { Hono, Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { requireAuth, AuthUser, AppEnv } from '../../auth/middleware';
import { isLeagueMember } from '../leagues/service';
import { submitEntry, listEntries } from './service';
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

// ─── POST /api/rounds/:roundId/entries ───────────────────────────────────────

/**
 * Submit an entry to a round.
 * Body: { url: string, contextComment?: string, threadStarterComment?: string }
 */
router.post('/', requireAuth, async (c) => {
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
      url?: string;
      contextComment?: string;
      threadStarterComment?: string;
    };

    const { url, contextComment, threadStarterComment } = body;

    if (!url || typeof url !== 'string' || url.trim() === '') {
      return c.json({ error: 'url is required' }, 400);
    }

    const entry = await submitEntry({
      roundId,
      submitterId: userId,
      url: url.trim(),
      contextComment,
      threadStarterComment,
    });

    return c.json(entry, 201);
  } catch (err) {
    if (err instanceof Error && 'status' in err) {
      return handleServiceError(err, c);
    }
    throw err;
  }
});

// ─── GET /api/rounds/:roundId/entries ────────────────────────────────────────

/**
 * List all entries for a round.
 * Identity (submitterDisplayName, threadStarterComment) is conditionally included
 * based on the league's reveal mode and the viewer's reveal state.
 */
router.get('/', requireAuth, async (c) => {
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

    const entries = await listEntries(roundId, userId);
    return c.json(entries, 200);
  } catch (err) {
    if (err instanceof Error && 'status' in err) {
      return handleServiceError(err, c);
    }
    throw err;
  }
});

export default router;
