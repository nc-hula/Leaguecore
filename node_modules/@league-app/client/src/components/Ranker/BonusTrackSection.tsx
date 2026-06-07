import { type EntryResponse } from '../../api';

interface BonusTrackSectionProps {
  entries: EntryResponse[];
}

export function BonusTrackSection({ entries }: BonusTrackSectionProps) {
  if (entries.length === 0) return null;

  return (
    <div style={{ marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
      <p style={{ margin: '0 0 0.75rem', fontSize: '0.875rem', fontWeight: 600, color: '#6b7280' }}>
        🎁 Bonus Tracks
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {entries.map((entry) => (
          <div
            key={entry.id}
            style={{
              padding: '0.5rem 0.75rem',
              border: '1px solid #e5e7eb',
              borderRadius: '0.375rem',
              background: '#fafafa',
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            {entry.thumbnailUrl && (
              <img
                src={entry.thumbnailUrl}
                alt=""
                style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: '0.25rem' }}
              />
            )}
            <span>{entry.title}</span>
            <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>bonus</span>
          </div>
        ))}
      </div>
    </div>
  );
}
