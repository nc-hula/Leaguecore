"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRound = createRound;
exports.getRound = getRound;
exports.listRounds = listRounds;
exports.advanceRoundPhase = advanceRoundPhase;
exports.closeRound = closeRound;
exports.checkFlexibleAdvancement = checkFlexibleAdvancement;
const db_1 = require("../../db");
// ─── Helpers ─────────────────────────────────────────────────────────────────
/**
 * Resolve the effective submission sources for a round.
 * Uses per-round overrides if any exist, otherwise falls back to league sources.
 */
async function resolveSubmissionSources(roundId, leagueId) {
    // Check for per-round overrides
    const overrideResult = await (0, db_1.query)(`SELECT source, enabled FROM round_submission_source_overrides WHERE round_id = $1`, [roundId]);
    if (overrideResult.rows.length > 0) {
        return overrideResult.rows
            .filter((r) => r.enabled)
            .map((r) => r.source);
    }
    // Fall back to league sources
    const leagueResult = await (0, db_1.query)(`SELECT source FROM league_submission_sources WHERE league_id = $1 AND enabled = true`, [leagueId]);
    return leagueResult.rows.map((r) => r.source);
}
/**
 * Map a raw DB row (with joined league defaults) to a RoundResponse.
 */
async function rowToRoundResponse(row) {
    const submissionSources = await resolveSubmissionSources(row.id, row.league_id);
    const response = {
        id: row.id,
        leagueId: row.league_id,
        theme: row.theme,
        description: row.description,
        requiredEntryCount: row.required_entry_count,
        bonusTracksAllowed: row.bonus_tracks_allowed,
        deadlineMode: row.deadline_mode,
        phase: row.phase,
        mediaTypeName: row.override_media_type_name ?? row.league_media_type_name,
        mediaTypeEmoji: row.override_media_type_emoji ?? row.league_media_type_emoji,
        submissionSources,
        weight: parseFloat(row.weight),
    };
    if (row.submission_deadline) {
        response.submissionDeadline = row.submission_deadline;
    }
    if (row.voting_deadline) {
        response.votingDeadline = row.voting_deadline;
    }
    return response;
}
// SQL fragment to join league defaults onto a round row
const ROUND_SELECT = `
  SELECT
    r.id,
    r.league_id,
    r.theme,
    r.description,
    r.required_entry_count,
    r.bonus_tracks_allowed,
    r.deadline_mode,
    r.phase,
    r.submission_deadline,
    r.voting_deadline,
    r.override_media_type_name,
    r.override_media_type_emoji,
    r.weight,
    l.media_type_name  AS league_media_type_name,
    l.media_type_emoji AS league_media_type_emoji
  FROM rounds r
  INNER JOIN leagues l ON l.id = r.league_id
`;
/**
 * Create a new round for a league.
 */
async function createRound(input) {
    const { leagueId, theme, description, requiredEntryCount, deadlineMode = 'flexible', bonusTracksAllowed = false, overrideMediaTypeName, overrideMediaTypeEmoji, overrideSubmissionSources, weight = 1.0, submissionDays, votingDays, } = input;
    // Validate rigid mode requirements
    if (deadlineMode === 'rigid') {
        if (submissionDays == null || votingDays == null) {
            throw Object.assign(new Error('submissionDays and votingDays are required for rigid deadline mode'), { status: 400 });
        }
    }
    // Validate overrideSubmissionSources if provided
    if (overrideSubmissionSources !== undefined) {
        if (overrideSubmissionSources.length === 0) {
            throw Object.assign(new Error('At least one submission source must remain enabled.'), { status: 422 });
        }
        const validSources = ['spotify', 'youtube'];
        for (const src of overrideSubmissionSources) {
            if (!validSources.includes(src)) {
                throw Object.assign(new Error(`Invalid submission source: ${src}. Must be 'spotify' or 'youtube'.`), { status: 422 });
            }
        }
    }
    // Compute deadlines for rigid mode
    let submissionDeadline = null;
    let votingDeadline = null;
    if (deadlineMode === 'rigid' && submissionDays != null && votingDays != null) {
        submissionDeadline = new Date();
        submissionDeadline.setDate(submissionDeadline.getDate() + submissionDays);
        votingDeadline = new Date(submissionDeadline);
        votingDeadline.setDate(votingDeadline.getDate() + votingDays);
    }
    // Insert round
    const roundResult = await (0, db_1.query)(`INSERT INTO rounds (
       league_id, theme, description, required_entry_count,
       bonus_tracks_allowed, deadline_mode,
       submission_days, voting_days,
       submission_deadline, voting_deadline,
       override_media_type_name, override_media_type_emoji,
       weight
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING id`, [
        leagueId,
        theme,
        description,
        requiredEntryCount,
        bonusTracksAllowed,
        deadlineMode,
        submissionDays ?? null,
        votingDays ?? null,
        submissionDeadline,
        votingDeadline,
        overrideMediaTypeName ?? null,
        overrideMediaTypeEmoji ?? null,
        weight,
    ]);
    const roundId = roundResult.rows[0].id;
    // Insert per-round source overrides if provided
    if (overrideSubmissionSources !== undefined) {
        const allSources = ['spotify', 'youtube'];
        for (const src of allSources) {
            const enabled = overrideSubmissionSources.includes(src);
            await (0, db_1.query)(`INSERT INTO round_submission_source_overrides (round_id, source, enabled)
         VALUES ($1, $2, $3)`, [roundId, src, enabled]);
        }
    }
    // Fetch and return the created round with resolved settings
    const round = await getRound(roundId, leagueId);
    if (!round) {
        throw new Error('Failed to retrieve created round');
    }
    return round;
}
/**
 * Get a single round by ID, verifying it belongs to the given league.
 * Returns null if not found.
 */
