import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import type { Place } from '../api/types';
import type { SearchLocation } from '../api/types-walks';
import { Field } from './Field';
import { Icon } from './Icon';

/**
 * Ortssuche: Postleitzahl oder Ortsname eingeben. Bei mehreren passenden Orten erscheint
 * eine Auswahlliste (große Knöpfe, keine aufklappende Liste).
 * Der Browser-Standort wird NUR nach einem erklärenden Satz und einem Klick abgefragt
 * und nicht gespeichert.
 */
export function PlaceSearch({
  initialText = '',
  onSelect,
  allowLocation = true,
  submitLabel,
}: {
  initialText?: string;
  onSelect: (loc: SearchLocation) => void;
  allowLocation?: boolean;
  submitLabel?: string;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(initialText);
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<Place[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [locBusy, setLocBusy] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const choicesRef = useRef<HTMLHeadingElement>(null);

  function pick(p: Place) {
    setChoices(null);
    setText(`${p.postalCode} ${p.city}`);
    onSelect({ type: 'postal', postalCode: p.postalCode, label: `${p.postalCode} ${p.city}` });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const q = text.trim();
    setChoices(null);
    const plz = q.match(/^(\d{5})\b/)?.[1];
    if (!q || (q.length < 2 && !plz)) {
      setError(t('search.placeRequired'));
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    try {
      if (plz) {
        const { place } = await api.get<{ place: Place }>(`/geo/postal/${plz}`);
        setError(null);
        pick(place);
        return;
      }
      const { places } = await api.get<{ places: Place[] }>(`/geo/search?q=${encodeURIComponent(q)}`);
      if (places.length === 0) {
        setError(t('search.placeNotFound', { q }));
        inputRef.current?.focus();
      } else if (places.length === 1) {
        setError(null);
        pick(places[0]);
      } else {
        setError(null);
        setChoices(places.slice(0, 8));
        setTimeout(() => choicesRef.current?.focus(), 0);
      }
    } catch (err) {
      setError(err instanceof ApiError && err.code === 'postal_code_unknown' ? t('errors.postal_code_unknown') : t('errors.network'));
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  function requestLocation() {
    if (!('geolocation' in navigator)) {
      setLocError(t('search.locationUnavailable'));
      return;
    }
    setLocBusy(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocBusy(false);
        setText('');
        setChoices(null);
        onSelect({ type: 'coords', lat: pos.coords.latitude, lon: pos.coords.longitude, label: t('search.myLocation') });
      },
      (err) => {
        setLocBusy(false);
        setLocError(err.code === err.PERMISSION_DENIED ? t('search.locationDenied') : t('search.locationUnavailable'));
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
    );
  }

  return (
    <div className="place-search">
      <form onSubmit={onSubmit} noValidate className="place-search__form" role="search">
        <Field label={t('search.placeLabel')} hint={t('search.placeHint')} error={error}>
          <input
            ref={inputRef}
            className="input"
            type="text"
            name="ort"
            autoComplete="postal-code"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </Field>
        <button type="submit" className="btn" disabled={busy}>
          <Icon name="search" /> {busy ? t('status.loading') : (submitLabel ?? t('search.submit'))}
        </button>
      </form>

      {choices ? (
        <div className="place-choices">
          <h3 ref={choicesRef} tabIndex={-1}>
            {t('search.whichPlace')}
          </h3>
          <ul className="plain-list place-choices__list">
            {choices.map((p) => (
              <li key={`${p.postalCode}-${p.city}`}>
                <button type="button" className="btn btn--secondary btn--block place-choice" onClick={() => pick(p)}>
                  <Icon name="pin" />
                  <span>
                    <strong>
                      {p.postalCode} {p.city}
                    </strong>
                    {p.district && p.district !== p.city ? <span className="place-choice__district"> – {p.district}</span> : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {allowLocation ? (
        <div className="place-search__location">
          <p className="place-search__location-text">
            <Icon name="info" className="inline-icon" /> {t('search.locationExplain')}
          </p>
          <button type="button" className="btn btn--secondary" onClick={requestLocation} disabled={locBusy}>
            <Icon name="pin" /> {locBusy ? t('search.locating') : t('search.useLocation')}
          </button>
          {locError ? (
            <p className="field__error" role="alert">
              <Icon name="warning" /> {locError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
