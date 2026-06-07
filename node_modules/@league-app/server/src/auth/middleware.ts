import { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { verify } from 'hono/jwt';
import { query } from '../db';

export interface AuthUser {
  id: string;
  displayName: string;
  email: string;
}

export type AppEnv = {
  Bindings: {
    // Static-assets binding (Workers Assets). Configured in wrangler.toml; used to
    // serve the built React SPA from the same origin as the API. Optional so the
    // app still runs in test/non-Worker contexts where no binding is present.
    ASSETS?: { fetch: (req: Request) => Promise<Response> };
  };
  Variables: {
    user?: AuthUser;
  };
};

/**
 * Middleware that parses the JWT session cookie and populates context 'user' variable.
 */
export async function authSessionMiddleware(c: Context, next: Next): Promise<void> {
  const token = getCookie(c, 'session');
  if (token) {
    try {
      const secret = process.env.SESSION_SECRET ?? 'dev-secret-change-me';
      const payload = await verify(token, secret, 'HS256') as unknown as AuthUser;
      if (payload && payload.id) {
        c.set('user', payload);
      }
    } catch (err) {
      // Invalid or expired token — ignore and let requireAuth handle blocking if needed
    }
  }
  await next();
}

/**
 * Middleware that requires an authenticated user.
 * Returns 401 JSON if context user is not set.
 */
export async function requireAuth(c: Context, next: Next): Promise<Response | void> {
  const user = c.get('user') as AuthUser | undefined;
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
}

/**
 * Middleware that requires the authenticated user to be a league admin.
 * Reads the league ID from the request params.
 * Returns 403 if the user is not an admin of the league.
 */
export async function requireLeagueAdmin(c: Context, next: Next): Promise<Response | void> {
  const leagueId = c.req.param('id') ?? c.req.param('leagueId');

  if (!leagueId) {
    return c.json({ error: 'League ID is required' }, 400);
  }

  const user = c.get('user') as AuthUser | undefined;
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const userId = user.id;

  try {
    const result = await query<{ role: string }>(
      `SELECT role FROM league_members WHERE league_id = $1 AND user_id = $2 AND role = 'admin'`,
      [leagueId, userId]
    );

    if (result.rows.length === 0) {
      return c.json({ error: 'Forbidden: admin role required' }, 403);
    }
    await next();
  } catch (err) {
    console.error('Error verifying league admin role:', err);
    return c.json({ error: 'Internal Server Error' }, 500);
  }
}
