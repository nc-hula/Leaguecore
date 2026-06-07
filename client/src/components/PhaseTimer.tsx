import { useState, useEffect } from 'react';

interface PhaseTimerProps {
  deadline: string; // ISO 8601
  label: string;    // e.g. "Submission closes" or "Voting closes"
}

function formatTimeLeft(ms: number): string {
  if (ms <= 0) return 'Closing soon…';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export function PhaseTimer({ deadline, label }: PhaseTimerProps) {
  const [timeLeft, setTimeLeft] = useState(() => new Date(deadline).getTime() - Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft(new Date(deadline).getTime() - Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  const isUrgent = timeLeft > 0 && timeLeft < 3600_000; // < 1 hour

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.375rem',
        padding: '0.25rem 0.625rem',
        background: isUrgent ? '#fef2f2' : '#f9fafb',
        border: `1px solid ${isUrgent ? '#fca5a5' : '#e5e7eb'}`,
        borderRadius: '0.375rem',
        fontSize: '0.8125rem',
        color: isUrgent ? '#dc2626' : '#6b7280',
      }}
    >
      <span>⏱</span>
      <span>{label}:</span>
      <strong>{formatTimeLeft(timeLeft)}</strong>
    </div>
  );
}
