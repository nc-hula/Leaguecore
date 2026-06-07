import { useSearchParams } from 'react-router-dom';

export default function LoginPage() {
  const [searchParams] = useSearchParams();
  const error = searchParams.get('error');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: '1rem' }}>
      <h1>League App</h1>
      {error && (
        <p role="alert" style={{ color: 'red' }}>
          Sign-in failed. Please try again.
        </p>
      )}
      <button onClick={() => { window.location.href = '/auth/google'; }}>
        Sign in with Google
      </button>
    </div>
  );
}
