import '../../styles/pages-e.css';
import { LIMITS, VISIBILITIES, badgeDefinition, type Visibility } from '@happywalkers/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { Place } from '../../api/types';
import type { CreateActivityResult, GpxPreview, MyGroup, RoutePoint } from '../../api/types-e';
import { BadgeEmblem } from '../../components/BadgeEmblem';
import { DropZone } from '../../components/DropZone';
import { Field } from '../../components/Field';
import { Icon, type IconName } from '../../components/Icon';
import { PageHeader } from '../../components/PageHeader';
import { RouteDrawMap, routeLengthKm } from '../../components/RouteDrawMap';
import { VisibilityHint } from '../../components/VisibilityHint';
import { useAction } from '../../hooks/useAction';
import { useErrorMessage, useFieldErrors } from '../../hooks/useErrorMessage';
import { useMe } from '../../hooks/useMe';
import { formatDate, formatDuration, formatKm, toDateInput } from '../../lib/format';
import { useBadgeText } from '../badges/badgeText';
import { parseKm } from './util';

type Mode = 'simple' | 'map' | 'gpx';
const MODES: { key: Mode; icon: IconName }[] = [
  { key: 'simple', icon: 'edit' },
  { key: 'map', icon: 'map' },
  { key: 'gpx', icon: 'upload' },
];

type Errors = Partial<Record<'date' | 'duration' | 'km' | 'gpx' | 'group', string>>;

