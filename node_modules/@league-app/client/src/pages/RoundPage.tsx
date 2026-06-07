import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  getRound,
  listEntries,
  submitEntry,
  Round,
  EntryResponse,
} from '../api';
import { RankerBoard } from '../components/Ranker/RankerBoard';
import { EntryCard } from '../components/EntryCard';
import { PhaseTimer } from '../components/PhaseTimer';
import { BonusTrackSection } from '../components/Ranker/BonusTrackSection';

export default function RoundPage() {
  const { id: leagueId, roundId } = useParams<{ id: string; roundId: string }>();
  const navigate = useNavigate();

  const [round, setRound] = useState<Round | null>(null);
  const [entries, setEntries] = useState<EntryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Submission form state
  const [url, setUrl] = useState('');
  const [contextComment, setContextComment] = useState('');
  const [threadStarterComment, setThreadStarterComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  async function loadRound() {
    if (!leagueId || !roundId) return;
    try {
      const [roundData, entriesData] = await Promise.all([
        getRound(leagueId, roundId),
        listEntries(roundId).catch(() => [] as EntryResponse[]),
      ]);
      setRound(roundData);
      setEntries(entriesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load round');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, roundId]);

  async function handleSubmitEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!roundId || !url.trim()) return;

    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);
    try {
      await submitEntry(roundId, {
        url: url.trim(),
        contextComment: contextComment.trim() || undefined,
        threadStarterComment: threadStarterComment.trim() || undefined,
      });
      setUrl('');
      setContextComment('');
      setThreadStarterComment('');
      setSubmitSuccess(true);
      // Refresh entries list
      if (roundId) {
        const updated = await listEntries(roundId).catch(() => entries);
        setEntries(updated);
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit entry');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}><p>Loading…</p></div>;
  }

  if (error || !round) {
    return (
      <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
        <p style={{ color: '#dc2626' }}>{error ?? 'Round not found'}</p>
        <Link to={`/leagues/${leagueId}`}>← Back to league</Link>
      </div>
    );
  }

  const bonusEntries = entries.filter((e) => e.isBonusTrack);
  const regularEntries = entries.filter((e) => !e.isBonusTrack);

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '800px' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <Link to={`/leagues/${leagueId}`} style={{ color: '#6b7280', fontSize: '0.875rem', textDecoration: 'none' }}>
          ← League
        </Link>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginTop: '0.25rem' }}>
          <h1 style={{ margin: 0, fontSize: '1.5rem' }}>{round.theme}</h1>
          <span
            style={{
              fontSize: '0.75rem',
              padding: '2px 8px',
              borderRadius: '9999px',
              background: round.phase === 'submission' ? '#dbeafe' : round.phase === 'voting' ? '#fef3c7' : '#f3f4f6',
              color: round.phase === 'submission' ? '#1d4ed8' : round.phase === 'voting' ? '#92400e' : '#374151',
            }}
          >
            {round.phase === 'submission' ? '📝 Submission' : round.phase === 'voting' ? '🗳️ Voting' : '✅ Closed'}
          </span>
        </div>
        {round.description && (
          <p style={{ margin: '0.5rem 0 0', color: '#6b7280', fontSize: '0.9375rem' }}>{round.description}</p>
        )}

        {/* Phase timers for rigid mode */}
        <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {round.deadlineMode === 'rigid' && round.phase === 'submission' && round.submissionDeadline && (
            <PhaseTimer deadline={round.submissionDeadline} label="Submission closes" />
          )}
          {round.deadlineMode === 'rigid' && round.phase === 'voting' && round.votingDeadline && (
            <PhaseTimer deadline={round.votingDeadline} label="Voting closes" />
          )}
        </div>
      </div>

      {/* ── SUBMISSION PHASE ── */}
      {round.phase === 'submission' && (
        <div>
          <div style={{ marginBottom: '2rem', padding: '1.25rem', background: '#f9fafb', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
            <h2 style={{ margin: '0 0 1rem', fontSize: '1.125rem' }}>Submit your entry</h2>
            <form onSubmit={(e) => void handleSubmitEntry(e)} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                  Spotify or YouTube URL <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://open.spotify.com/track/... or https://youtube.com/watch?v=..."
                  required
                  disabled={submitting}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', boxSizing: 'border-box', fontSize: '0.875rem' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                  Context comment <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional — visible during voting)</span>
                </label>
                <input
                  type="text"
                  value={contextComment}
                  onChange={(e) => setContextComment(e.target.value)}
                  placeholder="Set the vibe…"
                  disabled={submitting}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', boxSizing: 'border-box', fontSize: '0.875rem' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                  Thread-starter comment <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional — revealed after voting)</span>
                </label>
                <input
                  type="text"
                  value={threadStarterComment}
                  onChange={(e) => setThreadStarterComment(e.target.value)}
                  placeholder="Your hot take…"
                  disabled={submitting}
                  style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', boxSizing: 'border-box', fontSize: '0.875rem' }}
                />
              </div>
              {submitError && <p style={{ color: '#dc2626', margin: 0, fontSize: '0.875rem' }}>{submitError}</p>}
              {submitSuccess && <p style={{ color: '#16a34a', margin: 0, fontSize: '0.875rem' }}>Entry submitted!</p>}
              <button
                type="submit"
                disabled={submitting || !url.trim()}
                style={{
                  alignSelf: 'flex-start',
                  padding: '0.5rem 1.25rem',
                  background: '#1d4ed8',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '0.375rem',
                  cursor: submitting || !url.trim() ? 'not-allowed' : 'pointer',
                  fontWeight: 500,
                  opacity: submitting || !url.trim() ? 0.6 : 1,
                }}
              >
                {submitting ? 'Submitting…' : 'Submit'}
              </button>
            </form>
          </div>

          {/* Entries submitted so far (anonymous) */}
          {regularEntries.length > 0 && (
            <div>
              <h2 style={{ fontSize: '1.125rem', marginBottom: '0.75rem' }}>
                Entries ({regularEntries.length})
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {regularEntries.map((entry) => (
                  <EntryCard key={entry.id} entry={entry} roundId={roundId!} />
                ))}
              </div>
            </div>
          )}
          <BonusTrackSection entries={bonusEntries} />
        </div>
      )}

      {/* ── VOTING PHASE ── */}
      {round.phase === 'voting' && (
        <div>
          <h2 style={{ fontSize: '1.125rem', marginBottom: '1rem' }}>Rank the entries</h2>
          <RankerBoard
            entries={entries}
            roundId={roundId!}
            onSubmitted={() => void loadRound()}
          />
        </div>
      )}

      {/* ── CLOSED ── */}
      {round.phase === 'closed' && (
        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
          <p style={{ fontSize: '1.125rem', color: '#374151', marginBottom: '1rem' }}>Voting is complete.</p>
          <Link
            to={`/leagues/${leagueId}/rounds/${roundId}/results`}
            style={{
              padding: '0.625rem 1.5rem',
              background: '#1d4ed8',
              color: '#fff',
              borderRadius: '0.375rem',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            View Results →
          </Link>
        </div>
      )}
    </div>
  );
}
