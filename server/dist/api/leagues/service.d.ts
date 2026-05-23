type SubmissionSource = 'spotify' | 'youtube';
type RevealMode = 'global' | 'per_player';
interface League {
    id: string;
    name: string;
    mediaTypeName: string;
    mediaTypeEmoji: string;
    revealMode: RevealMode;
    submissionSources: SubmissionSource[];
}
export interface CreateLeagueInput {
    name: string;
    mediaTypeName?: string;
    mediaTypeEmoji?: string;
    revealMode?: string;
    creatorId: string;
}
/**
 * Create a new league, insert both submission sources as enabled, and add the
 * creator as an admin member.
 */
export declare function createLeague(input: CreateLeagueInput): Promise<League>;
/**
 * Get a single league by ID. Returns null if not found.
 */
export declare function getLeague(leagueId: string): Promise<League | null>;
/**
 * List all leagues the given user is a member of.
 */
export declare function listUserLeagues(userId: string): Promise<League[]>;
export interface UpdateLeagueInput {
    name?: string;
    mediaTypeName?: string;
    mediaTypeEmoji?: string;
    revealMode?: string;
    submissionSources?: string[];
}
/**
 * Update league settings. Handles submission source updates with at-least-one
 * validation.
 */
export declare function updateLeague(leagueId: string, input: UpdateLeagueInput): Promise<League>;
/**
 * Get the invite URL for a league.
 */
export declare function getInviteUrl(leagueId: string): Promise<string>;
export interface JoinLeagueResult {
    alreadyMember: boolean;
    message: string;
}
/**
 * Join a league via invite token. Returns whether the user was already a member.
 */
export declare function joinLeague(token: string, userId: string): Promise<JoinLeagueResult>;
export interface MemberRow {
    userId: string;
    displayName: string;
    email: string;
    role: string;
    joinedAt: string;
}
/**
 * List all members of a league.
 */
export declare function listMembers(leagueId: string): Promise<MemberRow[]>;
/**
 * Remove a member from a league. Throws if trying to remove the last admin.
 */
export declare function removeMember(leagueId: string, targetUserId: string, requestingUserId: string): Promise<void>;
/**
 * Grant admin role to a league member.
 */
export declare function grantAdmin(leagueId: string, targetUserId: string): Promise<void>;
/**
 * Check whether a user is a member of a league.
 */
export declare function isLeagueMember(leagueId: string, userId: string): Promise<boolean>;
export {};
