"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
(0, vitest_1.describe)('shared types import', () => {
    (0, vitest_1.it)('can construct a User object', () => {
        const user = {
            id: '123',
            displayName: 'Alice',
            email: 'alice@example.com',
        };
        (0, vitest_1.expect)(user.id).toBe('123');
        (0, vitest_1.expect)(user.displayName).toBe('Alice');
    });
    (0, vitest_1.it)('can construct a League object', () => {
        const league = {
            id: 'league-1',
            name: 'Test League',
            mediaTypeName: 'Music',
            mediaTypeEmoji: '🎶',
            revealMode: 'global',
            submissionSources: ['spotify', 'youtube'],
        };
        (0, vitest_1.expect)(league.revealMode).toBe('global');
        (0, vitest_1.expect)(league.submissionSources).toHaveLength(2);
    });
    (0, vitest_1.it)('can construct a Round object', () => {
        const round = {
            id: 'round-1',
            leagueId: 'league-1',
            theme: 'Summer Vibes',
            description: 'Songs for the summer',
            requiredEntryCount: 3,
            bonusTracksAllowed: true,
            deadlineMode: 'flexible',
            phase: 'submission',
            mediaTypeName: 'Music',
            mediaTypeEmoji: '🎶',
            submissionSources: ['spotify'],
            weight: 1.0,
        };
        (0, vitest_1.expect)(round.phase).toBe('submission');
        (0, vitest_1.expect)(round.weight).toBe(1.0);
    });
    (0, vitest_1.it)('can construct an Entry object', () => {
        const entry = {
            id: 'entry-1',
            roundId: 'round-1',
            title: 'Test Song',
            sourceUrl: 'https://open.spotify.com/track/123',
            source: 'spotify',
            embedHtml: '<iframe src="..."></iframe>',
            isBonusTrack: false,
        };
        (0, vitest_1.expect)(entry.source).toBe('spotify');
        (0, vitest_1.expect)(entry.submitterDisplayName).toBeUndefined();
    });
    (0, vitest_1.it)('can construct a Ballot with BallotItems', () => {
        const item = { entryId: 'entry-1', rankPosition: 0 };
        const ballot = {
            roundId: 'round-1',
            items: [item],
        };
        (0, vitest_1.expect)(ballot.items).toHaveLength(1);
        (0, vitest_1.expect)(ballot.items[0].rankPosition).toBe(0);
    });
    (0, vitest_1.it)('can construct a RoundResult', () => {
        const result = {
            entryId: 'entry-1',
            entryTitle: 'Test Song',
            submitterDisplayName: 'Alice',
            finalRank: 1,
            finalScore: 3.5,
        };
        (0, vitest_1.expect)(result.finalRank).toBe(1);
    });
});
//# sourceMappingURL=shared-import.test.js.map