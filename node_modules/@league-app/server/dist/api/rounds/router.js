"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const middleware_1 = require("../../auth/middleware");
const service_1 = require("../leagues/service");
const service_2 = require("./service");
// mergeParams: true is required so that :leagueId from the parent router
// is accessible in this sub-router's req.params
const router = (0, express_1.Router)({ mergeParams: true });
// ─── Helper ──────────────────────────────────────────────────────────────────
/** Forward service errors that carry a .status property to the client. */
function handleServiceError(err, res) {
    if (err instanceof Error && 'status' in err) {
        const status = err.status;
        res.status(status).json({ error: err.message });
        return;
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
router.post('/', middleware_1.requireAuth, middleware_1.requireLeagueAdmin, async (req, res, next) => {
    try {
        const { leagueId } = req.params;
        const { theme, description, requiredEntryCount, deadlineMode, bonusTracksAllowed, overrideMediaTypeName, overrideMediaTypeEmoji, overrideSubmissionSources, weight, submissionDays, votingDays, } = req.body;
        // Validate required fields
        if (!theme || typeof theme !== 'string' || theme.trim() === '') {
            res.status(400).json({ error: 'theme is required' });
            return;
        }
        if (!description || typeof description !== 'string' || description.trim() === '') {
            res.status(400).json({ error: 'description is required' });
            return;
        }
        if (requiredEntryCount == null || typeof requiredEntryCount !== 'number' || requiredEntryCount < 1) {
            res.status(400).json({ error: 'requiredEntryCount must be a positive integer' });
            return;
        }
        // Validate deadlineMode if provided
        if (deadlineMode !== undefined && !['rigid', 'flexible'].includes(deadlineMode)) {
            res.status(400).json({ error: "deadlineMode must be 'rigid' or 'flexible'" });
            return;
        }
        const round = await (0, service_2.createRound)({
            leagueId: leagueId,
            theme: theme.trim(),
            description: description.trim(),
            requiredEntryCount,
            deadlineMode: deadlineMode,
            bonusTracksAllowed,
            overrideMediaTypeName,
            overrideMediaTypeEmoji,
            overrideSubmissionSources,
            weight,
            submissionDays,
            votingDays,
        });
        res.status(201).json(round);
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
// ─── GET /api/leagues/:leagueId/rounds ───────────────────────────────────────
/**
 * List all rounds for a league. Member only.
 */
router.get('/', middleware_1.requireAuth, async (req, res, next) => {
    try {
        const { leagueId } = req.params;
        const member = await (0, service_1.isLeagueMember)(leagueId, req.user.id);
        if (!member) {
            res.status(403).json({ error: 'Forbidden: you are not a member of this league' });
            return;
        }
        const rounds = await (0, service_2.listRounds)(leagueId);
        res.json(rounds);
    }
    catch (err) {
        next(err);
    }
});
// ─── GET /api/leagues/:leagueId/rounds/:id ───────────────────────────────────
/**
 * Get a single round with resolved effective media type and submission sources.
 * Member only.
 */
router.get('/:id', middleware_1.requireAuth, async (req, res, next) => {
    try {
        const { leagueId, id } = req.params;
        const member = await (0, service_1.isLeagueMember)(leagueId, req.user.id);
        if (!member) {
            res.status(403).json({ error: 'Forbidden: you are not a member of this league' });
            return;
        }
        const round = await (0, service_2.getRound)(id, leagueId);
        if (!round) {
            res.status(404).json({ error: 'Round not found' });
            return;
        }
        res.json(round);
    }
    catch (err) {
        next(err);
    }
});
// ─── POST /api/leagues/:leagueId/rounds/:id/advance ──────────────────────────
/**
 * Advance the round phase: submission → voting → closed. Admin only.
 */
router.post('/:id/advance', middleware_1.requireAuth, middleware_1.requireLeagueAdmin, async (req, res, next) => {
    try {
        const { leagueId, id } = req.params;
        const updated = await (0, service_2.advanceRoundPhase)(id, leagueId);
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
exports.default = router;
//# sourceMappingURL=router.js.map