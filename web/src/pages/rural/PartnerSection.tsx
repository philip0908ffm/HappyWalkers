import { TEMPOS, type Tempo } from '@gehmeinsam/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import type { MyPartnerOffer, PartnerOffer, PartnerRequest } from '../../api/types-e';
import { Explain } from '../../components/Explain';
import { Field } from '../../components/Field';
import { Icon } from '../../components/Icon';
import { LoadError, Loading } from '../../components/Loading';
import { useAction } from '../../hooks/useAction';
import { useMe } from '../../hooks/useMe';
import { formatDateTime, toDateInput } from '../../lib/format';
import { ConfirmDialogE } from '../profile/parts/ConfirmDialogE';
import { PersonAvatar } from '../profile/parts/PersonAvatar';

/** „Gehpartner finden“: eigenes Gesuch, Gesuche in der Nähe, Anfragen (annehmen → Termin festlegen). */
export function PartnerSection({ radius }: { radius: number }) {
  const { t } = useTranslation('rural');
  return (
    <section id="gehpartner" aria-labelledby="gehpartner-h" className="card stack section-e">
      <h2 id="gehpartner-h">
        {t('partner.title')} <Explain term={t('partner.term')}>{t('partner.explain')}</Explain>
      </h2>
      <p>{t('partner.intro')}</p>
      <Requests />
      <OffersNearby radius={radius} />
      <MyOffer />
    </section>
  );
}

