import { FONT_SCALES, PROFILE_VISIBILITIES } from '@gehmeinsam/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { authClient } from '../../api/auth';
import { api, apiUrl } from '../../api/client';
import type { Me } from '../../api/types';
import { Field } from '../../components/Field';
import { Icon } from '../../components/Icon';
import { Loading } from '../../components/Loading';
import { PageHeader } from '../../components/PageHeader';
import { applyFontScale, writeLocalPref } from '../../components/SettingsApplier';
import { useToast } from '../../components/Toast';
import { useAction } from '../../hooks/useAction';
import { useMe, useSetMe } from '../../hooks/useMe';

export default function Settings() {
  const { t } = useTranslation('profile');
  const { data: me } = useMe();
  const setMe = useSetMe();
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState('');
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const update = useAction({
    fn: (patch: Partial<Me['settings']>) => api.patch<{ me: Me }>('/me/settings', patch),
    success: t('settings.saved'),
    onSuccess: (r) => setMe(r.me),
  });

  const del = useAction({
    fn: () => api.del('/me', { confirm: 'LÖSCHEN' }),
    success: t('settings.deleted'),
    onSuccess: () => {
      qc.clear();
      setMe(null);
      navigate('/', { replace: true });
    },
  });

  if (!me) return <Loading />;
  const s = me.settings;

  /** Auswahl sofort anzeigen (nicht erst nach der Server-Antwort); bei Fehler den gespeicherten Stand neu laden. */
  function save(patch: Partial<Me['settings']>) {
    if (!me) return;
    setMe({ ...me, settings: { ...me.settings, ...patch } });
    update.mutate(patch, { onError: () => void qc.invalidateQueries({ queryKey: ['me'] }) });
  }

  async function signOut(all: boolean) {
    if (all) await authClient.revokeSessions();
    await authClient.signOut();
    qc.clear();
    setMe(null);
    toast.success(t('settings.signedOut'));
    navigate('/', { replace: true });
  }

  function onDelete(e: FormEvent) {
    e.preventDefault();
    if (confirm.trim() !== 'LÖSCHEN') {
      setConfirmError(t('settings.deleteConfirmWrong'));
      return;
    }
    setConfirmError(null);
    if (!del.isPending) del.mutate(undefined);
  }

  return (
    <div style={{ maxWidth: '48rem' }}>
      <p>
        <Link to="/profil">
          <Icon name="arrowLeft" className="inline-icon" /> {t('common:actions.back')}
        </Link>
      </p>
      <PageHeader title={t('settings.title')} lead={t('settings.lead')} />

      <section className="card stack" aria-labelledby="s-display">
        <h2 id="s-display">{t('settings.display')}</h2>
        <fieldset className="field">
          <legend>{t('settings.fontScale')}</legend>
          <div className="choice-list choice-list--row">
            {FONT_SCALES.map((f) => (
              <label key={f} className="choice">
                <input
                  type="radio"
                  name="font"
                  checked={s.fontScale === f}
                  onChange={() => {
                    applyFontScale(f);
                    writeLocalPref('fontScale', f);
                    save({ fontScale: f });
                  }}
                />
                <span style={{ fontSize: f === 'normal' ? '1rem' : f === 'gross' ? '1.15rem' : '1.3rem' }}>{t(`settings.font_${f}`)}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="field">
          <legend>{t('settings.anrede')}</legend>
          <div className="choice-list choice-list--row">
            {(['sie', 'du'] as const).map((a) => (
              <label key={a} className="choice">
                <input type="radio" name="anrede" checked={s.anrede === a} onChange={() => save({ anrede: a })} />
                {t(`settings.anrede_${a}`)}
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="card stack" aria-labelledby="s-privacy">
        <h2 id="s-privacy">{t('settings.privacy')}</h2>
        <p>
          <Link to="/wer-sieht-was">
            <Icon name="eye" className="inline-icon" /> {t('settings.whoSeesWhatLink')}
          </Link>
        </p>
        <fieldset className="field">
          <legend>{t('settings.profileVisibility')}</legend>
          <div className="choice-list">
            {PROFILE_VISIBILITIES.map((v) => (
              <label key={v} className="choice">
                <input type="radio" name="pv" checked={s.profileVisibility === v} onChange={() => save({ profileVisibility: v })} />
                <span className="choice__text">
                  <strong>{t(`settings.profile_${v}`)}</strong>
                  {t(`settings.profile_${v}_hint`)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="field">
          <legend>{t('settings.leaderboard')}</legend>
          <div className="choice-list">
            {(['display', 'hidden'] as const).map((v) => (
              <label key={v} className="choice">
                <input type="radio" name="lb" checked={s.leaderboardMode === v} onChange={() => save({ leaderboardMode: v })} />
                {t(`settings.leaderboard_${v}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="switch">
          <input
            type="checkbox"
            role="switch"
            checked={s.emailNotifications}
            onChange={(e) => save({ emailNotifications: e.target.checked })}
          />
          <span>{t('settings.emailNotifications')}</span>
        </label>
      </section>

      <section className="card stack" aria-labelledby="s-account">
        <h2 id="s-account">{t('settings.account')}</h2>
        <p>{t('settings.signedInAs', { who: me.email ?? me.phoneNumber ?? '' })}</p>
        <div className="btn-row">
          <button type="button" className="btn btn--secondary" onClick={() => signOut(false)}>
            <Icon name="logout" /> {t('settings.signOut')}
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => signOut(true)}>
            {t('settings.signOutAll')}
          </button>
        </div>
      </section>

      <section className="card stack" aria-labelledby="s-data">
        <h2 id="s-data">{t('settings.yourData')}</h2>
        <p>{t('settings.exportHint')}</p>
        <a className="btn btn--secondary" href={apiUrl('/me/export')} download>
          <Icon name="download" /> {t('settings.export')}
        </a>
        <h3>{t('settings.delete')}</h3>
        <p>{t('settings.deleteHint')}</p>
        <form onSubmit={onDelete} noValidate>
          <Field label={t('settings.deleteConfirmLabel')} error={confirmError}>
            <input className="input input--short" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          </Field>
          <button type="submit" className="btn btn--danger" disabled={del.isPending}>
            <Icon name="trash" /> {t('settings.deleteButton')}
          </button>
        </form>
      </section>
    </div>
  );
}
