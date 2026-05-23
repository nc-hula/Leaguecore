export type RevealMode = 'global' | 'per_player';
export type DeadlineMode = 'rigid' | 'flexible';
export type RoundPhase = 'submission' | 'voting' | 'closed';
export type SubmissionSource = 'spotify' | 'youtube';

export interface User {
  id: string;
  displayName: string;
  email: string;
}

export interface League {
  id: string;
  name: string;
  mediaTypeName: string;
  mediaTypeEmoji: string;
  revealMode: RevealMode;
  submissionSources: SubmissionSource[];
}

export interface Round {
  id: string;
  leagueId: string;
  theme: string;
  description: string;
  requiredEntryCount: number;
  bonusTracksAllowed: boolean;
  deadlineMode: DeadlineMode;
  phase: RoundPhase;
  submissionDeadline?: string; // ISO 8601, Rigid mode only
  votingDeadline?: string;
  mediaTypeName: string; // resolved (override or league default)
  mediaTypeEmoji: string;
  submissionSources: SubmissionSource[];
  weight: number;
}

export interface Entry {
  id: string;
  roundId: string;
  title: string;
  sourceUrl: string;
  source: SubmissionSource;
  embedHtml: string;
  thumbnailUrl?: string;
  isBonusTrack: boolean;
  contextComment?: string;
  // Only present when identity is revealed to the viewer
  submitterDisplayName?: string;
  threadStarterComment?: string;
}

export interface BallotItem {
  entryId: string;
  rankPosition: number; // 0 = highest rank; ties share same position
}

export interface Ballot {
  roundId: string;
  items: BallotItem[];
}

export interface RoundResult {
  entryId: string;
  entryTitle: string;
  submitterDisplayName: string;
  finalRank: number;
  finalScore: number;
}
