type SubmissionSource = 'spotify' | 'youtube';
type DeadlineMode = 'rigid' | 'flexible';
type RoundPhase = 'submission' | 'voting' | 'closed';
export interface RoundResponse {
    id: string;
    leagueId: string;
    theme: string;
    description: string;
    requiredEntryCount: number;
    bonusTracksAllowed: boolean;
    deadlineMode: DeadlineMode;
    phase: RoundPhase;
    submissionDeadline?: string;
    votingDeadline?: string;
    mediaTypeName: string;
    mediaTypeEmoji: string;
    submissionSources: SubmissionSource[];
    weight: number;
}
export interface CreateRoundInput {
    leagueId: string;
    theme: string;
    description: string;
    requiredEntryCount: number;
    deadlineMode?: DeadlineMode;
    bonusTracksAllowed?: boolean;
    overrideMediaTypeName?: string;
    overrideMediaTypeEmoji?: string;
    overrideSubmissionSources?: string[];
    weight?: number;
    submissionDays?: number;
    votingDays?: number;
}
/**
 * Create a new round for a league.
 */
export declare function createRound(input: CreateRoundInput): Promise<RoundResponse>;
/**
 * Get a single round by ID, verifying it belongs to the given league.
 * Returns null if not found.
 */
export declare function getRound(roundId: string, leagueId: string): Promise<RoundResponse | null>;
/**
 * List all rounds for a league.
 */
export declare function listRounds(leagueId: string): Promise<RoundResponse[]>;
/**
 * Advance a round's phase: submission → voting → closed.
 * Returns the updated round.
 */
export declare function advanceRoundPhase(roundId: string, leagueId: string): Promise<RoundResponse>;
/**
 * Close a round — placeholder for task 12's EqualRCV scoring.
 * Currently just a no-op; task 12 will implement full scoring logic.
 */
export declare function closeRound(roundId: string): Promise<void>;
/**
 * Check whether flexible mode advancement conditions are met and advance if so.
 *
 * - submission phase: advance to voting if all league members have submitted
 *   at least `required_entry_count` non-bonus entries
 * - voting phase: advance to closed if all league members have submitted a ballot
 */
export declare function checkFlexibleAdvancement(roundId: string): Promise<void>;
export {};
