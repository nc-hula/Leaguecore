/**
 * MediaFetcherService
 *
 * Fetches media metadata from Spotify and YouTube oEmbed endpoints.
 * Called at entry submission time to retrieve title, embed HTML, and thumbnail.
 */

export interface MediaMetadata {
  title: string;
  embedHtml: string;       // sanitized iframe HTML from oEmbed
  thumbnailUrl: string | null;
  sourceUrl: string;
  source: 'spotify' | 'youtube';
}

/** oEmbed response shape shared by both Spotify and YouTube */
interface OEmbedResponse {
  title: string;
  html: string;
  thumbnail_url?: string;
}

function serviceError(message: string, status: number): Error {
  return Object.assign(new Error(message), { status });
}

/**
 * Strip event handler attributes (onload, onerror, onclick, etc.) from HTML.
 * Prevents XSS via injected event handlers in embed iframes.
 */
function sanitizeEmbedHtml(html: string): string {
  return html.replace(/\s+on\w+="[^"]*"/g, '');
}

export class MediaFetcherService {
  /**
   * Detect whether a URL is from Spotify or YouTube.
   * Returns null for any other domain.
   */
  detectSource(url: string): 'spotify' | 'youtube' | null {
    if (url.includes('open.spotify.com') || url.includes('spotify.com')) {
      return 'spotify';
    }
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      return 'youtube';
    }
    return null;
  }

  private async fetchSpotifyMetadata(url: string): Promise<MediaMetadata> {
    const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
    const data = await this.fetchOEmbed(oembedUrl);
    return {
      title: data.title,
      embedHtml: sanitizeEmbedHtml(data.html),
      thumbnailUrl: data.thumbnail_url ?? null,
      sourceUrl: url,
      source: 'spotify',
    };
  }

  private async fetchYouTubeMetadata(url: string): Promise<MediaMetadata> {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const data = await this.fetchOEmbed(oembedUrl);
    return {
      title: data.title,
      embedHtml: sanitizeEmbedHtml(data.html),
      thumbnailUrl: data.thumbnail_url ?? null,
      sourceUrl: url,
      source: 'youtube',
    };
  }

  /**
   * Shared fetch helper with a 5-second timeout.
   * Throws a 422 service error on network failure or non-200 response.
   */
  private async fetchOEmbed(oembedUrl: string): Promise<OEmbedResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(oembedUrl, { signal: controller.signal });
      if (!response.ok) {
        throw serviceError(
          'Could not retrieve media info for that URL. Please check the link and try again.',
          422
        );
      }
      return (await response.json()) as OEmbedResponse;
    } catch (err) {
      // Re-throw errors we already created
      if (err instanceof Error && (err as NodeJS.ErrnoException & { status?: number }).status === 422) {
        throw err;
      }
      // Network errors, timeouts, etc.
      throw serviceError(
        'Could not retrieve media info for that URL. Please check the link and try again.',
        422
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Main entry point: detect source, fetch metadata, return result.
   * Throws 422 for unsupported URLs or fetch failures.
   */
  async fetchMetadata(url: string): Promise<MediaMetadata> {
    const source = this.detectSource(url);

    if (source === null) {
      throw serviceError('Only Spotify and YouTube links are supported.', 422);
    }

    if (source === 'spotify') {
      return this.fetchSpotifyMetadata(url);
    }

    return this.fetchYouTubeMetadata(url);
  }
}

export const mediaFetcherService = new MediaFetcherService();
