import { Hono, Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { requireAuth, requireLeagueAdmin, AuthUser, AppEnv } from '../../auth/middleware';
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
  getLeagueStandings,
} from './service';

const router = new Hono<AppEnv>();

// ─── Helper ─────────────────────────────────────────────────────────────────

/** Forward service errors that carry a .status property to the client. */
function handleServiceError(err: unknown, c: Context): Response {
  if (err instanceof Error && 'status' in err) {
    const status = (err as Error & { status: number }).status;
    return c.json({ error: err.message }, status as ContentfulStatusCode);
  }
  throw err; // let global error handler deal with unexpected errors
}

// ─── POST /api/leagues ───────────────────────────────────────────────────────

/**
 * Create a new league.
 * Body: { name, mediaTypeName?, mediaTypeEmoji?, revealMode? }
 */
router.post('/', requireAuth, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({})) as {
      name?: string;
      mediaTypeName?: string;
      mediaTypeEmoji?: string;
      revealMode?: string;
    };

    const name = body.name;
    const { mediaTypeName, mediaTypeEmoji, revealMode } = body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return c.json({ error: 'name is required' }, 400);
    }

    const user = c.get('user') as AuthUser;
    const league = await createLeague({
      name: name.trim(),
      mediaTypeName,
      mediaTypeEmoji,
      revealMode,
      creatorId: user.id,
    });

    return c.json(league, 201);
  } catch (err) {
    if (err instanceof Error && 'status' in err) {
      return handleServiceError(err, c);
    }
    throw err;
  }
});

// ─── POST /api/leagues/join/:token ───────────────────────────────────────────

/**
 * Join a league via invite token.
 * Must be defined before /:id routes to avoid token being matched as an id.
 */
router.post('/join/:token', requireAuth, async (c) => {
  try {
    const token = c.req.param('token')!;
    const user = c.get('user') as AuthUser;
    const result = await joinLeague(token, user.id);

    if (result.alreadyMember) {
      return c.json({ message: result.message, alreadyMember: true }, 200);
    } else {
      return c.json({ message: result.message }, 201);
    }
  } catch (err) {
    if (err instanceof Error && 'status' in err) {
      return handleServiceError(err, c);
    }
    throw err;
  }
});

// ─── GET /api/leagues ────────────────────────────────────────────────────────

/**
 * List all leagues the authenticated user is a member of.
 */
router.get('/', requireAuth, async (c) => {
  try {
    const user = c.get('user') as AuthUser;
    const leagues = await listUserLeagues(user.id);
    return c.json(leagues, 200);
  } catch (err) {
    throw err;
  }
});

// ─── GET /api/leagues/:id ────────────────────────────────────────────────────

/**
 * Get league details. User must be a member.
 */
router.get('/:id', requireAuth, async (c) => {
  try {
    const id = c.req.param('id')!;
    const user = c.get('user') as AuthUser;

    const member = await isLeagueMember(id, user.id);
    if (!member) {
      return c.json({ error: 'Forbidden: you are not a member of this league' }, 403);
    }

    const league = await getLeague(id);
    if (!league) {
      return c.json({ error: 'League not found' }, 404);
    }

    return c.json(league, 200);
  } catch (err) {
    throw err;
  }
});

// ─── PATCH /api/leagues/:id ──────────────────────────────────────────────────

/**
 * Update league settings. Admin only.
 * Body: { name?, mediaTypeName?, mediaTypeEmoji?, revealMode?, submissionSources? }
 */
router.patch('/:id', requireAuth, requireLeagueAdmin, async (c) => {
  try {
    const id = c.req.param('id')!;
    const body = await c.req.json().catch(() => ({})) as {
      name?: string;
      mediaTypeName?: string;
      mediaTypeEmoji?: string;
      revealMode?: string;
      submissionSources?: string[];
    };

    const { name, mediaTypeName, mediaTypeEmoji, revealMode, submissionSources } = body;

    const updated = await updateLeague(id, {
      name,
      mediaTypeName,
      mediaTypeEmoji,
      revealMode,
      submissionSources,
    });

    return c.json(updated, 200);
  } catch (err) {
    if (err instanceof Error && 'status' in err) {
      return handleServiceError(err, c);
    }
    throw err;
  }
});

// ─── GET /api/leagues/:id/invite ─────────────────────────────────────────────

/**
 * Get the invite URL for a league. Admin only.
 */
router.get('/:id/invite', requireAuth, requireLeagueAdmin, async (c) => {
  try {
    const id = c.req.param('id')!;
    const inviteUrl = await getInviteUrl(id);
    return c.json({ inviteUrl }, 200);
  } catch (err) {
    if (err instanceof Error && 'status' in err) {
      return handleServiceError(err, c);
    }
    throw err;
  }
});

// ─── GET /api/leagues/:id/members ────────────────────────────────────────────

/**
 * List members of a league. User must be a member.
 */
router.get('/:id/members', requireAuth, async (c) => {
  try {
    const id = c.req.param('id')!;
    const user = c.get('user') as AuthUser;

    const member = await isLeagueMember(id, user.id);
    if (!member) {
      return c.json({ error: 'Forbidden: you are not a member of this league' }, 403);
    }

    const members = await listMembers(id);
    return c.json(members, 200);
  } catch (err) {
    throw err;
  }
});

// ─── DELETE /api/leagues/:id/members/:userId ─────────────────────────────────

/**
 * Remove a member from a league. Admin only.
 */
router.delete('/:id/members/:userId', requireAuth, requireLeagueAdmin, async (c) => {
  try {
    const id = c.req.param('id')!;
    const userId = c.req.param('userId')!;
    const user = c.get('user') as AuthUser;

    await removeMember(id, userId, user.id);
    return c.json({ message: 'Member removed' }, 200);
  } catch (err) {
    if (err instanceof Error && 'status' in err) {
      return handleServiceError(err, c);
    }
    throw err;
  }
});

// ─── PUT /api/leagues/:id/members/:userId/admin ──────────────────────────────

/**
 * Grant admin role to a league member. Admin only.
 */
router.put('/:id/members/:userId/admin', requireAuth, requireLeagueAdmin, async (c) => {
  try {
    const id = c.req.param('id')!;
    const userId = c.req.param('userId')!;

    await grantAdmin(id, userId);
    return c.json({ message: 'Admin role granted' }, 200);
  } catch (err) {
    if (err instanceof Error && 'status' in err) {
      return handleServiceError(err, c);
    }
    throw err;
  }
});

// ─── GET /api/leagues/:id/standings ──────────────────────────────────────────

/**
 * Get cumulative league standings. Member only.
 */
router.get('/:id/standings', requireAuth, async (c) => {
  try {
    const id = c.req.param('id')!;
    const user = c.get('user') as AuthUser;

    const member = await isLeagueMember(id, user.id);
    if (!member) {
      return c.json({ error: 'Forbidden: you are not a member of this league' }, 403);
    }

    const standings = await getLeagueStandings(id);
    return c.json(standings, 200);
  } catch (err) {
    throw err;
  }
});

export default router;
