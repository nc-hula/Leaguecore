import { Router, Request, Response } from 'express';
import passport from './passport';

const router = Router();

const CLIENT_URL = process.env.CLIENT_URL ?? 'http://localhost:5173';

/**
 * GET /auth/google
 * Initiates Google OAuth redirect.
 */
router.get(
  '/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

/**
 * GET /auth/google/callback
 * OAuth callback — on success redirect to client, on failure redirect with error.
 */
router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: '/auth/error' }),
  (_req: Request, res: Response) => {
    res.redirect(CLIENT_URL);
  }
);

/**
 * POST /auth/logout
 * Destroys the session and returns 200.
 */
router.post('/logout', (req: Request, res: Response) => {
  req.logout((err) => {
    if (err) {
      res.status(500).json({ error: 'Logout failed' });
      return;
    }
    req.session.destroy(() => {
      res.status(200).json({ message: 'Logged out' });
    });
  });
});

/**
 * GET /auth/me
 * Returns the current authenticated user or 401.
 */
router.get('/me', (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const { id, displayName, email } = req.user;
  res.json({ id, displayName, email });
});

/**
 * GET /auth/error
 * Redirects to client with auth_failed error param.
 */
router.get('/error', (_req: Request, res: Response) => {
  res.redirect(`${CLIENT_URL}?error=auth_failed`);
});

export default router;
