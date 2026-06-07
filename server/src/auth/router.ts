import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import { sign } from 'hono/jwt';
import { query } from '../db';
import { AuthUser, AppEnv } from './middleware';

const router = new Hono<AppEnv>();

const CLIENT_URL = process.env.CLIENT_URL ?? 'http://localhost:5173';

/**
 * GET /auth/google
 * Initiates Google OAuth redirect.
 */
router.get('/google', (c) => {
  const googleClientId = process.env.GOOGLE_CLIENT_ID ?? '';
  const origin = new URL(c.req.url).origin;
  const redirectUri = `${origin}/auth/google/callback`;
  
  const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` + 
    new URLSearchParams({
      client_id: googleClientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid profile email',
      prompt: 'select_account'
    }).toString();

  return c.redirect(googleAuthUrl);
});

/**
 * GET /auth/google/callback
 * OAuth callback — exchanges code for user profile, upserts user, and establishes JWT cookie session.
 */
router.get('/google/callback', async (c) => {
  const code = c.req.query('code');
  if (!code) {
    return c.redirect(`${CLIENT_URL}?error=auth_failed`);
  }

  try {
    const googleClientId = process.env.GOOGLE_CLIENT_ID ?? '';
    const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET ?? '';
    const origin = new URL(c.req.url).origin;
    const redirectUri = `${origin}/auth/google/callback`;

    // 1. Exchange auth code for access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: googleClientId,
        client_secret: googleClientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      console.error('Failed to exchange auth code:', errText);
      return c.redirect(`${CLIENT_URL}?error=auth_failed`);
    }

    const { access_token } = await tokenResponse.json() as { access_token: string };

    // 2. Fetch user profile from Google
    const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });

    if (!profileResponse.ok) {
      console.error('Failed to fetch user profile');
      return c.redirect(`${CLIENT_URL}?error=auth_failed`);
    }

    const profile = await profileResponse.json() as {
      sub: string;
      name?: string;
      email?: string;
    };

    const googleId = profile.sub;
    const displayName = profile.name ?? '';
    const email = profile.email ?? '';

    // 3. Upsert user in database
    const dbResult = await query<{
      id: string;
      google_id: string;
      display_name: string;
      email: string;
    }>(
      `INSERT INTO users (google_id, display_name, email)
       VALUES ($1, $2, $3)
       ON CONFLICT (google_id)
       DO UPDATE SET display_name = EXCLUDED.display_name, email = EXCLUDED.email
       RETURNING id, google_id, display_name, email`,
      [googleId, displayName, email]
    );

    const user = dbResult.rows[0];

    // 4. Generate JWT session token
    const secret = process.env.SESSION_SECRET ?? 'dev-secret-change-me';
    const jwtPayload = {
      id: user.id,
      displayName: user.display_name,
      email: user.email,
      exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days expiration
    };

    const token = await sign(jwtPayload as any, secret);

    // 5. Set HTTP-only session cookie
    setCookie(c, 'session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
    });

    return c.redirect(CLIENT_URL);
  } catch (err) {
    console.error('OAuth callback error:', err);
    return c.redirect(`${CLIENT_URL}?error=auth_failed`);
  }
});

/**
 * POST /auth/logout
 * Clears the session cookie and returns 200.
 */
router.post('/logout', (c) => {
  deleteCookie(c, 'session', {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
  });
  return c.json({ message: 'Logged out' }, 200);
});

/**
 * GET /auth/me
 * Returns the current authenticated user or 401.
 */
router.get('/me', (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  return c.json({
    id: user.id,
    displayName: user.displayName,
    email: user.email,
  });
});

/**
 * GET /auth/error
 * Redirects to client with auth_failed error param.
 */
router.get('/error', (c) => {
  return c.redirect(`${CLIENT_URL}?error=auth_failed`);
});

export default router;
