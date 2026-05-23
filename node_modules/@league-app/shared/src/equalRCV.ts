// A tier is a group of candidate IDs tied at the same rank
export type Tier = string[];

// A ballot is an ordered array of tiers (index 0 = highest preference)
export type RCVBallot = Tier[];

export interface RCVResult {
  rank: number;
  candidateId: string;
  finalScore: number;
}

// Avoid floating-point precision issues by rounding to 6 decimal places
const cleanFloat = (n: number): number => Math.round(n * 1e6) / 1e6;

/**
 * Runs the EqualRCV algorithm over a set of ballots.
 *
 * Each ballot is an ordered array of tiers (index 0 = highest preference).
 * A tier is a group of candidate IDs that are tied at the same rank.
 *
 * In each elimination round:
 *  - Each ballot distributes 1 vote equally among all active candidates in
 *    the ballot's highest tier that still contains at least one active candidate.
 *  - Optional weight multipliers are applied per candidate (for cumulative standings).
 *  - The candidate(s) with the fewest accumulated votes are eliminated.
 *  - Ties are broken by consulting prior rounds' scores in reverse chronological order.
 *  - If still tied after all history, all tied candidates are eliminated simultaneously.
 *
 * Final ranks are assigned based on elimination order (last eliminated = rank 1).
 * Dense ranking is used: if N candidates tie at rank R, the next rank is R+N.
 *
 * @param ballots - Array of RCV ballots
 * @param allCandidates - All candidate IDs (needed to handle ballots that may not rank all candidates)
 * @param weights - Optional map of candidateId → weight multiplier (for cumulative standings)
 * @returns Array of RCVResult sorted by rank ascending
 */
export function runEqualRCV(
  ballots: RCVBallot[],
  allCandidates: string[],
  weights?: Map<string, number>
): RCVResult[] {
  if (allCandidates.length === 0) {
    return [];
  }

  // Track active candidates
  let active = new Set<string>(allCandidates);

  // Elimination groups in order of elimination (index 0 = first eliminated)
  // Each entry is [eliminatedCandidates, scoresInThisRound]
  const eliminationHistory: Array<{
    eliminated: string[];
    scores: Map<string, number>;
  }> = [];

  // Accumulate scores for each round of elimination
  // We keep a history of round scores for tie-breaking
  const roundScoreHistory: Map<string, number>[] = [];

  while (active.size > 0) {
    // Compute scores for this elimination round
    const roundScores = new Map<string, number>();
    for (const candidateId of active) {
      roundScores.set(candidateId, 0);
    }

    for (const ballot of ballots) {
      // Find the highest tier on this ballot that has at least one active candidate
      let activeTierCandidates: string[] = [];
      for (const tier of ballot) {
        const activeCandidatesInTier = tier.filter((c) => active.has(c));
        if (activeCandidatesInTier.length > 0) {
          activeTierCandidates = activeCandidatesInTier;
          break;
        }
      }

      if (activeTierCandidates.length === 0) {
        // This ballot has no active candidates — skip (exhausted ballot)
        continue;
      }

      // Distribute 1 vote equally among active candidates in this tier
      const voteShare = cleanFloat(1.0 / activeTierCandidates.length);
      for (const candidateId of activeTierCandidates) {
        const weight = weights?.get(candidateId) ?? 1.0;
        const weightedVote = cleanFloat(voteShare * weight);
        roundScores.set(candidateId, cleanFloat((roundScores.get(candidateId) ?? 0) + weightedVote));
      }
    }

    roundScoreHistory.push(roundScores);

    // Find the minimum score among active candidates
    let minScore = Infinity;
    for (const [, score] of roundScores) {
      if (score < minScore) {
        minScore = score;
      }
    }

    // Find all candidates with the minimum score (potential elimination group)
    let toEliminate = Array.from(roundScores.entries())
      .filter(([, score]) => score === minScore)
      .map(([id]) => id);

    // Tie-breaking: if multiple candidates are tied for minimum, look back through
    // prior rounds' scores in reverse chronological order
    if (toEliminate.length > 1) {
      // Walk backwards through history (excluding the current round)
      for (let i = roundScoreHistory.length - 2; i >= 0; i--) {
        const historicalScores = roundScoreHistory[i];
        // Find the minimum historical score among the tied candidates
        let historicalMin = Infinity;
        for (const id of toEliminate) {
          const s = historicalScores.get(id) ?? 0;
          if (s < historicalMin) {
            historicalMin = s;
          }
        }
        // Keep only those with the historical minimum
        const stillTied = toEliminate.filter(
          (id) => (historicalScores.get(id) ?? 0) === historicalMin
        );
        if (stillTied.length < toEliminate.length) {
          // Tie was broken
          toEliminate = stillTied;
        }
        if (toEliminate.length === 1) {
          break;
        }
      }
      // If still tied after all history, eliminate all simultaneously
    }

    // If all active candidates are tied (and tie-breaking didn't help), eliminate all
    if (toEliminate.length === active.size) {
      eliminationHistory.push({ eliminated: toEliminate, scores: roundScores });
      for (const id of toEliminate) {
        active.delete(id);
      }
      break;
    }

    // Record elimination and remove from active set
    eliminationHistory.push({ eliminated: toEliminate, scores: roundScores });
    for (const id of toEliminate) {
      active.delete(id);
    }
  }

  // Build final rankings from elimination order
  // Last eliminated = rank 1, first eliminated = highest rank number
  // Dense ranking: if N candidates tie at rank R, next rank is R+N
  const results: RCVResult[] = [];

  // Reverse the elimination history so index 0 = last eliminated (rank 1)
  const reversedHistory = [...eliminationHistory].reverse();

  let currentRank = 1;
  for (const { eliminated, scores } of reversedHistory) {
    for (const candidateId of eliminated) {
      results.push({
        rank: currentRank,
        candidateId,
        finalScore: scores.get(candidateId) ?? 0,
      });
    }
    currentRank += eliminated.length;
  }

  // Sort by rank ascending, then by candidateId for deterministic ordering
  results.sort((a, b) => a.rank - b.rank || a.candidateId.localeCompare(b.candidateId));

  return results;
}