export default function LogWalk() {
  const { t, i18n } = useTranslation('activities');
  const { data: me } = useMe();
  const errMsg = useErrorMessage();
  const fieldErrors = useFieldErrors();
  const today = toDateInput(new Date());

  const [mode, setMode] = useState<Mode>('simple');
  const [date, setDate] = useState(today);
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [km, setKm] = useState('');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('private');
  const [share, setShare] = useState(false);
  const [groupId, setGroupId] = useState('');
  const [route, setRoute] = useState<RoutePoint[]>([]);
  const [gpxName, setGpxName] = useState<string | null>(null);
  const [preview, setPreview] = useState<GpxPreview | null>(null);
  const [gpxStart, setGpxStart] = useState<string | null>(null);
  const [fromGpx, setFromGpx] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [result, setResult] = useState<CreateActivityResult | null>(null);

  const dateRef = useRef<HTMLInputElement>(null);
  const hoursRef = useRef<HTMLInputElement>(null);
  const kmRef = useRef<HTMLInputElement>(null);

  const groups = useQuery({
    queryKey: ['me', 'groups'],
    queryFn: () => api.get<{ groups: MyGroup[] }>('/me/groups').then((r) => r.groups.filter((g) => g.status === 'active')),
  });
  const place = useQuery({
    queryKey: ['plz', me?.postalCode],
    queryFn: () => api.get<{ place: Place }>(`/geo/postal/${me!.postalCode}`).then((r) => r.place),
    enabled: !!me?.postalCode,
    retry: false,
    staleTime: Infinity,
  });

  const activeGroups = groups.data ?? [];
  useEffect(() => {
    if (!groupId && activeGroups.length === 1) setGroupId(activeGroups[0].id);
  }, [activeGroups, groupId]);

  const gpx = useAction({
    fn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api.upload<{ preview: GpxPreview }>('/activities/gpx', form);
    },
    success: t('gpx.read'),
    onSuccess: (r) => setPreview(r.preview),
  });

  const save = useAction({
    fn: (body: Record<string, unknown>) => api.post<CreateActivityResult>('/activities', body),
    invalidate: [['activities'], ['badges'], ['challenges'], ['feed']],
    success: (r) => t('success.toast', { km: formatKm(r.activity.distanceKm) }),
    onSuccess: (r) => setResult(r),
  });

  function onGpxFile(file: File) {
    setErrors((e) => ({ ...e, gpx: undefined }));
    setPreview(null);
    if (!/\.gpx$/i.test(file.name)) {
      setErrors((e) => ({ ...e, gpx: t('gpx.wrongType') }));
      return;
    }
    if (file.size > LIMITS.maxGpxBytes) {
      setErrors((e) => ({ ...e, gpx: t('gpx.tooLarge') }));
      return;
    }
    setGpxName(t('gpx.selected', { name: file.name }));
    gpx.mutate(file, { onError: (e) => setErrors((x) => ({ ...x, gpx: errMsg(e) })) });
  }

  function acceptPreview() {
    if (!preview) return;
    if (preview.startedAt) setDate(toDateInput(new Date(preview.startedAt)));
    if (preview.durationMinutes != null) {
      setHours(String(Math.floor(preview.durationMinutes / 60)));
      setMinutes(String(preview.durationMinutes % 60));
    }
    setKm(formatKm(preview.distanceKm, 2));
    setRoute(preview.route ?? []);
    setGpxStart(preview.startedAt);
    setFromGpx(true);
    setPreview(null);
    window.setTimeout(() => document.getElementById('log-details')?.focus(), 0);
  }

  function reset() {
    setResult(null);
    setDate(today);
    setHours('');
    setMinutes('');
    setKm('');
    setTitle('');
    setNote('');
    setShare(false);
    setRoute([]);
    setPreview(null);
    setGpxName(null);
    setGpxStart(null);
    setFromGpx(false);
    setErrors({});
    setMode('simple');
    window.scrollTo(0, 0);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: Errors = {};
    const kmVal = parseKm(km);
    const h = hours.trim() ? parseInt(hours, 10) : 0;
    const m = minutes.trim() ? parseInt(minutes, 10) : 0;
    const total = (Number.isFinite(h) ? h : NaN) * 60 + (Number.isFinite(m) ? m : NaN);

    if (!date) errs.date = t('errors.dateRequired');
    else if (date > today) errs.date = t('errors.dateFuture');

    if (!Number.isFinite(total) || h < 0 || m < 0) errs.duration = t('errors.durationInvalid');
    else if (total < 1) errs.duration = t('errors.durationRequired');
    else if (total > LIMITS.maxActivityMinutes) errs.duration = t('errors.durationTooLong');

    if (!km.trim()) errs.km = t('errors.kmRequired');
    else if (!Number.isFinite(kmVal) || kmVal <= 0) errs.km = t('errors.kmInvalid');
    else if (kmVal > LIMITS.maxActivityKm) errs.km = t('errors.kmTooLong', { max: LIMITS.maxActivityKm });
    else if (!errs.duration && kmVal / (total / 60) > 15) errs.km = t('errors.tooFast');

    if (share && !groupId) errs.group = t('errors.groupRequired');

    setErrors(errs);
    if (errs.date) return dateRef.current?.focus();
    if (errs.duration) return hoursRef.current?.focus();
    if (errs.km) return kmRef.current?.focus();
    if (errs.group) return document.getElementById('log-group')?.focus();

    let startedAt: string;
    if (gpxStart && toDateInput(new Date(gpxStart)) === date) startedAt = gpxStart;
    else if (date === today) startedAt = new Date(Date.now() - total * 60_000).toISOString();
    else startedAt = new Date(`${date}T10:00:00`).toISOString();

    const body: Record<string, unknown> = {
      startedAt,
      durationMinutes: total,
      distanceKm: Math.round(kmVal * 100) / 100,
      visibility,
    };
    if (route.length >= 2) body.route = route;
    if (title.trim()) body.title = title.trim();
    if (fromGpx) body.source = 'gpx';
    if (note.trim()) body.note = note.trim();
    if (share && groupId) {
      body.share = true;
      body.groupId = groupId;
    }
    if (!save.isPending)
      save.mutate(body, {
        onError: (err) => {
          // implausible_activity: details [{ field, code: out_of_range | in_future | too_old | too_fast }]
          const details = err instanceof ApiError ? (err.details ?? []) : [];
          const msg = (code: string, fallback: string) => {
            const key = `errors.plaus_${code}`;
            return i18n.exists(`activities:${key}`) ? t(key) : fallback;
          };
          const fe = fieldErrors(err);
          const next: Errors = { date: fe.startedAt, duration: fe.durationMinutes, km: fe.distanceKm };
          for (const d of details) {
            if (d.field === 'startedAt') next.date = msg(d.code, t('errors.dateFuture'));
            else if (d.field === 'durationMinutes') next.duration = msg(d.code, t('errors.durationInvalid'));
            else if (d.field === 'distanceKm') next.km = msg(d.code, t('errors.kmInvalid'));
            else if (d.code === 'too_fast') next.km = t('errors.tooFast');
          }
          setErrors(next);
        },
      });
  }

  if (result) return <SuccessView result={result} onAgain={reset} />;

  const drawnKm = routeLengthKm(route);
  const center = place.data ? ([place.data.lat, place.data.lon] as [number, number]) : null;

  return (
    <div className="page-e page-e--narrow">
      <PageHeader title={t('log.title')} lead={t('log.lead')} />

      <fieldset className="field">
        <legend className="legend-large">{t('log.howQuestion')}</legend>
        <div className="mode-tiles">
          {MODES.map((md) => (
            <label key={md.key} className="choice mode-tile">
              <input type="radio" name="log-mode" checked={mode === md.key} onChange={() => setMode(md.key)} />
              <Icon name={md.icon} className="mode-tile__icon" />
              <span className="choice__text">
                <strong>{t(`log.mode_${md.key}`)}</strong>
                {t(`log.mode_${md.key}_hint`)}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {mode === 'gpx' ? (
        <section className="card stack" aria-labelledby="gpx-h">
          <h2 id="gpx-h">{t('gpx.title')}</h2>
          <p>{t('gpx.intro')}</p>
          <DropZone
            label={t('gpx.label')}
            buttonLabel={t('gpx.button')}
            dropHint={t('gpx.dropHint')}
            hint={t('gpx.hint')}
            accept=".gpx,application/gpx+xml"
            disabled={gpx.isPending}
            error={errors.gpx}
            selectedName={gpx.isPending ? t('gpx.reading') : gpxName}
            onFile={onGpxFile}
          />
          {preview ? (
            <div className="preview-e" aria-labelledby="gpx-prev-h" role="group">
              <h3 id="gpx-prev-h">{t('gpx.previewTitle')}</h3>
              <dl className="facts-e">
                <div>
                  <dt>{t('fields.date')}</dt>
                  <dd>{preview.startedAt ? formatDate(preview.startedAt) : t('gpx.noTime')}</dd>
                </div>
                <div>
                  <dt>{t('fields.distance')}</dt>
                  <dd>{t('common:units.km', { value: formatKm(preview.distanceKm, 2) })}</dd>
                </div>
                <div>
                  <dt>{t('fields.duration')}</dt>
                  <dd>{preview.durationMinutes != null ? formatDuration(preview.durationMinutes) : t('gpx.noTime')}</dd>
                </div>
              </dl>
              {preview.route?.length >= 2 ? <RouteDrawMap route={preview.route} readOnly label={t('map.previewLabel')} /> : null}
              <div className="btn-row">
                <button type="button" className="btn" onClick={acceptPreview}>
                  <Icon name="check" /> {t('gpx.accept')}
                </button>
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => {
                    setPreview(null);
                    setGpxName(null);
                  }}
                >
                  {t('gpx.discard')}
                </button>
              </div>
            </div>
          ) : null}
          {gpxStart && !preview ? (
            <p className="notice notice--success">
              <Icon name="check" /> {t('gpx.accepted')}
            </p>
          ) : null}
        </section>
      ) : null}

      <form onSubmit={onSubmit} noValidate className="card" aria-labelledby="log-details">
        <h2 id="log-details" tabIndex={-1}>
          {t('log.detailsTitle')}
        </h2>

        <Field label={t('fields.date')} hint={t('fields.dateHint')} error={errors.date}>
          <input ref={dateRef} type="date" className="input input--short" max={today} value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>

        <fieldset className="field" aria-describedby={errors.duration ? 'dur-err' : 'dur-hint'}>
          <legend>{t('fields.duration')}</legend>
          <span className="field__hint" id="dur-hint">
            {t('fields.durationHint')}
          </span>
          <div className="inline-fields">
            <label className="inline-field">
              <input
                ref={hoursRef}
                className="input input--tiny"
                inputMode="numeric"
                maxLength={2}
                value={hours}
                aria-invalid={errors.duration ? true : undefined}
                onChange={(e) => setHours(e.target.value.replace(/\D/g, ''))}
              />
              <span>{t('fields.hours')}</span>
            </label>
            <label className="inline-field">
              <input
                className="input input--tiny"
                inputMode="numeric"
                maxLength={4}
                value={minutes}
                aria-invalid={errors.duration ? true : undefined}
                onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))}
              />
              <span>{t('fields.minutes')}</span>
            </label>
          </div>
          {errors.duration ? (
            <p id="dur-err" className="field__error">
              <Icon name="warning" /> {errors.duration}
            </p>
          ) : null}
        </fieldset>

        <Field label={t('fields.distanceKm')} hint={t('fields.distanceHint')} error={errors.km}>
          <input
            ref={kmRef}
            className="input input--short"
            inputMode="decimal"
            autoComplete="off"
            placeholder="5,2"
            value={km}
            onChange={(e) => setKm(e.target.value)}
          />
        </Field>

        {mode === 'map' ? (
          <section className="stack draw-e" aria-labelledby="draw-h">
            <h3 id="draw-h">{t('map.title')}</h3>
            <p>{t('map.intro')}</p>
            <RouteDrawMap route={route} onChange={setRoute} center={center} label={t('map.label')} />
            {route.length >= 2 ? (
              <button type="button" className="btn" onClick={() => setKm(formatKm(drawnKm, 2))}>
                <Icon name="check" /> {t('map.useLength', { km: formatKm(drawnKm, 2) })}
              </button>
            ) : null}
          </section>
        ) : null}

        <Field label={t('fields.title')} hint={t('fields.titleHint')} optional>
          <input className="input" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label={t('fields.note')} optional>
          <textarea className="textarea" maxLength={LIMITS.maxTextLength} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        <fieldset className="field">
          <legend>{t('fields.visibility')}</legend>
          <span className="field__hint">{t('fields.visibilityHint')}</span>
          <div className="choice-list">
            {VISIBILITIES.map((v) => (
              <label key={v} className="choice">
                <input type="radio" name="visibility" checked={visibility === v} onChange={() => setVisibility(v)} />
                <span className="choice__text">
                  <VisibilityHint visibility={v} />
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {activeGroups.length ? (
          <div className="field">
            <label className="switch">
              <input type="checkbox" role="switch" checked={share} onChange={(e) => setShare(e.target.checked)} />
              <span>{t('fields.share')}</span>
            </label>
            <span className="field__hint">{t('fields.shareHint')}</span>
            {share && activeGroups.length > 1 ? (
              <Field label={t('fields.group')} error={errors.group}>
                <select id="log-group" className="select" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                  <option value="">{t('fields.groupChoose')}</option>
                  {activeGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : share ? (
              <p className="field__hint">{t('fields.shareInto', { group: activeGroups[0]?.name })}</p>
            ) : null}
          </div>
        ) : null}

        <button type="submit" className="btn btn--large" disabled={save.isPending}>
          <Icon name="check" /> {save.isPending ? t('common:status.saving') : t('log.submit')}
        </button>
      </form>
    </div>
  );
}

/** Große, ruhige Erfolgsseite nach dem Speichern – der Fokus springt auf die Überschrift. */
function SuccessView({ result, onAgain }: { result: CreateActivityResult; onAgain: () => void }) {
  const { t } = useTranslation('activities');
  const bt = useBadgeText();
  const h1 = useRef<HTMLHeadingElement>(null);
  const title = t('success.title', { km: formatKm(result.activity.distanceKm) });
  useEffect(() => {
    document.title = `${title} – ${t('common:app.name')}`;
    h1.current?.focus();
  }, [title, t]);
  const { award } = result;
  return (
    <div className="page-e page-e--narrow success-e">
      <header className="success-e__head">
        <Icon name="sparkles" className="success-e__icon" />
        <h1 ref={h1} tabIndex={-1}>
          {title}
        </h1>
        <p className="page-header__lead">
          {t('success.lead', { duration: formatDuration(result.activity.durationMinutes), date: formatDate(result.activity.startedAt) })}
        </p>
      </header>

      {award.pointsAwarded > 0 ? (
        <p className="success-e__points">
          <Icon name="star" className="inline-icon" /> {t('success.points', { count: award.pointsAwarded })}
        </p>
      ) : null}

      {award.newBadges.length ? (
        <section className="card success-e__badges" aria-labelledby="new-badges-h">
          <h2 id="new-badges-h">{t('success.newBadges', { count: award.newBadges.length })}</h2>
          <ul className="plain-list badge-row-e">
            {award.newBadges.map((key) => {
              const def = badgeDefinition(key) ?? { kind: 'distance' as const, tier: 1 as const };
              return (
                <li key={key} className="badge-row-e__item">
                  <BadgeEmblem kind={def.kind} tier={def.tier} size={110} />
                  <div>
                    <strong className="badge-row-e__name">{bt.name(key)}</strong>
                    <span>{bt.description(key)}</span>
                    <span className="badge-row-e__tier">{bt.tier(def.tier)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {award.completedChallenges.length ? (
        <p className="notice notice--success">
          <Icon name="trophy" /> {t('success.challenges', { count: award.completedChallenges.length })}
        </p>
      ) : null}

      {result.post ? (
        <p className="notice notice--info">
          <Icon name="group" /> {t('success.shared')}
        </p>
      ) : null}

      <div className="btn-row">
        <Link to="/abzeichen" className="btn btn--large">
          <Icon name="badge" /> {t('success.toShowcase')}
        </Link>
        <button type="button" className="btn btn--secondary btn--large" onClick={onAgain}>
          <Icon name="plus" /> {t('success.again')}
        </button>
        <Link to={`/eintraege/${result.activity.id}`} className="btn btn--ghost">
          {t('success.viewEntry')}
        </Link>
      </div>
    </div>
  );
}
