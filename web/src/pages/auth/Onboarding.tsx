import { FONT_SCALES } from '@gehmeinsam/shared';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { Me, Place } from '../../api/types';
import { Field } from '../../components/Field';
import { Icon } from '../../components/Icon';
import { PageHeader } from '../../components/PageHeader';
import { applyFontScale } from '../../components/SettingsApplier';
import { useAction } from '../../hooks/useAction';
import { useMe, useSetMe } from '../../hooks/useMe';
import { safeNext } from './Login';

/** Erste Angaben nach der Registrierung: Name, PLZ, freiwillig Geschlecht, Anrede, Schriftgröße. */
export default function Onboarding() {
  const { t } = useTranslation('auth');
  const { data: me } = useMe();
  const setMe = useSetMe();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('weiter'));

  const [name, setName] = useState(me?.displayName ?? '');
  const [plz, setPlz] = useState(me?.postalCode ?? '');
  const [gender, setGender] = useState<string>(me?.gender ?? '');
  const [anrede, setAnrede] = useState(me?.settings.anrede ?? 'sie');
  const [font, setFont] = useState(me?.settings.fontScale ?? 'normal');
  const [errors, setErrors] = useState<{ name?: string; plz?: string }>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const plzRef = useRef<HTMLInputElement>(null);

  const place = useQuery({
    queryKey: ['plz', plz],
    queryFn: () => api.get<{ place: Place }>(`/geo/postal/${plz}`).then((r) => r.place),
    enabled: /^\d{5}$/.test(plz),
    retry: false,
  });

  const save = useAction({
    fn: async () => {
      await api.patch('/me/settings', { anrede, fontScale: font });
      return api.patch<{ me: Me }>('/me/profile', {
        displayName: name.trim(),
        postalCode: plz,
        gender: gender || null,
        completeOnboarding: true,
      });
    },
    success: () => t('onboarding.done', { name: name.trim() }),
    onSuccess: (r) => {
      setMe(r.me);
      navigate(next, { replace: true });
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!name.trim()) errs.name = t('onboarding.nameRequired');
    if (!/^\d{5}$/.test(plz)) errs.plz = t('onboarding.postalCodeRequired');
    else if (place.isError) errs.plz = t('common:errors.postal_code_unknown');
    setErrors(errs);
    if (errs.name) return nameRef.current?.focus();
    if (errs.plz) return plzRef.current?.focus();
    if (!save.isPending) save.mutate(undefined);
  }

  return (
    <div style={{ maxWidth: '42rem' }}>
      <PageHeader title={t('onboarding.title')} lead={t('onboarding.lead')} />
      <form onSubmit={onSubmit} noValidate>
        <Field label={t('onboarding.name')} hint={t('onboarding.nameHint')} error={errors.name}>
          <input ref={nameRef} className="input" autoComplete="given-name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('onboarding.postalCode')} hint={t('onboarding.postalCodeHint')} error={errors.plz}>
          <input
            ref={plzRef}
            className="input input--short"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={5}
            value={plz}
            onChange={(e) => setPlz(e.target.value.replace(/\D/g, ''))}
          />
        </Field>
        <p role="status" className="field__hint" style={{ marginTop: '-1rem' }}>
          {place.data ? (
            <>
              <Icon name="pin" className="inline-icon" /> {t('onboarding.placeFound', { city: place.data.city })}
            </>
          ) : null}
        </p>

        <fieldset className="field">
          <legend>{t('onboarding.anrede')}</legend>
          <div className="choice-list choice-list--row">
            {(['sie', 'du'] as const).map((a) => (
              <label key={a} className="choice">
                <input type="radio" name="anrede" checked={anrede === a} onChange={() => setAnrede(a)} />
                {t(`onboarding.anrede_${a}`)}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="field">
          <legend>{t('onboarding.fontScale')}</legend>
          <div className="choice-list choice-list--row">
            {FONT_SCALES.map((f) => (
              <label key={f} className="choice">
                <input
                  type="radio"
                  name="font"
                  checked={font === f}
                  onChange={() => {
                    setFont(f);
                    applyFontScale(f);
                  }}
                />
                {t(`profile:settings.font_${f}`)}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="field">
          <legend>
            {t('onboarding.gender')} <span className="field__hint" style={{ display: 'inline' }}>({t('onboarding.more')})</span>
          </legend>
          <span className="field__hint">{t('onboarding.genderHint')}</span>
          <div className="choice-list choice-list--row">
            {['', 'woman', 'man', 'diverse'].map((g) => (
              <label key={g || 'none'} className="choice">
                <input type="radio" name="gender" checked={gender === g} onChange={() => setGender(g)} />
                {t(`onboarding.gender_${g || 'none'}`)}
              </label>
            ))}
          </div>
        </fieldset>

        <button type="submit" className="btn btn--large" disabled={save.isPending}>
          {save.isPending ? t('common:status.saving') : t('onboarding.submit')} <Icon name="arrowRight" />
        </button>
      </form>
    </div>
  );
}