async function getRound(roundId, leagueId) {
    const result = await (0, db_1.query)(`${ROUND_SELECT} WHERE r.id = $1 AND r.league_id = $2`, [roundId, leagueId]);
    if (result.rows.length === 0)
        return null;
    return rowToRoundResponse(result.rows[0]);
}
/**
 * List all rounds for a league.
 */
async function listRounds(leagueId) {
    const result = await (0, db_1.query)(`${ROUND_SELECT} WHERE r.league_id = $1 ORDER BY r.created_at ASC`, [leagueId]);
    const rounds = [];
    for (const row of result.rows) {
        rounds.push(await rowToRoundResponse(row));
    }
    return rounds;
}
/**
 * Advance a round's phase: submission → voting → closed.
 * Returns the updated round.
 */
async function advanceRoundPhase(roundId, leagueId) {
    // Load current phase
    const current = await (0, db_1.query)(`SELECT phase FROM rounds WHERE id = $1 AND league_id = $2`, [roundId, leagueId]);
    if (current.rows.length === 0) {
        throw Object.assign(new Error('Round not found'), { status: 404 });
    }
    const currentPhase = current.rows[0].phase;
    if (currentPhase === 'closed') {
        throw Object.assign(new Error('Round is already closed'), { status: 409 });
    }
    const nextPhase = currentPhase === 'submission' ? 'voting' : 'closed';
    await (0, db_1.query)(`UPDATE rounds SET phase = $1 WHERE id = $2`, [nextPhase, roundId]);
    // If advancing to closed, call the close handler (task 12 will implement full scoring)
    if (nextPhase === 'closed') {
        await closeRound(roundId);
    }
    const updated = await getRound(roundId, leagueId);
    if (!updated) {
        throw new Error('Failed to retrieve updated round');
    }
    return updated;
}
/**
 * Close a round — placeholder for task 12's EqualRCV scoring.
 * Currently just a no-op; task 12 will implement full scoring logic.
 */
async function closeRound(roundId) {
    // Task 12 will implement: load ballots, run EqualRCV, persist round_results
    // For now, the phase update in advanceRoundPhase is sufficient
    void roundId;
}
/**
 * Check whether flexible mode advancement conditions are met and advance if so.
 *
 * - submission phase: advance to voting if all league members have submitted
 *   at least `required_entry_count` non-bonus entries
 * - voting phase: advance to closed if all league members have submitted a ballot
 */
async function checkFlexibleAdvancement(roundId) {
    // Load round details
    const roundResult = await (0, db_1.query)(`SELECT id, league_id, phase, deadline_mode, required_entry_count
     FROM rounds WHERE id = $1`, [roundId]);
    if (roundResult.rows.length === 0)
        return;
    const round = roundResult.rows[0];
    // Only applies to flexible mode rounds that are not closed
    if (round.deadline_mode !== 'flexible' || round.phase === 'closed')
        return;
    // Count total league members
    const memberCountResult = await (0, db_1.query)(`SELECT COUNT(*) AS count FROM league_members WHERE league_id = $1`, [round.league_id]);
    const totalMembers = parseInt(memberCountResult.rows[0].count, 10);
    if (totalMembers === 0)
        return;
    if (round.phase === 'submission') {
        // Count players who have submitted at least required_entry_count non-bonus entries
        const submittedResult = await (0, db_1.query)(`SELECT COUNT(DISTINCT submitter_id) AS count
       FROM (
         SELECT submitter_id
         FROM entries
         WHERE round_id = $1 AND is_bonus_track = false
         GROUP BY submitter_id
         HAVING COUNT(*) >= $2
       ) AS qualified_submitters`, [roundId, round.required_entry_count]);
        const submittedCount = parseInt(submittedResult.rows[0].count, 10);
        if (submittedCount >= totalMembers) {
            await (0, db_1.query)(`UPDATE rounds SET phase = 'voting' WHERE id = $1`, [roundId]);
        }
    }
    else if (round.phase === 'voting') {
        // Count distinct voters who have submitted a ballot
        const votedResult = await (0, db_1.query)(`SELECT COUNT(DISTINCT voter_id) AS count FROM ballots WHERE round_id = $1`, [roundId]);
        const votedCount = parseInt(votedResult.rows[0].count, 10);
        if (votedCount >= totalMembers) {
            await (0, db_1.query)(`UPDATE rounds SET phase = 'closed' WHERE id = $1`, [roundId]);
            await closeRound(roundId);
        }
    }
}
//# sourceMappingURL=service.js.map