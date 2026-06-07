import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SpotifyEmbed } from './SpotifyEmbed';
import { YouTubeEmbed } from './YouTubeEmbed';

const IFRAME = '<iframe src="https://example.com/embed"></iframe>';

describe('SpotifyEmbed', () => {
  it('renders a fallback link when no embed HTML is provided', () => {
    render(<SpotifyEmbed embedHtml="" sourceUrl="https://open.spotify.com/track/x" title="My Song" />);
    const link = screen.getByRole('link', { name: /My Song/i });
    expect(link).toHaveAttribute('href', 'https://open.spotify.com/track/x');
  });

  it('renders the iframe when embed HTML is provided', () => {
    const { container } = render(
      <SpotifyEmbed embedHtml={IFRAME} sourceUrl="https://open.spotify.com/track/x" title="My Song" />
    );
    expect(container.querySelector('iframe')).not.toBeNull();
  });

  it('falls back to a link when the iframe fires an error', async () => {
    const { container } = render(
      <SpotifyEmbed embedHtml={IFRAME} sourceUrl="https://open.spotify.com/track/x" title="My Song" />
    );
    fireEvent.error(container.querySelector('iframe')!);
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /My Song/i })).toBeInTheDocument()
    );
    expect(container.querySelector('iframe')).toBeNull();
  });
});

describe('YouTubeEmbed', () => {
  it('renders a fallback link when no embed HTML is provided', () => {
    render(<YouTubeEmbed embedHtml="" sourceUrl="https://youtu.be/x" title="My Video" />);
    expect(screen.getByRole('link', { name: /My Video/i })).toHaveAttribute('href', 'https://youtu.be/x');
  });

  it('falls back to a link when the iframe fires an error', async () => {
    const { container } = render(
      <YouTubeEmbed embedHtml={IFRAME} sourceUrl="https://youtu.be/x" title="My Video" />
    );
    fireEvent.error(container.querySelector('iframe')!);
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /My Video/i })).toBeInTheDocument()
    );
    expect(container.querySelector('iframe')).toBeNull();
  });
});
