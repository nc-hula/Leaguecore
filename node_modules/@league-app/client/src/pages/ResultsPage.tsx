import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getRoundResults, getLeagueStandings, RoundResultResponse, StandingsEntry } from '../api';

export default function ResultsPage() {
  const { id: leagueId, roundId } = useParams<{ id: string; roundId: string }>();

  const [results, setResults] = useState<RoundResultResponse[]>([]);
  const [standings, setStandings] = useState<StandingsEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!leagueId || !roundId) return;

    async function load() {
      try {
        const [roundResults, standingsData] = await Promise.all([
          getRoundResults(leagueId!, roundId!),
          getLeagueStandings(leagueId!),
        ]);
        setResults(roundResults);
        setStandings(standingsData.standings);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load results');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [leagueId, roundId]);

  const rankMedal = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  };

  if (loading) {
    return <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}><p>Loading results…</p></div>;
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
        <p style={{ color: '#dc2626' }}>{error}</p>
        <Link to={`/leagues/${leagueId}`}>← Back to league</Link>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '720px' }}>
      {/* Navigation */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', fontSize: '0.875rem' }}>
        <Link to={`/leagues/${leagueId}/rounds/${roundId}`} style={{ color: '#6b7280', textDecoration: 'none' }}>
          ← Round
        </Link>
        <Link to={`/leagues/${leagueId}`} style={{ color: '#6b7280', textDecoration: 'none' }}>
          League
        </Link>
      </div>

      {/* Round results */}
      <section style={{ marginBottom: '2.5rem' }}>
        <h1 style={{ margin: '0 0 1rem', fontSize: '1.5rem' }}>Round Results</h1>
        {results.length === 0 ? (
          <p style={{ color: '#6b7280' }}>No results available yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {results.map((r) => (
              <div
                key={r.entryId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '0.875rem 1rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.5rem',
                  background: r.finalRank === 1 ? '#fefce8' : '#fff',
                }}
              >
                <span style={{ fontSize: '1.25rem', width: '2.5rem', textAlign: 'center', flexShrink: 0 }}>
                  {rankMedal(r.finalRank)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9375rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.entryTitle}
                  </p>
                  <p style={{ margin: '0.125rem 0 0', fontSize: '0.8125rem', color: '#6b7280' }}>
                    👤 {r.submitterDisplayName}
                  </p>
                </div>
                <div style={{ flexShrink: 0, textAlign: 'right' }}>
                  <a
                    href={r.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '0.75rem', color: '#6b7280', textDecoration: 'none' }}
                  >
                    {r.source === 'spotify' ? '🎵 Spotify' : '📺 YouTube'} ↗
                  </a>
                  <p style={{ margin: '0.125rem 0 0', fontSize: '0.75rem', color: '#9ca3af' }}>
                    score: {r.finalScore.toFixed(2)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* League standings */}
      <section>
        <h2 style={{ margin: '0 0 1rem', fontSize: '1.25rem' }}>League Standings</h2>
        {standings.length === 0 ? (
          <p style={{ color: '#6b7280' }}>No standings yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {standings.map((s) => (
              <div
                key={s.userId}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.625rem 1rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '0.375rem',
                  background: s.rank === 1 ? '#fefce8' : '#fff',
                }}
              >
                <span style={{ width: '2rem', textAlign: 'center', fontWeight: 700, color: '#374151', flexShrink: 0 }}>
                  {rankMedal(s.rank)}
                </span>
                <span style={{ flex: 1, fontWeight: 500 }}>{s.displayName}</span>
                <span style={{ fontSize: '0.8125rem', color: '#9ca3af' }}>
                  {s.finalScore.toFixed(2)} pts
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
