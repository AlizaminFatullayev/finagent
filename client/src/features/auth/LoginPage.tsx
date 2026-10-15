import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { ApiError, fieldErrors } from '../../api/errors';
import { useAuth } from '../../auth/AuthProvider';
import { CopyRequestId, retryDeadline } from '../../components/ErrorState';
import { Button } from '../../components/ui/Button';
import { PasswordField, TextField } from '../../components/ui/Field';
import { Icon } from '../../components/ui/Icon';
import { Banner } from '../../components/ui/Surfaces';
import { useCountdown } from '../../hooks/useCountdown';
import { formatCountdown } from '../../lib/format';

/** Sign in (Login.html). No sign-up: accounts are created by an administrator. */
export function LoginPage() {
  const { login, status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const seconds = useCountdown(lockedUntil);
  const locked = seconds > 0;

  if (status === 'authenticated') return <Navigate to={from} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (locked || busy) return;
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err);
      // Only the per-IP limiter sends Retry-After; an account lockout does not (API_GAPS gap 6).
      if (err instanceof ApiError && err.status === 429 && err.retryAfter) setLockedUntil(retryDeadline(err));
    } finally {
      setBusy(false);
    }
  }

  const api = error instanceof ApiError ? error : null;
  const fields = fieldErrors(error);
  const invalid = api?.status === 401;

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 16px',
        gap: 24,
      }}
    >
      <div className="row" style={{ gap: 12 }}>
        <span className="mark" style={{ width: 32, height: 32, fontSize: 13 }}>
          FA
        </span>
        <span className="t20">FinAgent</span>
      </div>
      <main id="main" style={{ width: '100%', maxWidth: 400 }}>
        <form
          className="card"
          style={{ padding: 32, display: 'flex', flexDirection: 'column', gap: 20 }}
          onSubmit={submit}
          noValidate
        >
          <div className="col" style={{ gap: 4 }}>
            <h1 className="t24">Sign in</h1>
            <p className="sec">Use your bank work account.</p>
          </div>

          {invalid && <Banner kind="error" role="alert" title="Invalid email or password" />}
          {api?.status === 429 && (
            <Banner kind="warn" icon="lock" role="alert" title="Sign-in is paused for this account">
              Too many failed attempts.{' '}
              {locked ? (
                <>
                  Try again in <span className="mono">{formatCountdown(seconds)}</span>, or contact your
                  administrator.
                </>
              ) : (
                'Try again later, or contact your administrator.'
              )}
            </Banner>
          )}
          {api && api.status >= 500 && (
            <Banner kind="error" role="alert" title="Sign-in is unavailable right now">
              Try again in a moment.
              {api.requestId && (
                <>
                  {' '}
                  Reference <CopyRequestId id={api.requestId} />
                </>
              )}
            </Banner>
          )}
          {error !== null && !api && (
            <Banner kind="error" role="alert" title="Can’t reach FinAgent">
              Check your connection and try again.
            </Banner>
          )}

          <TextField
            label="Email"
            type="email"
            autoComplete="username"
            placeholder="name@bank.az"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fields.email}
            invalid={invalid}
            disabled={locked}
            required
          />
          <PasswordField
            label="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={fields.password}
            invalid={invalid}
            disabled={locked}
            required
          />

          <Button
            type="submit"
            variant="primary"
            size="lg"
            style={{ width: '100%' }}
            loading={busy}
            disabled={locked}
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
          <div className="divider" />
          <p className="t12 muted row" style={{ gap: 8, alignItems: 'flex-start' }}>
            <Icon name="shield" style={{ marginTop: 1 }} />
            Accounts are created by your administrator.
          </p>
        </form>
      </main>
    </div>
  );
}
