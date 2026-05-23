"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLeague = createLeague;
exports.getLeague = getLeague;
exports.listUserLeagues = listUserLeagues;
exports.updateLeague = updateLeague;
exports.getInviteUrl = getInviteUrl;
exports.joinLeague = joinLeague;
exports.listMembers = listMembers;
exports.removeMember = removeMember;
exports.grantAdmin = grantAdmin;
exports.isLeagueMember = isLeagueMember;
const db_1 = require("../../db");
// ─── Helpers ────────────────────────────────────────────────────────────────
/**
 * Resolve the enabled submission sources for a league from the
 * league_submission_sources table.
 */
async function resolveSubmissionSources(leagueId) {
    const result = await (0, db_1.query)(`SELECT source FROM league_submission_sources WHERE league_id = $1 AND enabled = true`, [leagueId]);
    return result.rows.map((r) => r.source);
}
/**
 * Map a raw DB row to the shared League type.
 */
function rowToLeague(row) {
    return {
        id: row.id,
        name: row.name,
        mediaTypeName: row.media_type_name,
        mediaTypeEmoji: row.media_type_emoji,
        revealMode: row.reveal_mode,
    };
}
/**
 * Create a new league, insert both submission sources as enabled, and add the
 * creator as an admin member.
 */
async function createLeague(input) {
    const { name, mediaTypeName = 'Potpourri', mediaTypeEmoji = '🍲', revealMode = 'global', creatorId, } = input;
    // Validate revealMode
    if (!['global', 'per_player'].includes(revealMode)) {
        throw Object.assign(new Error('Invalid revealMode'), { status: 400 });
    }
    // Insert league
    const leagueResult = await (0, db_1.query)(`INSERT INTO leagues (name, media_type_name, media_type_emoji, reveal_mode)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, media_type_name, media_type_emoji, reveal_mode`, [name, mediaTypeName, mediaTypeEmoji, revealMode]);
    const leagueRow = leagueResult.rows[0];
    // Insert both sources as enabled
    await (0, db_1.query)(`INSERT INTO league_submission_sources (league_id, source, enabled) VALUES
     ($1, 'spotify', true),
     ($1, 'youtube', true)`, [leagueRow.id]);
    // Insert creator as admin
    await (0, db_1.query)(`INSERT INTO league_members (league_id, user_id, role) VALUES ($1, $2, 'admin')`, [leagueRow.id, creatorId]);
    const submissionSources = await resolveSubmissionSources(leagueRow.id);
    return {
        ...rowToLeague(leagueRow),
        submissionSources,
    };
}
/**
 * Get a single league by ID. Returns null if not found.
 */
async function getLeague(leagueId) {
    const result = await (0, db_1.query)(`SELECT id, name, media_type_name, media_type_emoji, reveal_mode
     FROM leagues WHERE id = $1`, [leagueId]);
    if (result.rows.length === 0)
        return null;
    const submissionSources = await resolveSubmissionSources(leagueId);
    return {
        ...rowToLeague(result.rows[0]),
        submissionSources,
    };
}
/**
 * List all leagues the given user is a member of.
 */
async function listUserLeagues(userId) {
    const result = await (0, db_1.query)(`SELECT l.id, l.name, l.media_type_name, l.media_type_emoji, l.reveal_mode
     FROM leagues l
     INNER JOIN league_members lm ON lm.league_id = l.id
     WHERE lm.user_id = $1
     ORDER BY l.created_at ASC`, [userId]);
    const leagues = [];
    for (const row of result.rows) {
        const submissionSources = await resolveSubmissionSources(row.id);
        leagues.push({ ...rowToLeague(row), submissionSources });
    }
    return leagues;
}
/**
 * Update league settings. Handles submission source updates with at-least-one
 * validation.
 */
async function updateLeague(leagueId, input) {
    const { name, mediaTypeName, mediaTypeEmoji, revealMode, submissionSources } = input;
    // Validate revealMode if provided
    if (revealMode !== undefined && !['global', 'per_player'].includes(revealMode)) {
        throw Object.assign(new Error('Invalid revealMode'), { status: 400 });
    }
    // Handle submission sources update (task 4.6)
    if (submissionSources !== undefined) {
        const validSources = ['spotify', 'youtube'];
        // Validate non-empty
        if (submissionSources.length === 0) {
            throw Object.assign(new Error('At least one submission source must remain enabled.'), { status: 422 });
        }
        // Validate all provided sources are valid
        for (const src of submissionSources) {
            if (!validSources.includes(src)) {
                throw Object.assign(new Error(`Invalid submission source: ${src}`), { status: 400 });
            }
        }
        // Update enabled/disabled for each known source
        for (const src of validSources) {
            const enabled = submissionSources.includes(src);
            await (0, db_1.query)(`INSERT INTO league_submission_sources (league_id, source, enabled)
         VALUES ($1, $2, $3)
         ON CONFLICT (league_id, source)
         DO UPDATE SET enabled = EXCLUDED.enabled`, [leagueId, src, enabled]);
        }
    }
    // Build dynamic SET clause for league fields
    const setClauses = [];
    const params = [];
    let paramIdx = 1;
    if (name !== undefined) {
        setClauses.push(`name = $${paramIdx++}`);
        params.push(name);
    }
    if (mediaTypeName !== undefined) {
        setClauses.push(`media_type_name = $${paramIdx++}`);
        params.push(mediaTypeName);
    }
    if (mediaTypeEmoji !== undefined) {
        setClauses.push(`media_type_emoji = $${paramIdx++}`);
        params.push(mediaTypeEmoji);
    }
    if (revealMode !== undefined) {
        setClauses.push(`reveal_mode = $${paramIdx++}`);
        params.push(revealMode);
    }
    if (setClauses.length > 0) {
        params.push(leagueId);
        await (0, db_1.query)(`UPDATE leagues SET ${setClauses.join(', ')} WHERE id = $${paramIdx}`, params);
    }
    const updated = await getLeague(leagueId);
    if (!updated) {
        throw Object.assign(new Error('League not found'), { status: 404 });
    }
    return updated;
}
/**
 * Get the invite URL for a league.
 */
