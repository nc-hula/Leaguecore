"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const middleware_1 = require("../../auth/middleware");
const service_1 = require("./service");
const router = (0, express_1.Router)();
// ─── Helper ─────────────────────────────────────────────────────────────────
/** Forward service errors that carry a .status property to the client. */
function handleServiceError(err, res) {
    if (err instanceof Error && 'status' in err) {
        const status = err.status;
        res.status(status).json({ error: err.message });
        return;
    }
    throw err; // let Express error handler deal with unexpected errors
}
// ─── POST /api/leagues ───────────────────────────────────────────────────────
/**
 * Create a new league.
 * Body: { name, mediaTypeName?, mediaTypeEmoji?, revealMode? }
 */
router.post('/', middleware_1.requireAuth, async (req, res, next) => {
    try {
        const { name, mediaTypeName, mediaTypeEmoji, revealMode } = req.body;
        if (!name || typeof name !== 'string' || name.trim() === '') {
            res.status(400).json({ error: 'name is required' });
            return;
        }
        const league = await (0, service_1.createLeague)({
            name: name.trim(),
            mediaTypeName,
            mediaTypeEmoji,
            revealMode,
            creatorId: req.user.id,
        });
        res.status(201).json(league);
    }
    catch (err) {
        if (err instanceof Error && 'status' in err) {
            handleServiceError(err, res);
        }
        else {
            next(err);
        }
    }
});
// ─── POST /api/leagues/join/:token ───────────────────────────────────────────
/**
 * Join a league via invite token.
 * Must be defined before /:id routes to avoid token being matched as an id.
 */
router.post('/join/:token', middleware_1.requireAuth, async (req, res, next) => {
    try {
        const { token } = req.params;
        const result = await (0, service_1.joinLeague)(token, req.user.id);
        if (result.alreadyMember) {
            res.status(200).json({ message: result.message, alreadyMember: true });
        }
        else {
            res.status(201).json({ message: result.message });
        }
    }
    catch (err) {
        if (err instanceof Error && 'status' in err) {
            handleServiceError(err, res);
        }
        else {
            next(err);
        }
    }
});
// ─── GET /api/leagues ────────────────────────────────────────────────────────
/**
 * List all leagues the authenticated user is a member of.
 */
router.get('/', middleware_1.requireAuth, async (req, res, next) => {
    try {
        const leagues = await (0, service_1.listUserLeagues)(req.user.id);
        res.json(leagues);
    }
    catch (err) {
        next(err);
    }
});
// ─── GET /api/leagues/:id ────────────────────────────────────────────────────
/**
 * Get league details. User must be a member.
 */
router.get('/:id', middleware_1.requireAuth, async (req, res, next) => {
    try {
        const { id } = req.params;
        const member = await (0, service_1.isLeagueMember)(id, req.user.id);
        if (!member) {
            res.status(403).json({ error: 'Forbidden: you are not a member of this league' });
            return;
        }
        const league = await (0, service_1.getLeague)(id);
        if (!league) {
            res.status(404).json({ error: 'League not found' });
            return;
        }
        res.json(league);
    }
    catch (err) {
        next(err);
    }
});
// ─── PATCH /api/leagues/:id ──────────────────────────────────────────────────
/**
 * Update league settings. Admin only.
 * Body: { name?, mediaTypeName?, mediaTypeEmoji?, revealMode?, submissionSources? }
 */
router.patch('/:id', middleware_1.requireAuth, middleware_1.requireLeagueAdmin, async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, mediaTypeName, mediaTypeEmoji, revealMode, submissionSources } = req.body;
        const updated = await (0, service_1.updateLeague)(id, {
            name,
            mediaTypeName,
            mediaTypeEmoji,
            revealMode,
            submissionSources,
        });
        res.json(updated);
    }
    catch (err) {
        if (err instanceof Error && 'status' in err) {
            handleServiceError(err, res);
        }
        else {
            next(err);
        }
    }
});
// ─── GET /api/leagues/:id/invite ─────────────────────────────────────────────
/**
 * Get the invite URL for a league. Admin only.
 */
router.get('/:id/invite', middleware_1.requireAuth, middleware_1.requireLeagueAdmin, async (req, res, next) => {
    try {
        const { id } = req.params;
        const inviteUrl = await (0, service_1.getInviteUrl)(id);
        res.json({ inviteUrl });
    }
    catch (err) {
        if (err instanceof Error && 'status' in err) {
            handleServiceError(err, res);
        }
        else {
            next(err);
        }
    }
});
// ─── GET /api/leagues/:id/members ────────────────────────────────────────────
/**
 * List members of a league. User must be a member.
 */
router.get('/:id/members', middleware_1.requireAuth, async (req, res, next) => {
    try {
        const { id } = req.params;
        const member = await (0, service_1.isLeagueMember)(id, req.user.id);
        if (!member) {
            res.status(403).json({ error: 'Forbidden: you are not a member of this league' });
            return;
        }
        const members = await (0, service_1.listMembers)(id);
        res.json(members);
    }
    catch (err) {
        next(err);
    }
});
// ─── DELETE /api/leagues/:id/members/:userId ─────────────────────────────────
/**
 * Remove a member from a league. Admin only.
 */
router.delete('/:id/members/:userId', middleware_1.requireAuth, middleware_1.requireLeagueAdmin, async (req, res, next) => {
    try {
        const { id, userId } = req.params;
        await (0, service_1.removeMember)(id, userId, req.user.id);
        res.json({ message: 'Member removed' });
    }
    catch (err) {
        if (err instanceof Error && 'status' in err) {
            handleServiceError(err, res);
        }
        else {
            next(err);
        }
    }
});
// ─── PUT /api/leagues/:id/members/:userId/admin ──────────────────────────────
/**
 * Grant admin role to a league member. Admin only.
 */
router.put('/:id/members/:userId/admin', middleware_1.requireAuth, middleware_1.requireLeagueAdmin, async (req, res, next) => {
    try {
        const { id, userId } = req.params;
        await (0, service_1.grantAdmin)(id, userId);
        res.json({ message: 'Admin role granted' });
    }
    catch (err) {
        if (err instanceof Error && 'status' in err) {
            handleServiceError(err, res);
        }
        else {
            next(err);
        }
    }
});
exports.default = router;
//# sourceMappingURL=router.js.map