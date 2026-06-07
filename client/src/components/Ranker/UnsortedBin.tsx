import { useDroppable } from '@dnd-kit/core';
import { type EntryResponse } from '../../api';
import { EntryTile } from './EntryTile';

const BIN_ID = 'unsorted-bin';

interface UnsortedBinProps {
  entries: EntryResponse[];
  activeId: string | null;
}

export function UnsortedBin({ entries, activeId }: UnsortedBinProps) {
  const { setNodeRef, isOver } = useDroppable({ id: BIN_ID });

  return (
    <div
      ref={setNodeRef}
      style={{
        minWidth: '240px',
        minHeight: '400px',
        background: isOver ? '#f0f9ff' : '#f9fafb',
        border: `2px dashed ${isOver ? '#3b82f6' : '#d1d5db'}`,
        borderRadius: '0.5rem',
        padding: '0.75rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      <p
        style={{
          margin: '0 0 0.5rem',
          fontSize: '0.75rem',
          fontWeight: 600,
          color: '#6b7280',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        Unranked ({entries.length})
      </p>
      {entries.map((entry) => (
        <EntryTile key={entry.id} entry={entry} isDragging={activeId === entry.id} />
      ))}
      {entries.length === 0 && (
        <p style={{ margin: 'auto', color: '#9ca3af', fontSize: '0.875rem', textAlign: 'center' }}>
          All entries ranked ✓
        </p>
      )}
    </div>
  );
}

export { BIN_ID };