async function getInviteUrl(leagueId) {
    const result = await (0, db_1.query)(`SELECT invite_token FROM leagues WHERE id = $1`, [leagueId]);
    if (result.rows.length === 0) {
        throw Object.assign(new Error('League not found'), { status: 404 });
    }
    const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:5173';
    return `${clientUrl}/join/${result.rows[0].invite_token}`;
}
/**
 * Join a league via invite token. Returns whether the user was already a member.
 */
async function joinLeague(token, userId) {
    // Look up league by token
    const leagueResult = await (0, db_1.query)(`SELECT id FROM leagues WHERE invite_token = $1`, [token]);
    if (leagueResult.rows.length === 0) {
        throw Object.assign(new Error('Invalid invite link'), { status: 404 });
    }
    const leagueId = leagueResult.rows[0].id;
    // Check if already a member
    const memberResult = await (0, db_1.query)(`SELECT user_id FROM league_members WHERE league_id = $1 AND user_id = $2`, [leagueId, userId]);
    if (memberResult.rows.length > 0) {
        return { alreadyMember: true, message: 'Already a member' };
    }
    // Insert as player
    await (0, db_1.query)(`INSERT INTO league_members (league_id, user_id, role) VALUES ($1, $2, 'player')`, [leagueId, userId]);
    return { alreadyMember: false, message: 'Joined successfully' };
}
/**
 * List all members of a league.
 */
async function listMembers(leagueId) {
    const result = await (0, db_1.query)(`SELECT lm.user_id, u.display_name, u.email, lm.role, lm.joined_at
     FROM league_members lm
     INNER JOIN users u ON u.id = lm.user_id
     WHERE lm.league_id = $1
     ORDER BY lm.joined_at ASC`, [leagueId]);
    return result.rows.map((r) => ({
        userId: r.user_id,
        displayName: r.display_name,
        email: r.email,
        role: r.role,
        joinedAt: r.joined_at,
    }));
}
/**
 * Remove a member from a league. Throws if trying to remove the last admin.
 */
async function removeMember(leagueId, targetUserId, requestingUserId) {
    // Check if target is an admin
    const targetResult = await (0, db_1.query)(`SELECT role FROM league_members WHERE league_id = $1 AND user_id = $2`, [leagueId, targetUserId]);
    if (targetResult.rows.length === 0) {
        throw Object.assign(new Error('Member not found'), { status: 404 });
    }
    const targetRole = targetResult.rows[0].role;
    // If removing yourself and you are an admin, check if you are the last admin
    if (targetUserId === requestingUserId && targetRole === 'admin') {
        const adminCountResult = await (0, db_1.query)(`SELECT COUNT(*) as count FROM league_members WHERE league_id = $1 AND role = 'admin'`, [leagueId]);
        const adminCount = parseInt(adminCountResult.rows[0].count, 10);
        if (adminCount <= 1) {
            throw Object.assign(new Error('Cannot remove yourself as the last admin'), { status: 400 });
        }
    }
    await (0, db_1.query)(`DELETE FROM league_members WHERE league_id = $1 AND user_id = $2`, [leagueId, targetUserId]);
}
/**
 * Grant admin role to a league member.
 */
async function grantAdmin(leagueId, targetUserId) {
    const result = await (0, db_1.query)(`UPDATE league_members SET role = 'admin' WHERE league_id = $1 AND user_id = $2`, [leagueId, targetUserId]);
    if (result.rowCount === 0) {
        throw Object.assign(new Error('Member not found'), { status: 404 });
    }
}
/**
 * Check whether a user is a member of a league.
 */
async function isLeagueMember(leagueId, userId) {
    const result = await (0, db_1.query)(`SELECT user_id FROM league_members WHERE league_id = $1 AND user_id = $2`, [leagueId, userId]);
    return result.rows.length > 0;
}
//# sourceMappingURL=service.js.map