function MyOffer() {
  const { t } = useTranslation('rural');
  const { data: me } = useMe();
  const q = useQuery({
    queryKey: ['rural', 'partner-offer'],
    queryFn: () => api.get<{ offer: MyPartnerOffer | null }>('/rural/partner-offer').then((r) => r.offer),
  });
  const [plz, setPlz] = useState(me?.postalCode ?? '');
  const [tempo, setTempo] = useState<Tempo>('zuegig');
  const [availability, setAvailability] = useState('');
  const [note, setNote] = useState('');
  const [active, setActive] = useState(true);
  const [errors, setErrors] = useState<{ plz?: string; availability?: string }>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!q.data) return;
    setPlz(q.data.postalCode);
    setTempo(q.data.tempo);
    setAvailability(q.data.availability ?? '');
    setNote(q.data.note ?? '');
    setActive(q.data.active);
  }, [q.data]);

  const save = useAction({
    fn: () => api.put('/rural/partner-offer', { postalCode: plz, tempo, availability: availability.trim(), note: note.trim(), active }),
    success: () => (active ? t('partner.offerSaved') : t('partner.offerPaused')),
    invalidate: [['rural']],
  });
  const del = useAction({
    fn: () => api.del('/rural/partner-offer'),
    success: t('partner.offerDeleted'),
    invalidate: [['rural']],
    onSuccess: () => {
      setConfirmDelete(false);
      setAvailability('');
      setNote('');
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!/^\d{5}$/.test(plz)) errs.plz = t('partner.plzInvalid');
    if (!availability.trim()) errs.availability = t('partner.availabilityRequired');
    setErrors(errs);
    if (errs.plz) return document.getElementById('offer-plz')?.focus();
    if (errs.availability) return document.getElementById('offer-avail')?.focus();
    if (!save.isPending) save.mutate(undefined);
  }

  return (
    <div className="subsection-e">
      <h3>{q.data ? t('partner.myOfferTitleEdit') : t('partner.myOfferTitle')}</h3>
      {q.isLoading ? (
        <Loading />
      ) : (
        <form onSubmit={submit} noValidate>
          <p className="field__hint">{t('partner.offerPrivacy')}</p>
          <Field label={t('partner.plz')} error={errors.plz}>
            <input
              id="offer-plz"
              className="input input--short"
              inputMode="numeric"
              maxLength={5}
              value={plz}
              onChange={(e) => setPlz(e.target.value.replace(/\D/g, ''))}
            />
          </Field>
          <fieldset className="field">
            <legend>{t('common:tempo.label')}</legend>
            <div className="choice-list">
              {TEMPOS.map((tp) => (
                <label key={tp} className="choice">
                  <input type="radio" name="offer-tempo" checked={tempo === tp} onChange={() => setTempo(tp)} />
                  <span className="choice__text">
                    <strong>{t(`common:tempo.${tp}`)}</strong>
                    {t(`common:tempo.${tp}_hint`)}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <Field label={t('partner.availability')} hint={t('partner.availabilityHint')} error={errors.availability}>
            <input id="offer-avail" className="input" maxLength={200} value={availability} onChange={(e) => setAvailability(e.target.value)} />
          </Field>
          <Field label={t('partner.note')} hint={t('partner.noteHint')} optional>
            <textarea className="textarea" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="field">
            <label className="switch">
              <input type="checkbox" role="switch" checked={active} onChange={(e) => setActive(e.target.checked)} />
              <span>{t('partner.active')}</span>
            </label>
            <span className="field__hint">{t('partner.activeHint')}</span>
          </div>
          <div className="btn-row">
            <button type="submit" className="btn" disabled={save.isPending}>
              <Icon name="check" /> {save.isPending ? t('common:status.saving') : q.data ? t('partner.offerUpdate') : t('partner.offerCreate')}
            </button>
            {q.data ? (
              <button type="button" className="btn btn--ghost" onClick={() => setConfirmDelete(true)}>
                <Icon name="trash" /> {t('partner.offerDelete')}
              </button>
            ) : null}
          </div>
        </form>
      )}
      <ConfirmDialogE
        open={confirmDelete}
        title={t('partner.offerDeleteTitle')}
        confirmLabel={t('partner.offerDeleteConfirm')}
        danger
        pending={del.isPending}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => del.mutate(undefined)}
      >
        <p>{t('partner.offerDeleteText')}</p>
      </ConfirmDialogE>
    </div>
  );
}

function OffersNearby({ radius }: { radius: number }) {
  const { t } = useTranslation('rural');
  const q = useQuery({
    queryKey: ['rural', 'partners', radius],
    queryFn: () => api.get<{ offers: PartnerOffer[] }>(`/rural/partners?radiusKm=${radius}`).then((r) => r.offers),
  });
  const [target, setTarget] = useState<PartnerOffer | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const send = useAction({
    fn: (o: PartnerOffer) => api.post(`/rural/partners/${o.id}/request`, { message: message.trim() }),
    success: (_r, o) => t('partner.requestSent', { name: o.person.displayName }),
    invalidate: [['rural', 'partner-requests']],
    onSuccess: () => {
      setTarget(null);
      setMessage('');
    },
  });
  const others = (q.data ?? []).filter((o) => !o.isMine);

  return (
    <div className="subsection-e">
      <h3>{t('partner.nearbyTitle', { km: radius })}</h3>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <LoadError error={q.error} onRetry={() => q.refetch()} />
      ) : others.length ? (
        <ul className="plain-list offer-list-e">
          {others.map((o) => (
            <li key={o.id} className="offer-e">
              <div className="offer-e__head">
                <PersonAvatar name={o.person.displayName} url={o.person.avatarUrl} />
                <div>
                  <strong className="offer-e__name">{o.person.displayName}</strong>
                  <span className="offer-e__meta">
                    {[o.city, t('partner.distance', { km: o.distanceKm }), t(`common:tempo.${o.tempo}`)].filter(Boolean).join(' · ')}
                  </span>
                </div>
              </div>
              <p>
                <strong>{t('partner.availability')}:</strong> {o.availability}
              </p>
              {o.note ? <p className="note-e">{o.note}</p> : null}
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setTarget(o);
                  setError(null);
                }}
              >
                <Icon name="mail" /> {t('partner.sendRequest', { name: o.person.displayName })}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted-text">{t('partner.nearbyEmpty')}</p>
      )}
      <ConfirmDialogE
        open={!!target}
        title={target ? t('partner.requestTitle', { name: target.person.displayName }) : ''}
        confirmLabel={t('partner.requestConfirm')}
        pending={send.isPending}
        onClose={() => setTarget(null)}
        onConfirm={() => {
          if (!message.trim()) return setError(t('partner.messageRequired'));
          if (target) send.mutate(target);
        }}
      >
        <p>{t('partner.requestPrivacy')}</p>
        <Field label={t('partner.message')} hint={t('partner.messageHint')} error={error}>
          <textarea className="textarea" maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} />
        </Field>
      </ConfirmDialogE>
    </div>
  );
}

