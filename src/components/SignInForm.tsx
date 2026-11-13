// Spec §9.2: email → 6-digit code → signed in. Codes, not magic links.
import { useId, useState } from 'react';
import { friendlyError, sendCode, verifyCode } from '../lib/backup.ts';
import { useBackup } from '../lib/backupContext.ts';
import './SignInForm.css';

export function SignInForm() {
  const { onSignedIn } = useBackup();
  const id = useId();
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const send = () =>
    run(async () => {
      const address = email.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
        throw new Error('Please enter a valid email address.');
      }
      await sendCode(address);
      setCode('');
      setStage('code');
    });

  const verify = () =>
    run(async () => {
      const token = code.replace(/\s/g, '');
      if (!/^\d{6,10}$/.test(token)) throw new Error('Enter the code from the email.');
      onSignedIn(await verifyCode(email.trim(), token));
    });

  return (
    <form
      className="signin"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void (stage === 'email' ? send() : verify());
      }}
    >
      {stage === 'email' ? (
        <div className="signin__field">
          <label htmlFor={`${id}-email`}>Email</label>
          <input
            id={`${id}-email`}
            className="input"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      ) : (
        <>
          <p className="signin__sent">
            We emailed a code to <strong>{email.trim()}</strong>. It can take a minute; check spam
            too.
          </p>
          <div className="signin__field">
            <label htmlFor={`${id}-code`}>Code</label>
            <input
              id={`${id}-code`}
              className="input signin__code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={12}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
        </>
      )}

      {error && (
        <p className="signin__error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
        {busy ? 'Please wait…' : stage === 'email' ? 'Send code' : 'Sign in'}
      </button>

      {stage === 'code' && (
        <div className="signin__links">
          <button
            type="button"
            className="btn btn--ghost"
            disabled={busy}
            onClick={() => void send()}
          >
            Send a new code
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={busy}
            onClick={() => {
              setStage('email');
              setError(null);
            }}
          >
            Use a different email
          </button>
        </div>
      )}
    </form>
  );
}
