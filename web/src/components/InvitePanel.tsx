import { useQuery } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { groupsApi, qk } from '../api/walks';
import { useAction } from '../hooks/useAction';
import { Field } from './Field';
import { Icon } from './Icon';
import { LoadError, Loading } from './Loading';
import { useToast } from './Toast';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Einladen: Link kopieren, E-Mail, WhatsApp, Code, Aushang drucken. Nur für aktive Mitglieder. */
export function InvitePanel({ groupId, headingLevel = 3 }: { groupId: string; headingLevel?: 2 | 3 | 4 }) {
  const { t } = useTranslation('groups');
  const H = `h${headingLevel}` as 'h2' | 'h3' | 'h4';
  const toast = useToast();
  const q = useQuery({ queryKey: qk.invite(groupId), queryFn: () => groupsApi.invite(groupId) });
  const linkRef = useRef<HTMLInputElement>(null);
  const [emails, setEmails] = useState('');
  const [message, setMessage] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);

  const send = useAction({
    fn: (body: { emails: string[]; message?: string }) => api.post<{ sent: number }>(`/groups/${groupId}/invite/email`, body),
    success: (r) => t('invite.emailSent', { count: r.sent }),
    onSuccess: () => {
      setEmails('');
      setMessage('');
    },
  });

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <LoadError error={q.error} onRetry={() => q.refetch()} />;
  const inv = q.data;

  async function copy() {
    try {
      await navigator.clipboard.writeText(inv.url);
      toast.success(t('invite.copied'));
    } catch {
      linkRef.current?.select();
      toast.success(t('invite.copyManually'));
    }
  }

  function onSend(e: FormEvent) {
    e.preventDefault();
    const list = emails
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length === 0) return setEmailError(t('invite.emailRequired'));
    if (list.length > 10) return setEmailError(t('invite.emailTooMany'));
    const bad = list.find((m) => !EMAIL_RE.test(m));
    if (bad) return setEmailError(t('invite.emailInvalid', { email: bad }));
    setEmailError(null);
    if (!send.isPending) send.mutate({ emails: list, message: message.trim() || undefined });
  }

  return (
    <div className="invite-panel">
      <div className="invite-panel__grid">
        <section className="invite-option">
          <H>
            <Icon name="link" className="inline-icon" /> {t('invite.linkTitle')}
          </H>
          <p>{t('invite.linkText')}</p>
          <label className="visually-hidden" htmlFor={`invite-url-${groupId}`}>
            {t('invite.linkTitle')}
          </label>
          <input id={`invite-url-${groupId}`} ref={linkRef} className="input" readOnly value={inv.url} onFocus={(e) => e.target.select()} />
          <div className="btn-row" style={{ marginTop: 'var(--space-3)' }}>
            <button type="button" className="btn" onClick={copy}>
              <Icon name="link" /> {t('invite.copy')}
            </button>
            <a className="btn btn--secondary" href={inv.whatsappUrl} target="_blank" rel="noopener noreferrer">
              <Icon name="phone" /> {t('invite.whatsapp')}
              <span className="visually-hidden"> {t('common:newWindow')}</span>
            </a>
          </div>
        </section>

        <section className="invite-option">
          <H>
            <Icon name="qr" className="inline-icon" /> {t('invite.codeTitle')}
          </H>
          <p>{t('invite.codeText')}</p>
          <p className="invite-code" aria-label={t('invite.codeAria', { code: inv.code.split('').join(' ') })}>
            {inv.code}
          </p>
          <Link className="btn btn--secondary" to={`/gruppen/${groupId}/aushang`}>
            <Icon name="print" /> {t('invite.poster')}
          </Link>
        </section>
      </div>

      <section className="invite-option">
        <H>
          <Icon name="mail" className="inline-icon" /> {t('invite.emailTitle')}
        </H>
        <form onSubmit={onSend} noValidate>
          <Field label={t('invite.emailLabel')} hint={t('invite.emailHint')} error={emailError}>
            <textarea className="textarea textarea--short" value={emails} onChange={(e) => setEmails(e.target.value)} />
          </Field>
          <Field label={t('invite.messageLabel')} optional>
            <textarea className="textarea textarea--short" value={message} maxLength={500} onChange={(e) => setMessage(e.target.value)} />
          </Field>
          <div className="btn-row">
            <button type="submit" className="btn" disabled={send.isPending}>
              <Icon name="mail" /> {send.isPending ? t('common:status.sending') : t('invite.emailSend')}
            </button>
            <a className="btn btn--ghost" href={inv.mailtoUrl}>
              {t('invite.ownMail')}
            </a>
          </div>
        </form>
      </section>
    </div>
  );
}