function Requests() {
  const { t } = useTranslation('rural');
  const q = useQuery({
    queryKey: ['rural', 'partner-requests'],
    queryFn: () => api.get<{ incoming: PartnerRequest[]; outgoing: PartnerRequest[] }>('/rural/partner-requests'),
  });
  const [accepting, setAccepting] = useState<PartnerRequest | null>(null);
  const [declining, setDeclining] = useState<PartnerRequest | null>(null);
  const decline = useAction({
    fn: (r: PartnerRequest) => api.post(`/rural/partner-requests/${r.id}/decline`),
    success: t('partner.declined'),
    invalidate: [['rural', 'partner-requests']],
    onSuccess: () => setDeclining(null),
  });

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <LoadError error={q.error} onRetry={() => q.refetch()} />;
  const { incoming, outgoing } = q.data;
  const openIncoming = incoming.filter((r) => r.status === 'pending');
  if (!incoming.length && !outgoing.length) return null;

  return (
    <div className="subsection-e">
      <h3>{t('partner.requestsTitle')}</h3>
      {incoming.length ? (
        <>
          <h4>{t('partner.incoming', { count: openIncoming.length })}</h4>
          <ul className="plain-list offer-list-e">
            {incoming.map((r) => (
              <li key={r.id} className="offer-e">
                <div className="offer-e__head">
                  <PersonAvatar name={r.from.displayName} url={r.from.avatarUrl} />
                  <div>
                    <strong className="offer-e__name">{r.from.displayName}</strong>
                    <span className="offer-e__meta">{formatDateTime(r.createdAt)}</span>
                  </div>
                </div>
                {r.message ? <p className="note-e">{r.message}</p> : null}
                {r.status === 'pending' ? (
                  <div className="btn-row">
                    <button type="button" className="btn" onClick={() => setAccepting(r)}>
                      <Icon name="calendar" /> {t('partner.acceptAndPlan')}
                    </button>
                    <button type="button" className="btn btn--secondary" onClick={() => setDeclining(r)}>
                      {t('partner.decline')}
                    </button>
                  </div>
                ) : (
                  <RequestStatus r={r} />
                )}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {outgoing.length ? (
        <>
          <h4>{t('partner.outgoing')}</h4>
          <ul className="plain-list offer-list-e">
            {outgoing.map((r) => (
              <li key={r.id} className="offer-e">
                <strong className="offer-e__name">{t('partner.to', { name: r.to.displayName })}</strong>
                <RequestStatus r={r} />
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {accepting ? <AcceptDialog request={accepting} onClose={() => setAccepting(null)} /> : null}
      <ConfirmDialogE
        open={!!declining}
        title={declining ? t('partner.declineTitle', { name: declining.from.displayName }) : ''}
        confirmLabel={t('partner.declineConfirm')}
        pending={decline.isPending}
        onClose={() => setDeclining(null)}
        onConfirm={() => declining && decline.mutate(declining)}
      >
        <p>{t('partner.declineText')}</p>
      </ConfirmDialogE>
    </div>
  );
}

function RequestStatus({ r }: { r: PartnerRequest }) {
  const { t } = useTranslation('rural');
  return (
    <p className="offer-e__status">
      <Icon name={r.status === 'accepted' ? 'check' : r.status === 'declined' ? 'close' : 'clock'} className="inline-icon" />{' '}
      {t(`partner.status_${r.status}`, { defaultValue: r.status })}
      {r.walkId ? (
        <>
          {' – '}
          <Link to={`/walks/${r.walkId}`}>{t('partner.toWalk')}</Link>
        </>
      ) : null}
    </p>
  );
}

function AcceptDialog({ request, onClose }: { request: PartnerRequest; onClose: () => void }) {
  const { t } = useTranslation('rural');
  const tomorrow = new Date(Date.now() + 86_400_000);
  const [date, setDate] = useState(toDateInput(tomorrow));
  const [time, setTime] = useState('10:00');
  const [placeName, setPlaceName] = useState('');
  const [address, setAddress] = useState('');
  const [desc, setDesc] = useState('');
  const [duration, setDuration] = useState('60');
  const [tempo, setTempo] = useState<Tempo>('zuegig');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [walkId, setWalkId] = useState<string | null>(null);

  const accept = useAction({
    fn: () =>
      api.post<{ walkId: string }>(`/rural/partner-requests/${request.id}/accept`, {
        startsAt: new Date(`${date}T${time}`).toISOString(),
        meetingPointName: placeName.trim(),
        meetingAddress: address.trim(),
        meetingDescription: desc.trim() || undefined,
        durationMinutes: parseInt(duration, 10) || undefined,
        tempo,
      }),
    success: t('partner.accepted', { name: request.from.displayName }),
    invalidate: [['rural', 'partner-requests']],
    onSuccess: (r) => setWalkId(r.walkId),
  });

  function confirm() {
    const errs: Record<string, string> = {};
    const when = new Date(`${date}T${time}`);
    if (!date || !time || Number.isNaN(when.getTime())) errs.when = t('partner.whenRequired');
    else if (when.getTime() < Date.now()) errs.when = t('partner.whenPast');
    if (!placeName.trim()) errs.place = t('partner.placeRequired');
    if (!address.trim()) errs.address = t('partner.addressRequired');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    accept.mutate(undefined);
  }

  if (walkId) {
    return (
      <ConfirmDialogE open title={t('partner.plannedTitle')} confirmLabel={t('common:actions.close')} onConfirm={onClose} onClose={onClose}>
        <p>{t('partner.plannedText', { name: request.from.displayName })}</p>
        <p>
          <Link to={`/walks/${walkId}`} className="btn btn--secondary">
            <Icon name="calendar" /> {t('partner.toWalk')}
          </Link>
        </p>
      </ConfirmDialogE>
    );
  }

  return (
    <ConfirmDialogE
      open
      title={t('partner.acceptTitle', { name: request.from.displayName })}
      confirmLabel={t('partner.acceptConfirm')}
      pending={accept.isPending}
      onClose={onClose}
      onConfirm={confirm}
    >
      <p>{t('partner.acceptIntro')}</p>
      <div className="inline-fields">
        <Field label={t('partner.date')} error={errors.when}>
          <input type="date" className="input" min={toDateInput(new Date())} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t('partner.time')}>
          <input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
      <Field label={t('partner.placeName')} hint={t('partner.placeNameHint')} error={errors.place}>
        <input className="input" maxLength={120} value={placeName} onChange={(e) => setPlaceName(e.target.value)} />
      </Field>
      <Field label={t('partner.address')} error={errors.address}>
        <input className="input" maxLength={200} value={address} onChange={(e) => setAddress(e.target.value)} />
      </Field>
      <Field label={t('partner.placeDesc')} hint={t('partner.placeDescHint')} optional>
        <input className="input" maxLength={200} value={desc} onChange={(e) => setDesc(e.target.value)} />
      </Field>
      <Field label={t('partner.duration')}>
        <input className="input input--short" inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value.replace(/\D/g, ''))} />
      </Field>
      <fieldset className="field">
        <legend>{t('common:tempo.label')}</legend>
        <div className="choice-list choice-list--row">
          {TEMPOS.map((tp) => (
            <label key={tp} className="choice">
              <input type="radio" name="accept-tempo" checked={tempo === tp} onChange={() => setTempo(tp)} />
              {t(`common:tempo.${tp}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="field__hint">{t('partner.safetyHint')}</p>
    </ConfirmDialogE>
  );
}
