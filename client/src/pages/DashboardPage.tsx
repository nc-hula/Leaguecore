import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listLeagues, listRounds, createLeague, League, Round } from '../api';
import { PendingActionBadge } from '../components/PendingActionBadge';

interface LeagueWithPending {
  league: League;
  pendingSubmission: boolean;
  pendingVote: boolean;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<LeagueWithPending[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create league form
  const [showCreate, setShowCreate] = useState(false);
  const [newLeagueName, setNewLeagueName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const leagues = await listLeagues();

        // For each league, fetch rounds to check pending actions
        const withPending = await Promise.all(
          leagues.map(async (league): Promise<LeagueWithPending> => {
            let rounds: Round[] = [];
            try {
              rounds = await listRounds(league.id);
            } catch {
              // If rounds can't be fetched, treat as no pending action
            }
            const pendingSubmission = rounds.some((r) => r.phase === 'submission');
            const pendingVote = rounds.some((r) => r.phase === 'voting');
            return { league, pendingSubmission, pendingVote };
          })
        );

        if (!cancelled) {
          setItems(withPending);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load leagues');
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  async function handleCreateLeague(e: React.FormEvent) {
    e.preventDefault();
    const name = newLeagueName.trim();
    if (!name) return;

    setCreating(true);
    setCreateError(null);
    try {
      const league = await createLeague({ name });
      navigate(`/leagues/${league.id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create league');
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
        <p>Loading leagues…</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '600px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0 }}>My Leagues</h1>
        <button
          onClick={() => { setShowCreate((v) => !v); setCreateError(null); }}
          style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}
        >
          {showCreate ? 'Cancel' : 'Create League'}
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={handleCreateLeague}
          style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}
        >
          <input
            type="text"
            placeholder="League name"
            value={newLeagueName}
            onChange={(e) => setNewLeagueName(e.target.value)}
            style={{ flex: 1, padding: '0.5rem' }}
            autoFocus
            disabled={creating}
          />
          <button type="submit" disabled={creating || !newLeagueName.trim()} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>
            {creating ? 'Creating…' : 'Create'}
          </button>
          {createError && (
            <span style={{ color: '#dc2626', fontSize: '0.875rem' }}>{createError}</span>
          )}
        </form>
      )}

      {error && <p style={{ color: '#dc2626' }}>{error}</p>}

      {items.length === 0 ? (
        <p style={{ color: '#6b7280' }}>You're not in any leagues yet. Create one to get started.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {items.map(({ league, pendingSubmission, pendingVote }) => (
            <li key={league.id} style={{ padding: '0.75rem 0', borderBottom: '1px solid #e5e7eb' }}>
              <Link
                to={`/leagues/${league.id}`}
                style={{ textDecoration: 'none', color: '#111', fontWeight: 500, fontSize: '1rem' }}
              >
                {league.mediaTypeEmoji} {league.name}
              </Link>
              {pendingSubmission && <PendingActionBadge label="Submit" />}
              {pendingVote && <PendingActionBadge label="Vote" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
