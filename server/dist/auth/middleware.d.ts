import { Request, Response, NextFunction } from 'express';
/**
 * Middleware that requires an authenticated user.
 * Returns 401 JSON if req.user is not set.
 */
export declare function requireAuth(req: Request, res: Response, next: NextFunction): void;
/**
 * Middleware that requires the authenticated user to be a league admin.
 * Reads the league ID from req.params.id or req.params.leagueId.
 * Returns 403 if the user is not an admin of the league.
 */
export declare function requireLeagueAdmin(req: Request, res: Response, next: NextFunction): void;
