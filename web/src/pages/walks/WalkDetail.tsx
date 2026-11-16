import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiUrl } from '../../api/client';
import type { WalkDetail as Walk } from '../../api/types-walks';
import { groupsApi, qk, walksApi } from '../../api/walks';
import { PersonChip } from '../../components/Avatar';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Explain } from '../../components/Explain';
import { Field } from '../../components/Field';
import { GroupFeed } from '../../components/GroupFeed';
import { Icon } from '../../components/Icon';
import { JoinGroup } from '../../components/JoinGroup';
import { LoadError, Loading } from '../../components/Loading';
import { PageHeader } from '../../components/PageHeader';
import { TempoBadge } from '../../components/Tempo';
import { useAction } from '../../hooks/useAction';
import { useMe } from '../../hooks/useMe';
import { formatDate, formatDuration, formatKm, formatTime } from '../../lib/format';

export default function WalkDetail() {
  const { id = '' } = useParams();
  const { t } = useTranslation('walks');
  const q = useQuery({ queryKey: qk.walk(id), queryFn: () => walksApi.get(id) });

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data)
    return (
      <>
        <PageHeader title={t('detail.notFoundTitle')} />
        <LoadError error={q.error} onRetry={() => q.refetch()} />
        <Link to="/walks">{t('detail.backToList')}</Link>
      </>
    );
  return <WalkView walk={q.data} />;
}

