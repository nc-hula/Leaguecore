import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { runEqualRCV } from '@league-app/shared';
import type { RCVBallot } from '@league-app/shared';

/**
 * Property-based tests for the EqualRCV engine.
 * Each runs fast-check's default ≥100 iterations.
 */

// ── Generators ────────────────────────────────────────────────────────────────

/** N unique candidate ids: c0..c{n-1}. */
function candidatesOf(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `c${i}`);
}

/**
 * Build a single ballot that ranks every candidate, partitioned into ordered
 * tiers. `tierOf` maps each candidate index → a tier key; tiers are emitted in
 * ascending key order (key 0 = highest preference). Empty tiers are skipped, so
 * every active candidate appears exactly once.
 */
function ballotFromTierAssignment(candidates: string[], tierOf: number[]): RCVBallot {
  const byTier = new Map<number, string[]>();
  candidates.forEach((id, i) => {
    const key = tierOf[i];
    if (!byTier.has(key)) byTier.set(key, []);
    byTier.get(key)!.push(id);
  });
  return Array.from(byTier.keys())
    .sort((a, b) => a - b)
    .map((k) => byTier.get(k)!);
}

/** Arbitrary scenario: 1..6 candidates and 1..12 ballots, each ranking all candidates. */
const scenario = fc
  .integer({ min: 1, max: 6 })
  .chain((n) => {
    const candidates = candidatesOf(n);
    const ballotArb = fc
      .array(fc.integer({ min: 0, max: n - 1 }), { minLength: n, maxLength: n })
      .map((tierOf) => ballotFromTierAssignment(candidates, tierOf));
    return fc
      .array(ballotArb, { minLength: 1, maxLength: 12 })
      .map((ballots) => ({ candidates, ballots }));
  });

// ── Properties ──────────────────────────────────────────────────────────────

describe('EqualRCV — property-based', () => {
  // Feature: league-app, Property 1: EqualRCV produces a complete ranking
  it('P1: one result per candidate, ranks dense and within [1, N]', () => {
    fc.assert(
      fc.property(scenario, ({ candidates, ballots }) => {
        const results = runEqualRCV(ballots, candidates);

        // Exactly one row per candidate, no duplicates, no extras.
        expect(results).toHaveLength(candidates.length);
        const ids = new Set(results.map((r) => r.candidateId));
        expect(ids).toEqual(new Set(candidates));

        // Ranks are positive, start at 1, and never exceed N.
        const ranks = results.map((r) => r.rank);
        expect(Math.min(...ranks)).toBe(1);
        expect(Math.max(...ranks)).toBeLessThanOrEqual(candidates.length);

        // Dense ranking: after a group of K candidates sharing rank R, the next
        // distinct rank is R + K — so every rank value's multiplicity equals the
        // gap to the next rank. Equivalent check: each rank R has exactly the
        // number of occurrences needed to make ranks contiguous.
        const counts = new Map<number, number>();
        for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
        let expectedNext = 1;
        for (const rank of [...counts.keys()].sort((a, b) => a - b)) {
          expect(rank).toBe(expectedNext);
          expectedNext += counts.get(rank)!;
        }
      })
    );
  });

  // Feature: league-app, Property 2: Fractional vote distribution sums to one
  // When every ballot ranks all candidates in a single tied tier, the first (and
  // only) elimination round distributes each ballot's single vote equally and then
  // eliminates everyone simultaneously. The recorded finalScores therefore sum to
  // exactly the ballot count — i.e. every ballot contributed exactly 1.0.
  it('P2: each ballot distributes exactly 1.0 of vote weight', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 1, max: 12 }),
        (n, ballotCount) => {
          const candidates = candidatesOf(n);
          const ballots: RCVBallot[] = Array.from({ length: ballotCount }, () => [
            candidates.slice(),
          ]);
          const results = runEqualRCV(ballots, candidates);
          const total = results.reduce((sum, r) => sum + r.finalScore, 0);
          // The engine rounds each vote share to 6 decimal places (see cleanFloat),
          // so the sum can drift by up to ~0.5e-6 per (candidate × ballot) share.
          const tolerance = n * ballotCount * 1e-6 + 1e-9;
          expect(Math.abs(total - ballotCount)).toBeLessThan(tolerance);
        }
      )
    );
  });

  // Determinism: identical input yields identical output (stable ordering).
  it('is deterministic for identical inputs', () => {
    fc.assert(
      fc.property(scenario, ({ candidates, ballots }) => {
        const a = runEqualRCV(ballots, candidates);
        const b = runEqualRCV(ballots, candidates);
        expect(a).toEqual(b);
      })
    );
  });
});
