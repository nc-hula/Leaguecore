import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getLeague, listRounds, listMembers, League, Round, MemberRow } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { InviteLink } from '../components/InviteLink';

export default function LeaguePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [league, setLeague] = useState<League | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function load() {
      try {
        const [leagueData, roundsData, membersData] = await Promise.all([
          getLeague(id!),
          listRounds(id!),
          listMembers(id!),
        ]);
        if (!cancelled) {
          setLeague(leagueData);
          setRounds(roundsData);
          setMembers(membersData);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load league');
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [id]);

  const isAdmin = members.find((m) => m.userId === user?.id)?.role === 'admin';

  const phaseLabel: Record<string, string> = {
    submission: '📝 Submission',
    voting: '🗳️ Voting',
    closed: '✅ Closed',
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
        <p>Loading…</p>
      </div>
    );
  }

  if (error || !league) {
    return (
      <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
        <p style={{ color: '#dc2626' }}>{error ?? 'League not found'}</p>
        <Link to="/">← Back to dashboard</Link>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '700px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <Link to="/" style={{ color: '#6b7280', fontSize: '0.875rem', textDecoration: 'none' }}>
            ← Dashboard
          </Link>
          <h1 style={{ margin: '0.25rem 0 0', fontSize: '1.75rem' }}>
            {league.mediaTypeEmoji} {league.name}
          </h1>
        </div>
        {isAdmin && (
          <Link
            to={`/leagues/${id}/settings`}
            style={{ padding: '0.5rem 1rem', background: '#f3f4f6', borderRadius: '0.375rem', textDecoration: 'none', color: '#374151', fontSize: '0.875rem' }}
          >
            ⚙️ Settings
          </Link>
        )}
      </div>

      {/* Invite link for admins */}
      {isAdmin && (
        <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#f9fafb', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
          <p style={{ margin: '0 0 0.5rem', fontWeight: 500, fontSize: '0.875rem', color: '#374151' }}>Invite members</p>
          <InviteLink leagueId={id!} />
        </div>
      )}

      {/* Rounds */}
      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem' }}>Rounds</h2>
        {rounds.length === 0 ? (
          <p style={{ color: '#6b7280' }}>No rounds yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {rounds.map((round) => (
              <li key={round.id} style={{ padding: '0.75rem 0', borderBottom: '1px solid #e5e7eb' }}>
                <Link
                  to={`/leagues/${id}/rounds/${round.id}`}
                  style={{ textDecoration: 'none', color: '#111' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontWeight: 500 }}>{round.theme}</span>
                      {round.description && (
                        <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
                          {round.description}
                        </p>
                      )}
                    </div>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        background: round.phase === 'submission' ? '#dbeafe' : round.phase === 'voting' ? '#fef3c7' : '#f3f4f6',
                        color: round.phase === 'submission' ? '#1d4ed8' : round.phase === 'voting' ? '#92400e' : '#374151',
                        flexShrink: 0,
                        marginLeft: '0.75rem',
                      }}
                    >
                      {phaseLabel[round.phase] ?? round.phase}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Members */}
      <section>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem' }}>Members</h2>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {members.map((member) => (
            <li key={member.userId} style={{ padding: '0.5rem 0', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{member.displayName}</span>
              {member.role === 'admin' && (
                <span style={{ fontSize: '0.75rem', color: '#6b7280', background: '#f3f4f6', padding: '2px 8px', borderRadius: '9999px' }}>
                  admin
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
