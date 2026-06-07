import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { RankerBoard } from './RankerBoard';
import type { EntryResponse } from '../../api';

function entry(id: string): EntryResponse {
  return {
    id,
    roundId: 'r1',
    title: `Track ${id}`,
    sourceUrl: `https://open.spotify.com/track/${id}`,
    source: 'spotify',
    embedHtml: '',
    thumbnailUrl: null,
    isBonusTrack: false,
    contextComment: null,
  };
}

describe('RankerBoard', () => {
  it('blocks ballot submission while entries remain in the unsorted bin', () => {
    render(<RankerBoard entries={[entry('a'), entry('b')]} roundId="r1" onSubmitted={() => {}} />);

    // All entries start unranked → submit must be disabled.
    expect(screen.getByRole('button', { name: /Submit Ballot/i })).toBeDisabled();
    expect(screen.getByText(/2 entries left to rank/i)).toBeInTheDocument();
  });
});
