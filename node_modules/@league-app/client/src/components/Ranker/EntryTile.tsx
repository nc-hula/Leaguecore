import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { type EntryResponse } from '../../api';

interface EntryTileProps {
  entry: EntryResponse;
  isBaseline?: boolean;
  isDragging?: boolean;
}

export function EntryTile({ entry, isBaseline = false, isDragging = false }: EntryTileProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: entry.id,
    data: { entry },
  });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition: isDragging ? undefined : 'transform 0.15s ease',
    cursor: 'grab',
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '0.375rem',
    padding: '0.5rem 0.75rem',
    userSelect: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    minWidth: '200px',
    boxShadow: isDragging ? '0 4px 12px rgba(0,0,0,0.15)' : '0 1px 2px rgba(0,0,0,0.05)',
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      {entry.thumbnailUrl && (
        <img
          src={entry.thumbnailUrl}
          alt=""
          style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: '0.25rem', flexShrink: 0 }}
        />
      )}
      <span
        style={{
          fontSize: '0.875rem',
          fontWeight: 500,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {entry.title}
      </span>
      {entry.source === 'spotify' ? (
        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#1DB954' }}>🎵</span>
      ) : (
        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#FF0000' }}>📺</span>
      )}
      {isBaseline && (
        <span
          title="Really don't know how to feel about this one, huh?"
          style={{ marginLeft: '0.25rem', cursor: 'help' }}
        >
          ⚠️
        </span>
      )}
    </div>
  );
}
