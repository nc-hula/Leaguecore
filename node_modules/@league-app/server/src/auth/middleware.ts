import { Request, Response, NextFunction } from 'express';
import { query } from '../db';

/**
 * Middleware that requires an authenticated user.
 * Returns 401 JSON if req.user is not set.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

/**
 * Middleware that requires the authenticated user to be a league admin.
 * Reads the league ID from req.params.id or req.params.leagueId.
 * Returns 403 if the user is not an admin of the league.
 */
export function requireLeagueAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const leagueId = req.params.id ?? req.params.leagueId;

  if (!leagueId) {
    res.status(400).json({ error: 'League ID is required' });
    return;
  }

  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const userId = req.user.id;

  query<{ role: string }>(
    `SELECT role FROM league_members WHERE league_id = $1 AND user_id = $2 AND role = 'admin'`,
    [leagueId, userId]
  )
    .then((result) => {
      if (result.rows.length === 0) {
        res.status(403).json({ error: 'Forbidden: admin role required' });
        return;
      }
      next();
    })
    .catch((err: unknown) => next(err));
}
