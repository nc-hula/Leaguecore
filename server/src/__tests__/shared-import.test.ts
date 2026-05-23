import { describe, it, expect } from 'vitest';
import type { User, League, Round, Entry, Ballot, BallotItem, RoundResult } from '@league-app/shared';
import type { RevealMode, DeadlineMode, RoundPhase, SubmissionSource } from '@league-app/shared';

describe('shared types import', () => {
  it('can construct a User object', () => {
    const user: User = {
      id: '123',
      displayName: 'Alice',
      email: 'alice@example.com',
    };
    expect(user.id).toBe('123');
    expect(user.displayName).toBe('Alice');
  });

  it('can construct a League object', () => {
    const league: League = {
      id: 'league-1',
      name: 'Test League',
      mediaTypeName: 'Music',
      mediaTypeEmoji: '🎶',
      revealMode: 'global' as RevealMode,
      submissionSources: ['spotify', 'youtube'] as SubmissionSource[],
    };
    expect(league.revealMode).toBe('global');
    expect(league.submissionSources).toHaveLength(2);
  });

  it('can construct a Round object', () => {
    const round: Round = {
      id: 'round-1',
      leagueId: 'league-1',
      theme: 'Summer Vibes',
      description: 'Songs for the summer',
      requiredEntryCount: 3,
      bonusTracksAllowed: true,
      deadlineMode: 'flexible' as DeadlineMode,
      phase: 'submission' as RoundPhase,
      mediaTypeName: 'Music',
      mediaTypeEmoji: '🎶',
      submissionSources: ['spotify'],
      weight: 1.0,
    };
    expect(round.phase).toBe('submission');
    expect(round.weight).toBe(1.0);
  });

  it('can construct an Entry object', () => {
    const entry: Entry = {
      id: 'entry-1',
      roundId: 'round-1',
      title: 'Test Song',
      sourceUrl: 'https://open.spotify.com/track/123',
      source: 'spotify',
      embedHtml: '<iframe src="..."></iframe>',
      isBonusTrack: false,
    };
    expect(entry.source).toBe('spotify');
    expect(entry.submitterDisplayName).toBeUndefined();
  });

  it('can construct a Ballot with BallotItems', () => {
    const item: BallotItem = { entryId: 'entry-1', rankPosition: 0 };
    const ballot: Ballot = {
      roundId: 'round-1',
      items: [item],
    };
    expect(ballot.items).toHaveLength(1);
    expect(ballot.items[0].rankPosition).toBe(0);
  });

  it('can construct a RoundResult', () => {
    const result: RoundResult = {
      entryId: 'entry-1',
      entryTitle: 'Test Song',
      submitterDisplayName: 'Alice',
      finalRank: 1,
      finalScore: 3.5,
    };
    expect(result.finalRank).toBe(1);
  });
});
