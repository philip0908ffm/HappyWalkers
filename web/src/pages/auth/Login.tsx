import { useRef, useState, type FormEvent } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Navigate, useSearchParams } from 'react-router-dom';
import { authClient } from '../../api/auth';
import { Field } from '../../components/Field';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/PageHeader';
import { useToast } from '../../components/Toast';
import { useConfig, useMe } from '../../hooks/useMe';
import { useQueryClient } from '@tanstack/react-query';

/** Nur interne Pfade als Rücksprungziel erlauben (kein Weiterleiten auf fremde Seiten). */
export function safeNext(next: string | null): string {
  if (!next || next.length > 2000 || !next.startsWith('/') || next.startsWith('//')) return '/';
  // Browser lesen „\“ wie „/“ und ignorieren Tabs/Zeilenumbrüche: „/\evil.com“ oder „/\t/evil.com“
  // würden sonst zu „//evil.com“ (fremde Seite).
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return '/';
  try {
    const base = 'https://happywalkers.invalid';
    const url = new URL(next, base);
    if (url.origin !== base) return '/';
    return url.pathname + url.search + url.hash;
  } catch {
    return '/';
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function Login() {
  const { t } = useTranslation('auth');
  const [params] = useSearchParams();
  const next = safeNext(params.get('weiter'));
  const { data: me } = useMe();
  const { data: cfg } = useConfig();
  const [method, setMethod] = useState<'email' | 'password' | 'sms'>('email');

  if (me) return <Navigate to={next} replace />;

  return (
    <div style={{ maxWidth: '40rem' }}>
      <PageHeader title={t('login.title')} lead={t('login.lead')} />
      <p>{t('login.newHere')}</p>

      <fieldset className="field">
        <legend>{t('login.methodLabel')}</legend>
        <div className="choice-list choice-list--row">
          <label className="choice">
            <input type="radio" name="method" checked={method === 'email'} onChange={() => setMethod('email')} />
            <Icon name="mail" /> {t('login.methodEmail')}
          </label>
          <label className="choice">
            <input type="radio" name="method" checked={method === 'password'} onChange={() => setMethod('password')} />
            <Icon name="lock" /> {t('login.methodPassword')}
          </label>
          {cfg?.smsLogin ? (
            <label className="choice">
              <input type="radio" name="method" checked={method === 'sms'} onChange={() => setMethod('sms')} />
              <Icon name="phone" /> {t('login.methodSms')}
            </label>
          ) : null}
        </div>
      </fieldset>

      {method === 'email' ? <EmailLogin next={next} /> : method === 'password' ? <PasswordLogin /> : <SmsLogin next={next} />}

      <div className="notice notice--info">
        <Icon name="info" />
        <p>{t('login.stayInfo')}</p>
      </div>
    </div>
  );
}

function EmailLogin({ next }: { next: string }) {
  const { t } = useTranslation('auth');
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  async function send(address: string) {
    setBusy(true);
    try {
      const { error: err } = await authClient.signIn.magicLink({
        email: address,
        callbackURL: next,
        newUserCallbackURL: `/willkommen?weiter=${encodeURIComponent(next)}`,
        errorCallbackURL: '/anmelden?fehler=link',
      });
      if (err) throw err;
      return true;
    } catch (e) {
      const status = (e as { status?: number })?.status;
      toast.error(status === 429 ? t('common:errors.rate_limited') : t('login.failed'));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const value = email.trim();
    if (!EMAIL_RE.test(value)) {
      setError(t('login.emailInvalid'));
      inputRef.current?.focus();
      return;
    }
    setError(null);
    if (await send(value)) {
      setSentTo(value);
      setTimeout(() => headingRef.current?.focus(), 0);
    }
  }

  if (sentTo) {
    return (
      <section className="card" aria-labelledby="check-title">
        <h2 id="check-title" ref={headingRef} tabIndex={-1}>
          <Icon name="mail" className="inline-icon" /> {t('login.checkTitle')}
        </h2>
        <p>
          <Trans t={t} i18nKey="login.checkText" values={{ email: sentTo }} components={{ strong: <strong /> }} />
        </p>
        <p>{t('login.checkSpam')}</p>
        <div className="btn-row">
          <button
            type="button"
            className="btn btn--secondary"
            disabled={busy}
            onClick={async () => {
              if (await send(sentTo)) toast.success(t('login.resent'));
            }}
          >
            {t('login.resend')}
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => setSentTo(null)}>
            {t('login.otherEmail')}
          </button>
        </div>
      </section>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Field label={t('login.email')} hint={t('login.emailHint')} error={error}>
        <input
          ref={inputRef}
          className="input"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <button type="submit" className="btn btn--large" disabled={busy} aria-disabled={busy}>
        <Icon name="mail" /> {busy ? t('common:status.sending') : t('login.sendLink')}
      </button>
    </form>
  );
}

/**
 * Anmeldung mit E-Mail und Passwort – nur für Konten, die ein Passwort haben (z. B. Verwaltung).
 * Die Fehlermeldung verrät nicht, ob es die E-Mail-Adresse gibt.
 */
function PasswordLogin() {
  const { t } = useTranslation('auth');
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const value = email.trim();
    if (!EMAIL_RE.test(value)) {
      setErrors({ email: t('login.emailInvalid') });
      emailRef.current?.focus();
      return;
    }
    if (!password) {
      setErrors({ password: t('login.passwordRequired') });
      passwordRef.current?.focus();
      return;
    }
    setErrors({});
    setBusy(true);
    let status: number | undefined;
    try {
      const { error: err } = await authClient.signIn.email({ email: value, password });
      status = err ? (err.status ?? 500) : undefined;
    } catch {
      status = 0;
    }
    setBusy(false);
    if (status === undefined) {
      // Die Seite leitet weiter, sobald die Anmeldung bekannt ist
      await qc.invalidateQueries({ queryKey: ['me'] });
      return;
    }
    const message =
      status === 429
        ? t('common:errors.rate_limited')
        : status === 401 || status === 400
          ? t('login.passwordWrong')
          : status === 403
            ? t('login.accountBlocked')
            : t('login.failed');
    setErrors({ password: message });
    passwordRef.current?.focus();
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <p>{t('login.passwordWhy')}</p>
      <Field label={t('login.email')} hint={t('login.emailHint')} error={errors.email}>
        <input
          ref={emailRef}
          className="input"
          type="email"
          name="email"
          autoComplete="username"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Field label={t('login.password')} error={errors.password}>
        <input
          ref={passwordRef}
          className="input"
          type={show ? 'text' : 'password'}
          name="password"
          autoComplete="current-password"
          autoCapitalize="none"
          spellCheck={false}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <div className="field">
        <label className="choice">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
          <Icon name="eye" /> {t('login.showPassword')}
        </label>
      </div>
      <button type="submit" className="btn btn--large" disabled={busy} aria-disabled={busy}>
        <Icon name="lock" /> {busy ? t('login.signingIn') : t('login.signIn')}
      </button>
    </form>
  );
}

function SmsLogin({ next }: { next: string }) {
  const { t } = useTranslation('auth');
  const toast = useToast();
  const qc = useQueryClient();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const normalized = () => phone.replace(/[\s/()-]/g, '').replace(/^00/, '+').replace(/^0/, '+49');

  async function sendCode(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const n = normalized();
    if (!/^\+[1-9]\d{7,14}$/.test(n)) {
      setError(t('login.phoneInvalid'));
      return;
    }
    setError(null);
    setBusy(true);
    const { error: err } = await authClient.phoneNumber.sendOtp({ phoneNumber: n });
    setBusy(false);
    if (err) {
      toast.error(err.status === 429 ? t('common:errors.rate_limited') : t('login.failed'));
      return;
    }
    toast.success(t('login.codeSent'));
    setStep('code');
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const { error: err } = await authClient.phoneNumber.verify({ phoneNumber: normalized(), code: code.trim() });
    setBusy(false);
    if (err) {
      setError(t('login.codeWrong'));
      return;
    }
    await qc.invalidateQueries({ queryKey: ['me'] });
    setDone(true);
  }

  if (done) return <Navigate to={next} replace />;

  if (step === 'phone') {
    return (
      <form onSubmit={sendCode} noValidate>
        <p>{t('login.smsWhy')}</p>
        <Field label={t('login.phone')} hint={t('login.phoneHint')} error={error}>
          <input className="input" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <button type="submit" className="btn btn--large" disabled={busy}>
          <Icon name="phone" /> {t('login.sendCode')}
        </button>
      </form>
    );
  }
  return (
    <form onSubmit={verify} noValidate>
      <Field label={t('login.code')} hint={t('login.codeHint')} error={error}>
        <input
          className="input input--short"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        />
      </Field>
      <div className="btn-row">
        <button type="submit" className="btn btn--large" disabled={busy}>
          {t('login.verify')}
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => setStep('phone')}>
          {t('common:actions.back')}
        </button>
      </div>
    </form>
  );
}
