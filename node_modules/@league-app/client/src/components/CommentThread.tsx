import { useState, useEffect, useCallback } from 'react';
import { listComments, postComment, type CommentResponse } from '../api';

interface CommentThreadProps {
  roundId: string;
  entryId: string;
}

export function CommentThread({ roundId, entryId }: CommentThreadProps) {
  const [comments, setComments] = useState<CommentResponse[]>([]);
  const [newBody, setNewBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadComments = useCallback(async () => {
    try {
      const data = await listComments(roundId, entryId);
      setComments(data);
    } catch {
      // silently fail — comments are supplementary
    }
  }, [roundId, entryId]);

  useEffect(() => {
    void loadComments();
  }, [loadComments]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = newBody.trim();
    if (!body) return;

    setPosting(true);
    setError(null);
    try {
      await postComment(roundId, entryId, body);
      setNewBody('');
      await loadComments();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post comment');
    } finally {
      setPosting(false);
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  return (
    <div style={{ marginTop: '1rem' }}>
      {comments.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 0.75rem 0' }}>
          {comments.map((c) => (
            <li
              key={c.id}
              style={{
                padding: '0.5rem 0',
                borderBottom: '1px solid #f3f4f6',
              }}
            >
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
                <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{c.authorDisplayName}</span>
                <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{formatDate(c.createdAt)}</span>
              </div>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#374151' }}>{c.body}</p>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={(e) => { void handleSubmit(e); }} style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          type="text"
          value={newBody}
          onChange={(e) => setNewBody(e.target.value)}
          placeholder="Add a comment…"
          disabled={posting}
          style={{
            flex: 1,
            padding: '0.375rem 0.5rem',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
          }}
        />
        <button
          type="submit"
          disabled={posting || !newBody.trim()}
          style={{
            padding: '0.375rem 0.75rem',
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
            cursor: posting || !newBody.trim() ? 'not-allowed' : 'pointer',
            opacity: posting || !newBody.trim() ? 0.6 : 1,
          }}
        >
          {posting ? 'Posting…' : 'Post'}
        </button>
      </form>

      {error && (
        <p style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: '#dc2626' }}>{error}</p>
      )}
    </div>
  );
}
