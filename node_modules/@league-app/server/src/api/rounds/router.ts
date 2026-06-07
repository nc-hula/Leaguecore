import { Hono, Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { requireAuth, requireLeagueAdmin, AuthUser, AppEnv } from '../../auth/middleware';
import { isLeagueMember } from '../leagues/service';
import {
  createRound,
  getRound,
  listRounds,
  advanceRoundPhase,
  getRoundResults,
  updateRound,
} from './service';

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

// ─── POST /api/leagues/:leagueId/rounds ──────────────────────────────────────

/**
 * Create a new round. Admin only.
 * Required body: { theme, description, requiredEntryCount }
 * Optional body: { deadlineMode, bonusTracksAllowed, overrideMediaTypeName,
 *                  overrideMediaTypeEmoji, overrideSubmissionSources, weight,
 *                  submissionDays, votingDays }
 */
router.post('/', requireAuth, requireLeagueAdmin, async (c) => {
  try {
    const leagueId = c.req.param('leagueId')!;
    const body = await c.req.json().catch(() => ({})) as {
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
    } = body;

    // Validate required fields
    if (!theme || typeof theme !== 'string' || theme.trim() === '') {
      return c.json({ error: 'theme is required' }, 400);
    }
    if (!description || typeof description !== 'string' || description.trim() === '') {
      return c.json({ error: 'description is required' }, 400);
    }
    if (requiredEntryCount == null || typeof requiredEntryCount !== 'number' || requiredEntryCount < 1) {
      return c.json({ error: 'requiredEntryCount must be a positive integer' }, 400);
    }

    // Validate deadlineMode if provided
    if (deadlineMode !== undefined && !['rigid', 'flexible'].includes(deadlineMode)) {
      return c.json({ error: "deadlineMode must be 'rigid' or 'flexible'" }, 400);
    }

    const round = await createRound({
      leagueId,
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

    return c.json(round, 201);
  } catch (err) {
    if (err instanceof Error && 'status' in err) {
      return handleServiceError(err, c);
    }
    throw err;
  }
});

// ─── GET /api/leagues/:leagueId/rounds ───────────────────────────────────────

/**
 * List all rounds for a league. Member only.
 */
router.get('/', requireAuth, async (c) => {
  try {
    const leagueId = c.req.param('leagueId')!;
    const user = c.get('user') as AuthUser;

    const member = await isLeagueMember(leagueId, user.id);
    if (!member) {
      return c.json({ error: 'Forbidden: you are not a member of this league' }, 403);
    }

    const rounds = await listRounds(leagueId);
    return c.json(rounds, 200);
  } catch (err) {
    throw err;
  }
});

// ─── GET /api/leagues/:leagueId/rounds/:id ───────────────────────────────────

/**
 * Get a single round with resolved effective media type and submission sources.
 * Member only.
 */
router.get('/:id', requireAuth, async (c) => {
  try {
    const leagueId = c.req.param('leagueId')!;
    const id = c.req.param('id')!;
    const user = c.get('user') as AuthUser;

    const member = await isLeagueMember(leagueId, user.id);
    if (!member) {
      return c.json({ error: 'Forbidden: you are not a member of this league' }, 403);
    }

    const round = await getRound(id, leagueId);
    if (!round) {
      return c.json({ error: 'Round not found' }, 404);
    }

    return c.json(round, 200);
  } catch (err) {
    throw err;
  }
});

// ─── PATCH /api/leagues/:leagueId/rounds/:id ─────────────────────────────────

/**
 * Update round settings before it closes. Admin only.
 * Body: { theme?, description?, overrideMediaTypeName?, overrideMediaTypeEmoji?,
 *         overrideSubmissionSources?, weight? }
 */
router.patch('/:id', requireAuth, requireLeagueAdmin, async (c) => {
  try {
    const leagueId = c.req.param('leagueId')!;
    const id = c.req.param('id')!;

    const round = await getRound(id, leagueId);
    if (!round) {
      return c.json({ error: 'Round not found' }, 404);
    }
    if (round.phase === 'closed') {
      return c.json({ error: 'Cannot edit a closed round.' }, 409);
    }

    const body = await c.req.json().catch(() => ({})) as {
      theme?: string;
      description?: string;
      overrideMediaTypeName?: string;
      overrideMediaTypeEmoji?: string;
      overrideSubmissionSources?: string[];
      weight?: number;
    };

    const {
      theme,
      description,
      overrideMediaTypeName,
      overrideMediaTypeEmoji,
      overrideSubmissionSources,
      weight,
    } = body;

    const updated = await updateRound(id, leagueId, {
      theme,
      description,
      overrideMediaTypeName,
      overrideMediaTypeEmoji,
      overrideSubmissionSources,
      weight,
    });

    return c.json(updated, 200);
  } catch (err) {
    if (err instanceof Error && 'status' in err) {
      return handleServiceError(err, c);
    }
    throw err;
  }
});

// ─── POST /api/leagues/:leagueId/rounds/:id/advance ──────────────────────────

/**
 * Advance the round phase: submission → voting → closed. Admin only.
 */
router.post('/:id/advance', requireAuth, requireLeagueAdmin, async (c) => {
  try {
    const leagueId = c.req.param('leagueId')!;
    const id = c.req.param('id')!;

    const updated = await advanceRoundPhase(id, leagueId);
    return c.json(updated, 200);
  } catch (err) {
    if (err instanceof Error && 'status' in err) {
      return handleServiceError(err, c);
    }
    throw err;
  }
});

// ─── GET /api/leagues/:leagueId/rounds/:id/results ───────────────────────────

/**
 * Get per-round results. Round must be closed. Member only.
 */
router.get('/:id/results', requireAuth, async (c) => {
  try {
    const leagueId = c.req.param('leagueId')!;
    const id = c.req.param('id')!;
    const user = c.get('user') as AuthUser;

    const member = await isLeagueMember(leagueId, user.id);
    if (!member) {
      return c.json({ error: 'Forbidden: you are not a member of this league' }, 403);
    }

    const round = await getRound(id, leagueId);
    if (!round) {
      return c.json({ error: 'Round not found' }, 404);
    }

    if (round.phase !== 'closed') {
      return c.json({ error: 'Results are only available after voting is complete.' }, 403);
    }

    const results = await getRoundResults(id);
    return c.json(results, 200);
  } catch (err) {
    throw err;
  }
});

export default router;
