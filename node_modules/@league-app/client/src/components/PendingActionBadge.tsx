export function PendingActionBadge({ label }: { label: string }) {
  return (
    <span style={{ background: '#f59e0b', color: '#fff', padding: '2px 8px', borderRadius: '9999px', fontSize: '0.75rem', marginLeft: '0.5rem' }}>
      {label}
    </span>
  );
}
