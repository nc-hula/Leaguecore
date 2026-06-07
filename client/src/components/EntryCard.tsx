import { type EntryResponse } from '../api';
import { SpotifyEmbed } from './SpotifyEmbed';
import { YouTubeEmbed } from './YouTubeEmbed';
import { CommentThread } from './CommentThread';

interface EntryCardProps {
  entry: EntryResponse;
  roundId: string;
}

export function EntryCard({ entry, roundId }: EntryCardProps) {
  const isSpotify = entry.source === 'spotify';
  const isYouTube = entry.source === 'youtube';

  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: '0.5rem',
        padding: '1rem',
        background: '#fff',
      }}
    >
      {/* Title */}
      <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>
        {entry.title}
      </h3>

      {/* Media embed */}
      {isSpotify && (
        <SpotifyEmbed
          embedHtml={entry.embedHtml}
          sourceUrl={entry.sourceUrl}
          title={entry.title}
        />
      )}
      {isYouTube && (
        <YouTubeEmbed
          embedHtml={entry.embedHtml}
          sourceUrl={entry.sourceUrl}
          title={entry.title}
        />
      )}
      {!isSpotify && !isYouTube && (
        <a
          href={entry.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: '0.875rem', color: '#2563eb' }}
        >
          {entry.title} ↗
        </a>
      )}

      {/* Context comment — always visible */}
      {entry.contextComment && (
        <p style={{ margin: '0.75rem 0 0', fontSize: '0.875rem', color: '#374151' }}>
          <span aria-hidden="true">💬 </span>
          {entry.contextComment}
        </p>
      )}

      {/* Submitter display name */}
      {entry.submitterDisplayName && (
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: '#6b7280' }}>
          <span aria-hidden="true">👤 </span>
          {entry.submitterDisplayName}
        </p>
      )}

      {/* Thread-starter comment */}
      {entry.threadStarterComment && (
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: '#374151', fontStyle: 'italic' }}>
          {entry.threadStarterComment}
        </p>
      )}

      {/* Comment thread */}
      <CommentThread roundId={roundId} entryId={entry.id} />
    </div>
  );
}
