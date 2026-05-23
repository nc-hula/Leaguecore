"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const passport_1 = __importDefault(require("./passport"));
const router = (0, express_1.Router)();
const CLIENT_URL = process.env.CLIENT_URL ?? 'http://localhost:5173';
/**
 * GET /auth/google
 * Initiates Google OAuth redirect.
 */
router.get('/google', passport_1.default.authenticate('google', { scope: ['profile', 'email'] }));
/**
 * GET /auth/google/callback
 * OAuth callback — on success redirect to client, on failure redirect with error.
 */
router.get('/google/callback', passport_1.default.authenticate('google', { failureRedirect: '/auth/error' }), (_req, res) => {
    res.redirect(CLIENT_URL);
});
/**
 * POST /auth/logout
 * Destroys the session and returns 200.
 */
router.post('/logout', (req, res) => {
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
router.get('/me', (req, res) => {
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
router.get('/error', (_req, res) => {
    res.redirect(`${CLIENT_URL}?error=auth_failed`);
});
exports.default = router;
//# sourceMappingURL=router.js.map