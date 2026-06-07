import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getLeague, listMembers, updateLeague, League } from '../api';
import { useAuth } from '../contexts/AuthContext';

const BUILTIN_MEDIA_TYPES = [
  { name: 'Video', emoji: '🎞️' },
  { name: 'Music', emoji: '🎶' },
  { name: 'Meme', emoji: '🐸' },
  { name: 'Podcast', emoji: '🎙️' },
  { name: 'Potpourri', emoji: '🍲' },
];

export default function LeagueSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [league, setLeague] = useState<League | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [selectedMediaType, setSelectedMediaType] = useState<string>('Potpourri'); // builtin name or 'Custom'
  const [customMediaName, setCustomMediaName] = useState('');
  const [customMediaEmoji, setCustomMediaEmoji] = useState('');
  const [revealMode, setRevealMode] = useState<'global' | 'per-player'>('global');
  const [spotifyEnabled, setSpotifyEnabled] = useState(true);
  const [youtubeEnabled, setYoutubeEnabled] = useState(true);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function load() {
      try {
        const [leagueData, membersData] = await Promise.all([
          getLeague(id!),
          listMembers(id!),
        ]);

        const userRole = membersData.find((m) => m.userId === user?.id)?.role;
        if (!cancelled) {
          if (userRole !== 'admin') {
            navigate(`/leagues/${id}`, { replace: true });
            return;
          }

          setLeague(leagueData);

          // Populate form from league data
          setName(leagueData.name);

          const builtin = BUILTIN_MEDIA_TYPES.find(
            (t) => t.name === leagueData.mediaTypeName && t.emoji === leagueData.mediaTypeEmoji
          );
          if (builtin) {
            setSelectedMediaType(builtin.name);
          } else {
            setSelectedMediaType('Custom');
            setCustomMediaName(leagueData.mediaTypeName);
            setCustomMediaEmoji(leagueData.mediaTypeEmoji);
          }

          setRevealMode(leagueData.revealMode === 'per-player' ? 'per-player' : 'global');
          setSpotifyEnabled(leagueData.submissionSources.includes('spotify'));
          setYoutubeEnabled(leagueData.submissionSources.includes('youtube'));

          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load settings');
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [id, user, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(false);

    if (!spotifyEnabled && !youtubeEnabled) {
      setSubmitError('At least one submission source must remain enabled.');
      return;
    }

    const sources: string[] = [];
    if (spotifyEnabled) sources.push('spotify');
    if (youtubeEnabled) sources.push('youtube');

    let mediaTypeName: string;
    let mediaTypeEmoji: string;

    if (selectedMediaType === 'Custom') {
      mediaTypeName = customMediaName.trim();
      mediaTypeEmoji = customMediaEmoji.trim();
    } else {
      const builtin = BUILTIN_MEDIA_TYPES.find((t) => t.name === selectedMediaType)!;
      mediaTypeName = builtin.name;
      mediaTypeEmoji = builtin.emoji;
    }

    setSubmitting(true);
    try {
      await updateLeague(id!, {
        name: name.trim(),
        mediaTypeName,
        mediaTypeEmoji,
        revealMode,
        submissionSources: sources,
      });
      setSubmitSuccess(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSubmitting(false);
    }
  }

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
        <Link to={`/leagues/${id}`}>← Back</Link>
      </div>
    );
  }

  const buttonBase: React.CSSProperties = {
    padding: '0.5rem 1rem',
    border: '1px solid #d1d5db',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    fontSize: '0.875rem',
    background: '#fff',
  };

  const buttonSelected: React.CSSProperties = {
    ...buttonBase,
    background: '#1d4ed8',
    color: '#fff',
    borderColor: '#1d4ed8',
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '560px' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <Link to={`/leagues/${id}`} style={{ color: '#6b7280', fontSize: '0.875rem', textDecoration: 'none' }}>
          ← {league.mediaTypeEmoji} {league.name}
        </Link>
        <h1 style={{ margin: '0.25rem 0 0', fontSize: '1.5rem' }}>League Settings</h1>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* League name */}
        <div>
          <label style={{ display: 'block', fontWeight: 500, marginBottom: '0.375rem' }}>
            League name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            style={{ width: '100%', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', boxSizing: 'border-box' }}
          />
        </div>

        {/* Media type */}
        <div>
          <label style={{ display: 'block', fontWeight: 500, marginBottom: '0.375rem' }}>
            Media type
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
            {BUILTIN_MEDIA_TYPES.map((t) => (
              <button
                key={t.name}
                type="button"
                onClick={() => setSelectedMediaType(t.name)}
                style={selectedMediaType === t.name ? buttonSelected : buttonBase}
              >
                {t.emoji} {t.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSelectedMediaType('Custom')}
              style={selectedMediaType === 'Custom' ? buttonSelected : buttonBase}
            >
              Custom
            </button>
          </div>
          {selectedMediaType === 'Custom' && (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                placeholder="Name"
                value={customMediaName}
                onChange={(e) => setCustomMediaName(e.target.value)}
                required
                style={{ flex: 1, padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
              />
              <input
                type="text"
                placeholder="Emoji"
                value={customMediaEmoji}
                onChange={(e) => setCustomMediaEmoji(e.target.value)}
                required
                maxLength={4}
                style={{ width: '70px', padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', textAlign: 'center', fontSize: '1.25rem' }}
              />
            </div>
          )}
        </div>

        {/* Reveal mode */}
        <div>
          <label style={{ display: 'block', fontWeight: 500, marginBottom: '0.375rem' }}>
            Reveal mode
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="radio"
                name="revealMode"
                value="global"
                checked={revealMode === 'global'}
                onChange={() => setRevealMode('global')}
              />
              <span>
                <strong>Global</strong> — all identities revealed once everyone has voted
              </span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="radio"
                name="revealMode"
                value="per-player"
                checked={revealMode === 'per-player'}
                onChange={() => setRevealMode('per-player')}
              />
              <span>
                <strong>Per-player</strong> — identities revealed to each player once they vote
              </span>
            </label>
          </div>
        </div>

        {/* Submission sources */}
        <div>
          <label style={{ display: 'block', fontWeight: 500, marginBottom: '0.375rem' }}>
            Submission sources
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={spotifyEnabled}
                onChange={(e) => setSpotifyEnabled(e.target.checked)}
              />
              🎵 Spotify
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={youtubeEnabled}
                onChange={(e) => setYoutubeEnabled(e.target.checked)}
              />
              📺 YouTube
            </label>
          </div>
        </div>

        {/* Error / success */}
        {submitError && (
          <p style={{ color: '#dc2626', margin: 0 }}>{submitError}</p>
        )}
        {submitSuccess && (
          <p style={{ color: '#16a34a', margin: 0 }}>Settings saved successfully.</p>
        )}

        {/* Submit */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            type="submit"
            disabled={submitting}
            style={{ padding: '0.625rem 1.25rem', background: '#1d4ed8', color: '#fff', border: 'none', borderRadius: '0.375rem', cursor: submitting ? 'not-allowed' : 'pointer', fontWeight: 500 }}
          >
            {submitting ? 'Saving…' : 'Save settings'}
          </button>
          <Link to={`/leagues/${id}`} style={{ color: '#6b7280', textDecoration: 'none', fontSize: '0.875rem' }}>
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
