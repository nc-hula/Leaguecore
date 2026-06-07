import { useDroppable } from '@dnd-kit/core';
import { type EntryResponse } from '../../api';
import { EntryTile } from './EntryTile';

const BASELINE_RANK = 9999;

interface RankedEntry {
  entry: EntryResponse;
  rankPosition: number;
}

interface RankRowProps {
  rankPosition: number;
  label: string;
  entries: EntryResponse[];
  activeId: string | null;
  isBaseline?: boolean;
}

function RankRow({ rankPosition, label, entries, activeId, isBaseline = false }: RankRowProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `rank-${rankPosition}`, data: { rankPosition } });

  return (
    <div
      ref={setNodeRef}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.75rem',
        padding: '0.5rem',
        borderRadius: '0.375rem',
        background: isOver ? '#eff6ff' : isBaseline ? '#fefce8' : 'transparent',
        border: `1px solid ${isOver ? '#3b82f6' : isBaseline ? '#fde68a' : '#e5e7eb'}`,
        minHeight: '56px',
        transition: 'background 0.1s, border-color 0.1s',
      }}
    >
      <span
        style={{
          width: '60px',
          flexShrink: 0,
          fontSize: '0.75rem',
          fontWeight: 700,
          color: isBaseline ? '#92400e' : '#6b7280',
          paddingTop: '0.25rem',
        }}
      >
        {label}
      </span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', flex: 1, minHeight: '40px' }}>
        {entries.map((entry) => (
          <div key={entry.id}>
            <EntryTile
              entry={entry}
              isBaseline={isBaseline}
              isDragging={activeId === entry.id}
            />
            {isBaseline && (
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#92400e', fontStyle: 'italic' }}>
                Really don&apos;t know how to feel about this one, huh?
              </p>
            )}
          </div>
        ))}
        {entries.length === 0 && (
          <span style={{ fontSize: '0.8rem', color: '#d1d5db', alignSelf: 'center' }}>Drop here</span>
        )}
      </div>
    </div>
  );
}

interface RankingGridProps {
  rankedEntries: RankedEntry[];
  activeId: string | null;
}

export function RankingGrid({ rankedEntries, activeId }: RankingGridProps) {
  // Group entries by rank position
  const byRank = new Map<number, EntryResponse[]>();
  for (const { entry, rankPosition } of rankedEntries) {
    const existing = byRank.get(rankPosition) ?? [];
    byRank.set(rankPosition, [...existing, entry]);
  }

  // Get sorted unique rank positions (exclude baseline)
  const nonBaselineRanks = Array.from(byRank.keys())
    .filter((r) => r !== BASELINE_RANK)
    .sort((a, b) => a - b);

  // Dense rank labels: 1st, 2nd, 3rd, ...
  const rankLabels = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];
  const getLabel = (i: number) => rankLabels[i] ?? `${i + 1}th`;

  // Build rows: existing ranks + one empty "next" drop zone + baseline
  const rows: { rankPosition: number; label: string; isBaseline: boolean }[] = [];

  nonBaselineRanks.forEach((rank, i) => {
    rows.push({ rankPosition: rank, label: getLabel(i), isBaseline: false });
  });

  // Next available rank slot
  const nextRank = nonBaselineRanks.length;
  rows.push({ rankPosition: nextRank, label: getLabel(nextRank), isBaseline: false });

  // Baseline row
  rows.push({ rankPosition: BASELINE_RANK, label: '⚠️', isBaseline: true });

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
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
        Rankings
      </p>
      {rows.map(({ rankPosition, label, isBaseline }) => (
        <RankRow
          key={rankPosition}
          rankPosition={rankPosition}
          label={label}
          entries={byRank.get(rankPosition) ?? []}
          activeId={activeId}
          isBaseline={isBaseline}
        />
      ))}
    </div>
  );
}

export { BASELINE_RANK };
