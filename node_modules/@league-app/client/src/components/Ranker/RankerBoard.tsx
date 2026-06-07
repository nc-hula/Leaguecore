import { useState, useCallback } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { type EntryResponse, submitBallot } from '../../api';
import { UnsortedBin, BIN_ID } from './UnsortedBin';
import { RankingGrid, BASELINE_RANK } from './RankingGrid';
import { BonusTrackSection } from './BonusTrackSection';
import { EntryTile } from './EntryTile';

interface RankedEntry {
  entry: EntryResponse;
  rankPosition: number;
}

interface RankerBoardProps {
  entries: EntryResponse[];
  roundId: string;
  onSubmitted: () => void;
}

export function RankerBoard({ entries, roundId, onSubmitted }: RankerBoardProps) {
  const regularEntries = entries.filter((e) => !e.isBonusTrack);
  const bonusEntries = entries.filter((e) => e.isBonusTrack);

  const [binEntries, setBinEntries] = useState<EntryResponse[]>(regularEntries);
  const [rankedEntries, setRankedEntries] = useState<RankedEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const activeEntry = activeId
    ? [...binEntries, ...rankedEntries.map((r) => r.entry)].find((e) => e.id === activeId)
    : null;

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over) return;

      const draggedId = active.id as string;
      const overId = over.id as string;

      // Determine destination rank position
      let targetRank: number | null = null;
      if (overId === BIN_ID) {
        // Drop back to bin
        targetRank = null;
      } else if (overId.startsWith('rank-')) {
        const parsed = parseInt(overId.replace('rank-', ''), 10);
        // Snap to nearest integer rank position
        targetRank = Math.round(parsed);
      }

      // Find dragged entry
      const fromBin = binEntries.find((e) => e.id === draggedId);
      const fromGrid = rankedEntries.find((r) => r.entry.id === draggedId);

      if (targetRank === null) {
        // Move to bin
        if (fromGrid) {
          setBinEntries((prev) => [...prev, fromGrid.entry]);
          setRankedEntries((prev) => prev.filter((r) => r.entry.id !== draggedId));
        }
        return;
      }

      const entry = fromBin ?? fromGrid?.entry;
      if (!entry) return;

      // Remove from bin if it was there
      if (fromBin) {
        setBinEntries((prev) => prev.filter((e) => e.id !== draggedId));
      }

      // Update ranked entries
      setRankedEntries((prev) => {
        const without = prev.filter((r) => r.entry.id !== draggedId);
        return [...without, { entry, rankPosition: targetRank as number }];
      });
    },
    [binEntries, rankedEntries]
  );

  const handleSubmit = async () => {
    if (binEntries.length > 0) {
      setSubmitError('All entries must be ranked before submitting.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitBallot(roundId, {
        items: rankedEntries.map((r) => ({
          entryId: r.entry.id,
          rankPosition: r.rankPosition,
        })),
      });
      setSubmitted(true);
      onSubmitted();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit ballot');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'sans-serif' }}>
        <p style={{ fontSize: '1.25rem', fontWeight: 600 }}>✅ Ballot submitted!</p>
        <p style={{ color: '#6b7280' }}>Your votes have been recorded.</p>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div style={{ fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
          {/* Left: unsorted bin */}
          <UnsortedBin entries={binEntries} activeId={activeId} />

          {/* Right: ranking grid */}
          <RankingGrid rankedEntries={rankedEntries} activeId={activeId} />
        </div>

        {/* Bonus tracks */}
        <BonusTrackSection entries={bonusEntries} />

        {/* Submit */}
        <div style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            onClick={() => void handleSubmit()}
            disabled={submitting || binEntries.length > 0}
            style={{
              padding: '0.625rem 1.5rem',
              background: binEntries.length > 0 ? '#9ca3af' : '#1d4ed8',
              color: '#fff',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: submitting || binEntries.length > 0 ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              fontSize: '0.9375rem',
            }}
          >
            {submitting ? 'Submitting…' : 'Submit Ballot'}
          </button>
          {binEntries.length > 0 && (
            <p style={{ color: '#6b7280', fontSize: '0.875rem', margin: 0 }}>
              {binEntries.length} {binEntries.length === 1 ? 'entry' : 'entries'} left to rank
            </p>
          )}
          {submitError && (
            <p style={{ color: '#dc2626', fontSize: '0.875rem', margin: 0 }}>{submitError}</p>
          )}
        </div>
      </div>

      {/* Drag overlay for smooth dragging */}
      <DragOverlay>
        {activeEntry ? <EntryTile entry={activeEntry} isDragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}
