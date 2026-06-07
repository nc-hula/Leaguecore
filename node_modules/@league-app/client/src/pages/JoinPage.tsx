import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { joinLeague } from '../api';

export default function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'joining' | 'success' | 'error'>('joining');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Invalid invite link.');
      return;
    }

    joinLeague(token)
      .then((result) => {
        setStatus('success');
        setMessage(result.alreadyMember ? 'You are already a member of this league.' : 'Joined successfully!');
        // Redirect to dashboard after a short delay
        setTimeout(() => navigate('/'), 1500);
      })
      .catch((err: unknown) => {
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'Failed to join league.');
      });
  }, [token, navigate]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'sans-serif', gap: '1rem' }}>
      {status === 'joining' && <p>Joining league…</p>}
      {status === 'success' && (
        <>
          <p style={{ color: '#16a34a', fontWeight: 600 }}>✅ {message}</p>
          <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>Redirecting to dashboard…</p>
        </>
      )}
      {status === 'error' && (
        <>
          <p style={{ color: '#dc2626' }}>{message}</p>
          <a href="/" style={{ color: '#1d4ed8' }}>Go to dashboard</a>
        </>
      )}
    </div>
  );
}
