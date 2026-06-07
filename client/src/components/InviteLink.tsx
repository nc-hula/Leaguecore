import { useState } from 'react';
import { getInviteUrl } from '../api';

export function InviteLink({ leagueId }: { leagueId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleShow = async () => {
    try {
      const data = await getInviteUrl(leagueId);
      setUrl(data.inviteUrl);
    } catch { /* ignore */ }
  };

  const handleCopy = () => {
    if (url) {
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  return (
    <div>
      {!url ? (
        <button onClick={handleShow}>Get Invite Link</button>
      ) : (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input readOnly value={url} style={{ width: '300px' }} />
          <button onClick={handleCopy}>{copied ? 'Copied!' : 'Copy'}</button>
        </div>
      )}
    </div>
  );
}
