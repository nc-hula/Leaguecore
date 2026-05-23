import { describe, it, expect } from 'vitest';
import { runEqualRCV } from '@league-app/shared';
import type { RCVBallot } from '@league-app/shared';

describe('runEqualRCV', () => {
  // -------------------------------------------------------------------------
  // 1. Single winner (no ties)
  // -------------------------------------------------------------------------
  it('single winner — all ballots rank A first', () => {
    const ballots: RCVBallot[] = [
      [['A'], ['B'], ['C']],
      [['A'], ['C'], ['B']],
      [['A'], ['B'], ['C']],
    ];
    const candidates = ['A', 'B', 'C'];
    const results = runEqualRCV(ballots, candidates);

    expect(results).toHaveLength(3);

    const rankA = results.find((r) => r.candidateId === 'A')!;
    expect(rankA.rank).toBe(1);

    // B and C should have ranks > 1
    const rankB = results.find((r) => r.candidateId === 'B')!;
    const rankC = results.find((r) => r.candidateId === 'C')!;
    expect(rankB.rank).toBeGreaterThan(1);
    expect(rankC.rank).toBeGreaterThan(1);
  });

  // -------------------------------------------------------------------------
  // 2. Clear winner by majority
  // -------------------------------------------------------------------------
  it('clear winner by majority — A gets 2 first-place votes, B gets 1', () => {
    const ballots: RCVBallot[] = [
      [['A'], ['B'], ['C']],
      [['A'], ['C'], ['B']],
      [['B'], ['A'], ['C']],
    ];
    const candidates = ['A', 'B', 'C'];
    const results = runEqualRCV(ballots, candidates);

    const rankA = results.find((r) => r.candidateId === 'A')!;
    expect(rankA.rank).toBe(1);
  });

  // -------------------------------------------------------------------------
  // 3. Two-way tie broken by historical scores
  // -------------------------------------------------------------------------
  it('two-way tie broken by historical scores — B eliminated before A', () => {
    // Round 1: C gets all votes (A and B get 0)
    // Round 2 (after C eliminated): A and B tie in current round,
    //   but B had lower score in round 1 → B eliminated first
    //
    // Ballot design:
    //   2 ballots: C first, then A, then B  → C gets 2 votes in round 1
    //   1 ballot:  C first, then B, then A  → C gets 1 vote in round 1
    //   After C is eliminated:
    //     2 ballots go to A, 1 ballot goes to B → A=2, B=1 → B eliminated
    //
    // Wait — that doesn't produce a tie in round 2. Let's design it properly:
    //
    // We need A and B to tie in the CURRENT round but B to have had a lower
    // historical score. Use 4 ballots:
    //   2 ballots: [C], [A], [B]  → C gets 2 in round 1
    //   2 ballots: [C], [B], [A]  → C gets 2 in round 1
    //   After C eliminated: A gets 2, B gets 2 → tie in round 2
    //   Historical (round 1): A=0, B=0 → still tied
    //
    // That won't work either. Let's use a 3-candidate scenario where
    // in round 1 A and B both get some votes but B gets fewer, then
    // in round 2 they tie:
    //
    //   3 ballots: [A], [B], [C]  → A=3 in round 1
    //   2 ballots: [B], [A], [C]  → B=2 in round 1
    //   1 ballot:  [C], [B], [A]  → C=1 in round 1
    //   C eliminated in round 1 (score=1)
    //   Round 2: A gets 3, B gets 2+1=3 → tie
    //   Historical (round 1): A=3, B=2 → B had lower score → B eliminated
    //   A wins (rank 1), B rank 2, C rank 3
    const ballots: RCVBallot[] = [
      [['A'], ['B'], ['C']],
      [['A'], ['B'], ['C']],
      [['A'], ['B'], ['C']],
      [['B'], ['A'], ['C']],
      [['B'], ['A'], ['C']],
      [['C'], ['B'], ['A']],
    ];
    const candidates = ['A', 'B', 'C'];
    const results = runEqualRCV(ballots, candidates);

    const rankA = results.find((r) => r.candidateId === 'A')!;
    const rankB = results.find((r) => r.candidateId === 'B')!;
    const rankC = results.find((r) => r.candidateId === 'C')!;

    // A wins (rank 1), B eliminated before A (rank 2), C eliminated first (rank 3)
    expect(rankA.rank).toBe(1);
    expect(rankB.rank).toBe(2);
    expect(rankC.rank).toBe(3);
  });

  // -------------------------------------------------------------------------
  // 4. Three-way simultaneous elimination (unbreakable tie)
  // -------------------------------------------------------------------------
  it('three-way simultaneous elimination — all candidates in same tier on every ballot', () => {
    // All ballots place A, B, C in the same tier → each gets 1/3 vote
    // They all tie every round → all eliminated simultaneously → all rank 1
    const ballots: RCVBallot[] = [
      [['A', 'B', 'C']],
      [['A', 'B', 'C']],
      [['A', 'B', 'C']],
    ];
    const candidates = ['A', 'B', 'C'];
    const results = runEqualRCV(ballots, candidates);

    expect(results).toHaveLength(3);
    for (const result of results) {
      expect(result.rank).toBe(1);
    }
  });

  // -------------------------------------------------------------------------
  // 5. Fractional voting with ties
  // -------------------------------------------------------------------------
  it('fractional voting — two candidates in same tier each get 0.5 votes', () => {
    // 1 ballot with A and B tied at rank 1 → each gets 0.5 votes
    const ballots: RCVBallot[] = [[['A', 'B']]];
    const candidates = ['A', 'B'];
    const results = runEqualRCV(ballots, candidates);

    expect(results).toHaveLength(2);

    const resultA = results.find((r) => r.candidateId === 'A')!;
    const resultB = results.find((r) => r.candidateId === 'B')!;

    // Both get 0.5 votes and tie → both rank 1
    expect(resultA.finalScore).toBeCloseTo(0.5, 5);
    expect(resultB.finalScore).toBeCloseTo(0.5, 5);
    expect(resultA.rank).toBe(1);
    expect(resultB.rank).toBe(1);
  });

  // -------------------------------------------------------------------------
  // 6. Weight application
  // -------------------------------------------------------------------------
  it('weight application — B has higher weight and wins despite fewer first-place votes', () => {
    // 2 ballots rank A first, 1 ballot ranks B first
    // Without weights: A wins easily
    // With weight B=3.0: B's votes are tripled
    //   Round 1: A gets 2*1.0=2, B gets 1*3.0=3 → A eliminated
    //   B wins (rank 1), A rank 2
    const ballots: RCVBallot[] = [
      [['A'], ['B']],
      [['A'], ['B']],
      [['B'], ['A']],
    ];
    const candidates = ['A', 'B'];
    const weights = new Map([['B', 3.0]]);
    const results = runEqualRCV(ballots, candidates, weights);

    const rankA = results.find((r) => r.candidateId === 'A')!;
    const rankB = results.find((r) => r.candidateId === 'B')!;

    expect(rankB.rank).toBe(1);
    expect(rankA.rank).toBe(2);
  });

  it('weight application — scores reflect weight multipliers', () => {
    // 1 ballot ranks A first, 1 ballot ranks B first
    // A has weight 2.0, B has weight 1.0
    // Round 1: A gets 1*2.0=2, B gets 1*1.0=1 → B eliminated (rank 2)
    // Round 2: A gets both ballots → 2*2.0=4 → A wins (rank 1)
    const ballots: RCVBallot[] = [
      [['A'], ['B']],
      [['B'], ['A']],
    ];
    const candidates = ['A', 'B'];
    const weights = new Map([['A', 2.0]]);
    const results = runEqualRCV(ballots, candidates, weights);

    const rankA = results.find((r) => r.candidateId === 'A')!;
    const rankB = results.find((r) => r.candidateId === 'B')!;

    expect(rankA.rank).toBe(1);
    expect(rankB.rank).toBe(2);
    // B's final score in the elimination round should reflect no weight (weight=1.0)
    expect(rankB.finalScore).toBeCloseTo(1.0, 5);
    // A's final score in the last round: both ballots go to A with weight 2.0 → 4.0
    expect(rankA.finalScore).toBeCloseTo(4.0, 5);
  });

  // -------------------------------------------------------------------------
  // 7. Baseline rank (rank position 0 is valid)
  // -------------------------------------------------------------------------
  it('rank position 0 is treated as a valid ranked entry', () => {
    // Ballots where the first tier is at position 0 (baseline)
    // This tests that entries placed at rank 0 are treated as ranked
    const ballots: RCVBallot[] = [
      [['A'], ['B'], ['C']],
      [['B'], ['A'], ['C']],
    ];
    const candidates = ['A', 'B', 'C'];
    const results = runEqualRCV(ballots, candidates);

    // All 3 candidates should appear in results
    expect(results).toHaveLength(3);
    const ids = results.map((r) => r.candidateId).sort();
    expect(ids).toEqual(['A', 'B', 'C']);
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------
  it('single candidate — returns rank 1 with no ballots needed', () => {
    const results = runEqualRCV([], ['A']);
    expect(results).toHaveLength(1);
    expect(results[0].candidateId).toBe('A');
    expect(results[0].rank).toBe(1);
  });

  it('empty candidates — returns empty array', () => {
    const results = runEqualRCV([], []);
    expect(results).toHaveLength(0);
  });

  it('dense ranking — group of N tied candidates followed by next rank R+N', () => {
    // A, B, C all tie → rank 1 for all three
    // If there were a 4th candidate D eliminated before them, D would be rank 4
    // Here: D is eliminated first (rank 4), then A/B/C tie (rank 1)
    // Ballots: 3 ballots rank A/B/C first (tied), then D
    //          1 ballot ranks D first
    // Round 1: A gets 1, B gets 1, C gets 1, D gets 1 → all tie → all eliminated simultaneously
    // Actually let's make D lose first:
    // 3 ballots: [A,B,C], [D]  → A=1, B=1, C=1, D=3 → D eliminated
    // Wait, D gets 3 votes (3 ballots × 1/3 each = 1 each for A,B,C; 0 for D from those)
    // Let me reconsider:
    // 3 ballots: [[A,B,C], [D]]  → A=1, B=1, C=1 (each gets 1/3 from 3 ballots = 1 total)
    //                               D=0 from these ballots
    // 1 ballot:  [[D], [A]]      → D=1
    // Round 1: A=1, B=1, C=1, D=1 → all tie → all eliminated simultaneously → all rank 1
    // That's not what we want. Let's use a simpler approach:
    // 4 ballots rank D last, A/B/C tied first
    // 0 ballots rank D first
    // Round 1: A=4/3, B=4/3, C=4/3, D=0 → D eliminated (rank 4)
    // Round 2: A=4/3, B=4/3, C=4/3 → all tie → all eliminated simultaneously (rank 1)
    const ballots: RCVBallot[] = [
      [['A', 'B', 'C'], ['D']],
      [['A', 'B', 'C'], ['D']],
      [['A', 'B', 'C'], ['D']],
      [['A', 'B', 'C'], ['D']],
    ];
    const candidates = ['A', 'B', 'C', 'D'];
    const results = runEqualRCV(ballots, candidates);

    expect(results).toHaveLength(4);

    const rankD = results.find((r) => r.candidateId === 'D')!;
    const rankA = results.find((r) => r.candidateId === 'A')!;
    const rankB = results.find((r) => r.candidateId === 'B')!;
    const rankC = results.find((r) => r.candidateId === 'C')!;

    // A, B, C all tie at rank 1 (last eliminated together)
    expect(rankA.rank).toBe(1);
    expect(rankB.rank).toBe(1);
    expect(rankC.rank).toBe(1);
    // D was eliminated first → rank 4 (dense ranking: 1 + 3 = 4)
    expect(rankD.rank).toBe(4);
  });
});