function WalkView({ walk }: { walk: Walk }) {
  const { t } = useTranslation('walks');
  const { data: me } = useMe();
  const cancelled = walk.status === 'cancelled';
  const started = new Date(walk.startsAt).getTime() <= Date.now();
  const full = walk.maxParticipants != null && walk.participantCount >= walk.maxParticipants;

  // Mitgliedschaft nur nachladen, wenn der Treffpunkt fehlt (Beitreten-Knopf)
  const needsGroup = !!me && !!walk.group && !walk.canSeeMeetingPoint;
  const groupQ = useQuery({
    queryKey: qk.group(walk.group?.id ?? ''),
    queryFn: () => groupsApi.get(walk.group!.id),
    enabled: needsGroup,
  });
  const isMember = walk.group ? walk.canSeeMeetingPoint || groupQ.data?.myMembership?.status === 'active' : true;

  const place = [walk.city, walk.district && walk.district !== walk.city ? walk.district : null].filter(Boolean).join(', ');

  return (
    <div className="walk-detail">
      <p className="no-print">
        <Link to={walk.group ? `/gruppen/${walk.group.id}` : '/walks'}>
          <Icon name="arrowLeft" className="inline-icon" /> {walk.group ? t('detail.backToGroup', { name: walk.group.name }) : t('detail.backToList')}
        </Link>
      </p>
      <PageHeader
        title={walk.title}
        lead={
          walk.kind === 'distance'
            ? t('kind.distance')
            : walk.kind === 'partner'
              ? t('kind.partner')
              : walk.group
                ? t('detail.byGroup', { name: walk.group.name })
                : undefined
        }
      />

      {cancelled ? (
        <div className="notice notice--error" role="alert">
          <Icon name="warning" />
          <p>
            <strong>{t('detail.cancelledTitle')}</strong> {t('detail.cancelledText')}
          </p>
        </div>
      ) : null}

      <div className="detail-layout">
        <div className="detail-layout__main">
          <section className="card" aria-labelledby="facts-title">
            <h2 id="facts-title">{t('detail.factsTitle')}</h2>
            <dl className="facts">
              <div>
                <dt>
                  <Icon name="calendar" /> {t('detail.when')}
                </dt>
                <dd>
                  {formatDate(walk.startsAt)}
                  <br />
                  <strong className="facts__big">{formatTime(walk.startsAt)}</strong>
                </dd>
              </div>
              <div>
                <dt>
                  <Icon name="clock" /> {t('detail.duration')}
                </dt>
                <dd>{formatDuration(walk.durationMinutes)}</dd>
              </div>
              {walk.distanceKm != null ? (
                <div>
                  <dt>
                    <Icon name="route" /> {t('detail.distance')}
                  </dt>
                  <dd>{t('common:units.km', { value: formatKm(walk.distanceKm) })}</dd>
                </div>
              ) : null}
              <div>
                <dt>
                  <Icon name="walk" /> {t('common:tempo.label')}{' '}
                  <Explain term={t('common:tempo.label')}>{t('common:tempo.explain')}</Explain>
                </dt>
                <dd>
                  <TempoBadge tempo={walk.tempo} /> <span className="facts__hint">{t(`common:tempo.${walk.tempo}_hint`)}</span>
                </dd>
              </div>
              {place && walk.kind !== 'distance' ? (
                <div>
                  <dt>
                    <Icon name="pin" /> {t('detail.area')}
                  </dt>
                  <dd>{place}</dd>
                </div>
              ) : null}
              <div>
                <dt>
                  <Icon name="people2" /> {t('detail.participants')}
                </dt>
                <dd>
                  {walk.maxParticipants != null
                    ? t('card.participantsOf', { count: walk.participantCount, max: walk.maxParticipants })
                    : t('card.participants', { count: walk.participantCount })}
                </dd>
              </div>
              {walk.createdBy ? (
                <div>
                  <dt>
                    <Icon name="user" /> {t('detail.lead')}
                  </dt>
                  <dd>
                    <PersonChip person={walk.createdBy} />
                  </dd>
                </div>
              ) : null}
            </dl>
            {walk.description ? (
              <>
                <h3>{t('detail.about')}</h3>
                <p className="pre-line">{walk.description}</p>
              </>
            ) : null}
          </section>

          <MeetingPoint walk={walk} isMember={isMember} groupQ={groupQ.data} />

          {walk.participants && walk.participants.length ? (
            <section className="card" aria-labelledby="who-title">
              <h2 id="who-title">{t('detail.whoTitle')}</h2>
              <ul className="plain-list person-list">
                {walk.participants.map((p) => (
                  <li key={p.id}>
                    <PersonChip person={p} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {walk.kind === 'distance' && me && walk.myRsvp === 'yes' ? (
            <section className="card" aria-labelledby="dist-feed-title">
              <h2 id="dist-feed-title">{t('detail.distanceFeedTitle')}</h2>
              <p>{t('detail.distanceFeedText')}</p>
              <GroupFeed walkId={walk.id} canPost postVisibility="followers" headingLevel={3} />
            </section>
          ) : null}
        </div>

        <aside className="detail-layout__side" aria-label={t('detail.actionsLabel')}>
          <RsvpBox walk={walk} isMember={isMember} full={full} started={started} />
          {walk.canManage || walk.canConfirm ? <LeadBox walk={walk} started={started} /> : null}
        </aside>
      </div>
    </div>
  );
}

function MeetingPoint({ walk, isMember, groupQ }: { walk: Walk; isMember: boolean; groupQ?: Parameters<typeof JoinGroup>[0]['group'] }) {
  const { t } = useTranslation('walks');
  if (walk.kind === 'distance')
    return (
      <section className="card" aria-labelledby="mp-title">
        <h2 id="mp-title">
          <Icon name="globe" className="inline-icon" /> {t('detail.distanceTitle')}
        </h2>
        <p>{t('detail.distanceText')}</p>
      </section>
    );
  const mp = walk.meetingPoint;
  return (
    <section className="card" aria-labelledby="mp-title">
      <h2 id="mp-title">
        <Icon name="pin" className="inline-icon" /> {t('detail.meetingPoint')}
      </h2>
      {mp ? (
        <div className="meeting-point">
          {mp.name ? <p className="meeting-point__name">{mp.name}</p> : null}
          {mp.address ? <p className="meeting-point__address">{mp.address}</p> : null}
          {mp.description ? <p className="pre-line">{mp.description}</p> : null}
          {mp.lat != null && mp.lon != null ? (
            <p>
              <a href={`https://www.openstreetmap.org/?mlat=${mp.lat}&mlon=${mp.lon}#map=17/${mp.lat}/${mp.lon}`} target="_blank" rel="noopener noreferrer">
                <Icon name="map" className="inline-icon" /> {t('detail.openMap')}
                <span className="visually-hidden"> {t('common:newWindow')}</span>
              </a>
            </p>
          ) : null}
          {!mp.name && !mp.address && !mp.description ? <p>{t('detail.noMeetingPoint')}</p> : null}
        </div>
      ) : (
        <>
          <div className="notice notice--info">
            <Icon name="lock" />
            <p>{t('detail.meetingPointHidden')}</p>
          </div>
          {walk.group && !isMember ? (
            <JoinGroup
              group={
                groupQ ?? {
                  id: walk.group.id,
                  name: walk.group.name,
                  joinPolicy: walk.group.joinPolicy,
                  womenOnly: walk.group.womenOnly,
                  myMembership: null,
                }
              }
            />
          ) : null}
        </>
      )}
    </section>
  );
}

function RsvpBox({ walk, isMember, full, started }: { walk: Walk; isMember: boolean; full: boolean; started: boolean }) {
  const { t } = useTranslation('walks');
  const { data: me } = useMe();
  const [askCancel, setAskCancel] = useState(false);
  const [justJoined, setJustJoined] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const cancelled = walk.status === 'cancelled';

  const rsvp = useAction({
    fn: (status: 'yes' | 'no') => walksApi.rsvp(walk.id, status),
    success: (_r, s) => (s === 'yes' ? t('rsvp.yesToast') : t('rsvp.noToast')),
    invalidate: [qk.walks],
    onSuccess: (_r, s) => {
      setAskCancel(false);
      setJustJoined(s === 'yes');
    },
  });

  useEffect(() => {
    if (justJoined && walk.myRsvp === 'yes') headingRef.current?.focus();
  }, [justJoined, walk.myRsvp]);

  const tools = (
    <div className="btn-row rsvp-tools">
      <a className="btn btn--secondary" href={apiUrl(`/walks/${walk.id}/ics`)} download>
        <Icon name="calendar" /> {t('rsvp.toCalendar')}
      </a>
      {me ? (
        <Link className="btn btn--secondary" to={`/walks/${walk.id}/drucken`}>
          <Icon name="print" /> {t('rsvp.print')}
        </Link>
      ) : null}
    </div>
  );

  if (walk.myRsvp === 'yes' && !cancelled)
    return (
      <section className="rsvp-box rsvp-box--going" aria-labelledby="rsvp-title">
        <h2 id="rsvp-title" ref={headingRef} tabIndex={-1}>
          <Icon name="check" className="inline-icon" /> {t('rsvp.goingTitle')}
        </h2>
        <p className="rsvp-box__lead">{t('rsvp.goingText', { date: formatDate(walk.startsAt), time: formatTime(walk.startsAt) })}</p>
        {tools}
        {!started ? (
          <button type="button" className="btn btn--ghost" onClick={() => setAskCancel(true)}>
            <Icon name="close" /> {t('rsvp.no')}
          </button>
        ) : null}
        <ConfirmDialog
          open={askCancel}
          title={t('rsvp.noTitle')}
          confirmLabel={t('rsvp.noConfirm')}
          cancelLabel={t('rsvp.noKeep')}
          busy={rsvp.isPending}
          onConfirm={() => rsvp.mutate('no')}
          onCancel={() => setAskCancel(false)}
        >
          <p>{t('rsvp.noText')}</p>
        </ConfirmDialog>
      </section>
    );

  return (
    <section className="rsvp-box" aria-labelledby="rsvp-title">
      <h2 id="rsvp-title">{t('rsvp.title')}</h2>
      {cancelled ? (
        <p>{t('rsvp.cancelled')}</p>
      ) : started ? (
        <p>{t('rsvp.past')}</p>
      ) : !me ? (
        <>
          <p>{t('rsvp.signIn')}</p>
          <Link className="btn btn--large btn--block" to={`/anmelden?weiter=${encodeURIComponent(`/walks/${walk.id}`)}`}>
            <Icon name="user" /> {t('rsvp.signInButton')}
          </Link>
        </>
      ) : !isMember ? (
        <p>{t('rsvp.joinFirst')}</p>
      ) : full ? (
        <p>{t('rsvp.full')}</p>
      ) : (
        <>
          <p>{t('rsvp.text')}</p>
          <button type="button" className="btn btn--large btn--block" disabled={rsvp.isPending} onClick={() => rsvp.mutate('yes')}>
            <Icon name="check" /> {rsvp.isPending ? t('common:status.saving') : t('rsvp.yes')}
          </button>
        </>
      )}
      {!cancelled ? tools : null}
    </section>
  );
}

function LeadBox({ walk, started }: { walk: Walk; started: boolean }) {
  const { t } = useTranslation('walks');
  const navigate = useNavigate();
  const [askCancel, setAskCancel] = useState(false);
  const cancel = useAction({
    fn: () => walksApi.cancel(walk.id),
    success: t('lead.cancelDone'),
    invalidate: [qk.walks, qk.groups],
    onSuccess: () => setAskCancel(false),
  });
  const cancelled = walk.status === 'cancelled';

  return (
    <section className="card lead-box" aria-labelledby="lead-title">
      <h2 id="lead-title">
        <Icon name="settings" className="inline-icon" /> {t('lead.title')}
      </h2>
      {walk.canManage && !cancelled ? (
        <div className="btn-row">
          <button type="button" className="btn btn--secondary" onClick={() => navigate(`/walks/${walk.id}/bearbeiten`)}>
            <Icon name="edit" /> {t('lead.edit')}
          </button>
          {!started ? (
            <button type="button" className="btn btn--secondary btn--danger-outline" onClick={() => setAskCancel(true)}>
              <Icon name="close" /> {t('lead.cancel')}
            </button>
          ) : null}
        </div>
      ) : null}
      {walk.canConfirm && !cancelled ? <ConfirmWalk walk={walk} /> : null}
      {walk.canManage && !walk.canConfirm && !started && !cancelled ? <p className="field__hint">{t('lead.confirmLater')}</p> : null}
      <ConfirmDialog
        open={askCancel}
        title={t('lead.cancelTitle')}
        confirmLabel={t('lead.cancelConfirm')}
        cancelLabel={t('lead.cancelKeep')}
        danger
        busy={cancel.isPending}
        onConfirm={() => cancel.mutate(undefined)}
        onCancel={() => setAskCancel(false)}
      >
        <p>{t('lead.cancelText', { count: walk.participantCount })}</p>
      </ConfirmDialog>
    </section>
  );
}

function ConfirmWalk({ walk }: { walk: Walk }) {
  const { t } = useTranslation('walks');
  const [km, setKm] = useState(walk.distanceKm != null ? String(walk.distanceKm).replace('.', ',') : '');
  const [minutes, setMinutes] = useState(String(walk.durationMinutes));
  const people = walk.participants ?? [];
  const [checked, setChecked] = useState<Set<string>>(() => new Set(people.map((p) => p.id)));
  const [errors, setErrors] = useState<{ km?: string; minutes?: string; people?: string }>({});
  const [done, setDone] = useState<number | null>(null);
  const confirm = useAction({
    fn: (body: { distanceKm: number; durationMinutes: number; attendeeIds?: string[] }) => walksApi.confirm(walk.id, body),
    success: (r) => t('lead.confirmDone', { count: r.confirmedCount }),
    invalidate: [qk.walks],
    onSuccess: (r) => setDone(r.confirmedCount),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const k = Number(km.replace(',', '.'));
    const m = Number(minutes);
    const errs: typeof errors = {};
    if (!(k > 0 && k <= 100)) errs.km = t('lead.kmInvalid');
    if (!(Number.isInteger(m) && m >= 1 && m <= 1440)) errs.minutes = t('lead.minutesInvalid');
    if (people.length && checked.size === 0) errs.people = t('lead.peopleRequired');
    setErrors(errs);
    if (Object.keys(errs).length || confirm.isPending) return;
    confirm.mutate({ distanceKm: k, durationMinutes: m, attendeeIds: people.length ? [...checked] : undefined });
  }

  return (
    <div className="confirm-walk">
      <h3>
        {t('lead.confirmTitle')} <Explain term={t('lead.confirmTitle')}>{t('lead.confirmExplain')}</Explain>
      </h3>
      {walk.confirmed || done != null ? (
        <div className="notice notice--success" role="status">
          <Icon name="check" />
          <p>{done != null ? t('lead.confirmDone', { count: done }) : t('lead.alreadyConfirmed')}</p>
        </div>
      ) : null}
      <form onSubmit={onSubmit} noValidate>
        <Field label={t('lead.km')} hint={t('lead.kmHint')} error={errors.km}>
          <input className="input input--short" inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} />
        </Field>
        <Field label={t('lead.minutes')} error={errors.minutes}>
          <input className="input input--short" type="number" min={1} max={1440} inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
        </Field>
        {people.length ? (
          <fieldset className="field">
            <legend>{t('lead.who')}</legend>
            <span className="field__hint">{t('lead.whoHint')}</span>
            <div className="choice-list">
              {people.map((p) => (
                <label key={p.id} className="choice">
                  <input
                    type="checkbox"
                    checked={checked.has(p.id)}
                    onChange={(e) => {
                      const next = new Set(checked);
                      if (e.target.checked) next.add(p.id);
                      else next.delete(p.id);
                      setChecked(next);
                    }}
                  />
                  {p.displayName}
                </label>
              ))}
            </div>
            {errors.people ? (
              <p className="field__error" role="alert">
                <Icon name="warning" /> {errors.people}
              </p>
            ) : null}
          </fieldset>
        ) : null}
        <button type="submit" className="btn btn--large" disabled={confirm.isPending}>
          <Icon name="badge" /> {confirm.isPending ? t('common:status.saving') : walk.confirmed ? t('lead.confirmAgain') : t('lead.confirm')}
        </button>
      </form>
    </div>
  );
}
