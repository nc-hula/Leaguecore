import { useState, useEffect, useRef } from 'react';

interface YouTubeEmbedProps {
  embedHtml: string;
  sourceUrl: string;
  title: string;
}

export function YouTubeEmbed({ embedHtml, sourceUrl, title }: YouTubeEmbedProps) {
  const [failed, setFailed] = useState(!embedHtml);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!embedHtml || !containerRef.current) return;
    const iframe = containerRef.current.querySelector('iframe');
    if (!iframe) {
      setFailed(true);
      return;
    }
    const handleError = () => setFailed(true);
    iframe.addEventListener('error', handleError);
    return () => iframe.removeEventListener('error', handleError);
  }, [embedHtml]);

  if (failed) {
    return (
      <a
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.75rem',
          border: '1px solid #e5e7eb',
          borderRadius: '0.375rem',
          textDecoration: 'none',
          color: '#dc2626',
        }}
      >
        <span>📺</span>
        <span style={{ flex: 1 }}>{title}</span>
        <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>Open on YouTube ↗</span>
      </a>
    );
  }

  return (
    <>
      <div
        ref={containerRef}
        dangerouslySetInnerHTML={{ __html: embedHtml }}
        style={{ width: '100%' }}
      />
      <a
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          fontSize: '0.75rem',
          color: '#6b7280',
          textDecoration: 'none',
          display: 'block',
          marginTop: '0.25rem',
        }}
      >
        Open on YouTube ↗
      </a>
    </>
  );
}
