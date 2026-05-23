"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startScheduler = startScheduler;
exports.stopScheduler = stopScheduler;
const service_1 = require("./api/rounds/service");
let intervalHandle = null;
/**
 * Start the Rigid Mode deadline scheduler.
 *
 * Runs every 60 seconds and checks for rounds in rigid deadline mode that
 * have passed their submission or voting deadlines, advancing their phase
 * automatically.
 *
 * @param pool - The pg Pool instance to use for queries
 */
function startScheduler(pool) {
    if (intervalHandle !== null) {
        // Already running — don't start a second interval
        return;
    }
    const tick = async () => {
        try {
            // Find all rigid-mode rounds that are not yet closed
            const result = await pool.query(`SELECT id, league_id, phase, submission_deadline, voting_deadline
         FROM rounds
         WHERE deadline_mode = 'rigid' AND phase != 'closed'`);
            const now = new Date();
            for (const round of result.rows) {
                if (round.phase === 'submission' &&
                    round.submission_deadline != null &&
                    new Date(round.submission_deadline) <= now) {
                    // Advance submission → voting
                    await pool.query(`UPDATE rounds SET phase = 'voting' WHERE id = $1 AND phase = 'submission'`, [round.id]);
                    console.log(`[scheduler] Round ${round.id} advanced to voting (submission deadline passed)`);
                }
                else if (round.phase === 'voting' &&
                    round.voting_deadline != null &&
                    new Date(round.voting_deadline) <= now) {
                    // Advance voting → closed
                    await pool.query(`UPDATE rounds SET phase = 'closed' WHERE id = $1 AND phase = 'voting'`, [round.id]);
                    await (0, service_1.closeRound)(round.id);
                    console.log(`[scheduler] Round ${round.id} advanced to closed (voting deadline passed)`);
                }
            }
        }
        catch (err) {
            console.error('[scheduler] Error during tick:', err);
        }
    };
    // Run immediately on start, then every 60 seconds
    void tick();
    intervalHandle = setInterval(() => void tick(), 60_000);
}
/**
 * Stop the Rigid Mode deadline scheduler.
 * Clears the interval. Primarily used in tests.
 */
function stopScheduler() {
    if (intervalHandle !== null) {
        clearInterval(intervalHandle);
        intervalHandle = null;
    }
}
//# sourceMappingURL=scheduler.js.map