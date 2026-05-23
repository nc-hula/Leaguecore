import { Pool } from 'pg';
/**
 * Start the Rigid Mode deadline scheduler.
 *
 * Runs every 60 seconds and checks for rounds in rigid deadline mode that
 * have passed their submission or voting deadlines, advancing their phase
 * automatically.
 *
 * @param pool - The pg Pool instance to use for queries
 */
export declare function startScheduler(pool: Pool): void;
/**
 * Stop the Rigid Mode deadline scheduler.
 * Clears the interval. Primarily used in tests.
 */
export declare function stopScheduler(): void;
