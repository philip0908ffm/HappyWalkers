import type { Tempo } from '@gehmeinsam/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { WalkDetail } from '../../api/types-walks';
import { groupsApi, isLead, qk, walksApi } from '../../api/walks';
import { Explain } from '../../components/Explain';
import { Field } from '../../components/Field';
import { Icon } from '../../components/Icon';
import { LoadError, Loading } from '../../components/Loading';
import { PageHeader } from '../../components/PageHeader';
import { TempoPicker } from '../../components/Tempo';
import { useAction } from '../../hooks/useAction';
import { useFieldErrors } from '../../hooks/useErrorMessage';
import { berlinDayKey, berlinTimeInput, localToIso, nextWeekdayDate, weekdayName } from '../../lib/dates';
import { formatDate, formatDuration, toDateInput } from '../../lib/format';

const DURATIONS = [30, 45, 60, 75, 90, 120, 150, 180, 240];
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];

export default function WalkForm() {
  const { id } = useParams();
  const { t } = useTranslation('walks');
  const walkQ = useQuery({ queryKey: qk.walk(id ?? ''), queryFn: () => walksApi.get(id!), enabled: !!id });
  if (id && walkQ.isLoading) return <Loading />;
  if (id && (walkQ.error || !walkQ.data))
    return (
      <>
        <PageHeader title={t('form.editTitle')} />
        <LoadError error={walkQ.error} onRetry={() => walkQ.refetch()} />
      </>
    );
  return <WalkFormInner walk={walkQ.data ?? null} />;
}

type Kind = { kind: 'group'; groupId: string } | { kind: 'distance' };

function WalkFormInner({ walk }: { walk: WalkDetail | null }) {
  const { t } = useTranslation('walks');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const fieldErrors = useFieldErrors();
  const editing = !!walk;

  const myGroupsQ = useQuery({ queryKey: qk.myGroups, queryFn: groupsApi.mine, enabled: !editing });
  const ledGroups = (myGroupsQ.data ?? []).filter((g) => g.status === 'active' && isLead(g.role));

  const initialGroup = params.get('gruppe');
  const [kind, setKind] = useState<Kind | null>(
    walk ? (walk.kind === 'distance' ? { kind: 'distance' } : walk.group ? { kind: 'group', groupId: walk.group.id } : null) : initialGroup ? { kind: 'group', groupId: initialGroup } : null,
  );
  // Sobald die eigenen Gruppen geladen sind: Vorauswahl
  useEffect(() => {
    if (kind || editing || !myGroupsQ.data) return;
    setKind(ledGroups.length ? { kind: 'group', groupId: ledGroups[0].id } : { kind: 'distance' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myGroupsQ.data]);

  const groupId = kind?.kind === 'group' ? kind.groupId : null;
  const groupQ = useQuery({ queryKey: qk.group(groupId ?? ''), queryFn: () => groupsApi.get(groupId!), enabled: !!groupId });

  const tomorrow = new Date(Date.now() + 86400000);
  // Vorbelegung aus einer Gruppenvorlage (?wochentag=…&uhrzeit=…&dauer=…&tempo=…&titel=…)
  const pre = {
    weekday: params.get('wochentag'),
    time: params.get('uhrzeit'),
    duration: Number(params.get('dauer')) || null,
    tempo: params.get('tempo') as Tempo | null,
    title: params.get('titel'),
  };
  const [title, setTitle] = useState(walk?.title ?? pre.title ?? '');
  const [description, setDescription] = useState(walk?.description ?? '');
  const [recurring, setRecurring] = useState(!walk && pre.weekday != null);
  const [weekday, setWeekday] = useState<number>(walk ? new Date(walk.startsAt).getDay() : pre.weekday != null ? Number(pre.weekday) : tomorrow.getDay());
  const [date, setDate] = useState(walk ? berlinDayKey(walk.startsAt) : toDateInput(tomorrow));
  const [time, setTime] = useState(walk ? berlinTimeInput(walk.startsAt) : (pre.time ?? '10:00'));
  const [duration, setDuration] = useState(walk?.durationMinutes ?? pre.duration ?? 60);
  const [km, setKm] = useState(walk?.distanceKm != null ? String(walk.distanceKm).replace('.', ',') : '');
  const [tempo, setTempo] = useState<Tempo | ''>(walk?.tempo ?? pre.tempo ?? '');
  const [maxP, setMaxP] = useState(walk?.maxParticipants != null ? String(walk.maxParticipants) : '');
  const [mpName, setMpName] = useState(walk?.meetingPoint?.name ?? '');
  const [mpAddress, setMpAddress] = useState(walk?.meetingPoint?.address ?? '');
  const [mpDesc, setMpDesc] = useState(walk?.meetingPoint?.description ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const errorSummaryRef = useRef<HTMLDivElement>(null);

  // Tempo der Gruppe als Vorschlag
  useEffect(() => {
    if (!tempo && groupQ.data) setTempo(groupQ.data.defaultTempo);
  }, [groupQ.data, tempo]);

  const save = useAction({
    fn: (body: Record<string, unknown>) =>
      editing
        ? api.patch<{ walk: WalkDetail }>(`/walks/${walk!.id}`, body)
        : api.post<{ walk: WalkDetail; seriesId?: string }>('/walks', body),
    success: (r) => (editing ? t('form.saved') : 'seriesId' in r && r.seriesId ? t('form.createdSeries') : t('form.created')),
    invalidate: [qk.walks, qk.groups],
    onSuccess: (r) => navigate(`/walks/${r.walk.id}`),
  });

  useEffect(() => {
    if (save.error) {
      const fe = fieldErrors(save.error);
      if (Object.keys(fe).length) setErrors(fe);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [save.error]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!kind) errs.kind = t('form.kindRequired');
    if (!title.trim()) errs.title = t('form.titleRequired');
    const startDate = recurring ? nextWeekdayDate(weekday) : date;
    if (!recurring && !date) errs.startsAt = t('form.dateRequired');
    if (!/^\d{2}:\d{2}$/.test(time)) errs.time = t('form.timeRequired');
    let startsAt = '';
    if (!errs.startsAt && !errs.time) {
      startsAt = localToIso(startDate, time);
      if (new Date(startsAt).getTime() < Date.now() && (!editing || startsAt !== walk?.startsAt)) errs.startsAt = t('form.datePast');
    }
    const kmNum = km.trim() ? Number(km.replace(',', '.')) : null;
    if (kmNum != null && !(kmNum > 0 && kmNum <= 100)) errs.distanceKm = t('form.kmInvalid');
    const maxNum = maxP.trim() ? Number(maxP) : null;
    if (maxNum != null && !(Number.isInteger(maxNum) && maxNum >= 2)) errs.maxParticipants = t('form.maxInvalid');
    if (!tempo) errs.tempo = t('form.tempoRequired');
    if (kind?.kind === 'group') {
      if (!mpName.trim()) errs.meetingPointName = t('form.mpNameRequired');
      if (!mpAddress.trim()) errs.meetingAddress = t('form.mpAddressRequired');
    }
    setErrors(errs);
    if (Object.keys(errs).length) {
      setTimeout(() => errorSummaryRef.current?.focus(), 0);
      return;
    }
    if (save.isPending) return;
    const isGroup = kind!.kind === 'group';
    const body: Record<string, unknown> = {
      title: title.trim(),
      description: description.trim() || undefined,
      startsAt,
      durationMinutes: duration,
      distanceKm: kmNum ?? undefined,
      tempo,
      maxParticipants: maxNum ?? undefined,
    };
    if (!editing) {
      body.kind = kind!.kind;
      if (isGroup) body.groupId = (kind as { groupId: string }).groupId;
      if (recurring && isGroup) body.recurring = { weekday, timeOfDay: time };
    }
    if (isGroup || walk?.kind === 'partner') {
      body.meetingPointName = mpName.trim() || undefined;
      body.meetingAddress = mpAddress.trim() || undefined;
      body.meetingDescription = mpDesc.trim() || undefined;
    }
    save.mutate(body);
  }

  const isGroupKind = kind?.kind === 'group';
  const errorList = Object.values(errors);

  return (
    <div className="form-page">
      <p>
        <Link to={walk ? `/walks/${walk.id}` : groupId ? `/gruppen/${groupId}` : '/walks'}>
          <Icon name="arrowLeft" className="inline-icon" /> {t('common:actions.back')}
        </Link>
      </p>
      <PageHeader title={editing ? t('form.editTitle') : t('form.newTitle')} lead={editing ? undefined : t('form.newLead')} />

      {errorList.length ? (
        <div className="notice notice--error" role="alert" tabIndex={-1} ref={errorSummaryRef}>
          <Icon name="warning" />
          <div>
            <p>
              <strong>{t('form.errorSummary')}</strong>
            </p>
            <ul>
              {errorList.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <form onSubmit={onSubmit} noValidate className="stack-form">
        {!editing ? (
          <section className="card form-section" aria-labelledby="wf-kind">
            <h2 id="wf-kind">{t('form.kindTitle')}</h2>
            {myGroupsQ.isLoading ? <Loading /> : null}
            <fieldset className="field">
              <legend>{t('form.kindLegend')}</legend>
              <div className="choice-list">
                {ledGroups.map((g) => (
                  <label key={g.id} className="choice">
                    <input
                      type="radio"
                      name="kind"
                      checked={kind?.kind === 'group' && kind.groupId === g.id}
                      onChange={() => {
                        setKind({ kind: 'group', groupId: g.id });
                        setTempo('');
                      }}
                    />
                    <span className="choice__text">
                      <strong>{g.name}</strong>
                      {t('form.kindGroupHint')}
                    </span>
                  </label>
                ))}
                {initialGroup && !ledGroups.some((g) => g.id === initialGroup) && groupQ.data ? (
                  <label className="choice">
                    <input type="radio" name="kind" checked={kind?.kind === 'group' && kind.groupId === initialGroup} onChange={() => setKind({ kind: 'group', groupId: initialGroup })} />
                    <span className="choice__text">
                      <strong>{groupQ.data.name}</strong>
                      {t('form.kindGroupHint')}
                    </span>
                  </label>
                ) : null}
                <label className="choice">
                  <input
                    type="radio"
                    name="kind"
                    checked={kind?.kind === 'distance'}
                    onChange={() => {
                      setKind({ kind: 'distance' });
                      setRecurring(false);
                    }}
                  />
                  <span className="choice__text">
                    <strong>
                      <Icon name="globe" className="inline-icon" /> {t('kind.distance')}
                    </strong>
                    {t('form.kindDistanceHint')}
                  </span>
                </label>
              </div>
              {errors.kind ? (
                <p className="field__error">
                  <Icon name="warning" /> {errors.kind}
                </p>
              ) : null}
            </fieldset>
            {myGroupsQ.data && ledGroups.length === 0 ? <p className="field__hint">{t('form.noLedGroups')}</p> : null}
          </section>
        ) : null}

        <section className="card form-section" aria-labelledby="wf-what">
          <h2 id="wf-what">{t('form.whatTitle')}</h2>
          <Field label={t('form.title')} hint={t('form.titleHint')} error={errors.title}>
            <input className="input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label={t('form.description')} hint={t('form.descriptionHint')} optional error={errors.description}>
            <textarea className="textarea" value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </section>

        <section className="card form-section" aria-labelledby="wf-when">
          <h2 id="wf-when">{t('form.whenTitle')}</h2>
          {!editing && isGroupKind ? (
            <div className="field">
              <label className="switch">
                <input type="checkbox" role="switch" checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
                <span>
                  {t('form.recurring')} <span className="switch__state">({recurring ? t('form.on') : t('form.off')})</span>
                </span>
              </label>
              <Explain term={t('form.recurring')}>{t('form.recurringExplain')}</Explain>
            </div>
          ) : null}
          {recurring ? (
            <fieldset className="field">
              <legend>{t('form.weekday')}</legend>
              <div className="choice-list weekday-list">
                {WEEKDAYS.map((w) => (
                  <label key={w} className="choice">
                    <input type="radio" name="weekday" checked={weekday === w} onChange={() => setWeekday(w)} />
                    {weekdayName(w)}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <Field label={t('form.date')} error={errors.startsAt}>
              <input className="input input--short" type="date" value={date} min={toDateInput(new Date())} onChange={(e) => setDate(e.target.value)} />
            </Field>
          )}
          <Field label={t('form.time')} hint={t('form.timeHint')} error={errors.time}>
            <input className="input input--short" type="time" value={time} step={300} onChange={(e) => setTime(e.target.value)} />
          </Field>
          {recurring ? (
            <p className="notice notice--info">
              <Icon name="calendar" />
              <span>{t('form.recurringSummary', { weekday: weekdayName(weekday), time, first: formatDate(`${nextWeekdayDate(weekday)}T12:00:00`) })}</span>
            </p>
          ) : null}
          {recurring && errors.startsAt ? (
            <p className="field__error">
              <Icon name="warning" /> {errors.startsAt}
            </p>
          ) : null}
          <Field label={t('form.duration')} error={errors.durationMinutes}>
            <select className="select input--short" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {[...new Set([...DURATIONS, duration])].sort((a, b) => a - b).map((m) => (
                <option key={m} value={m}>
                  {formatDuration(m)}
                </option>
              ))}
            </select>
          </Field>
        </section>

        <section className="card form-section" aria-labelledby="wf-how">
          <h2 id="wf-how">{t('form.howTitle')}</h2>
          <TempoPicker name="tempo" value={tempo} onChange={setTempo} />
          {errors.tempo ? (
            <p className="field__error">
              <Icon name="warning" /> {errors.tempo}
            </p>
          ) : null}
          <Field label={t('form.km')} hint={t('form.kmHint')} optional error={errors.distanceKm}>
            <input className="input input--short" inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} />
          </Field>
          <Field label={t('form.max')} hint={t('form.maxHint')} optional error={errors.maxParticipants}>
            <input className="input input--short" type="number" min={2} inputMode="numeric" value={maxP} onChange={(e) => setMaxP(e.target.value)} />
          </Field>
        </section>

        {isGroupKind || walk?.kind === 'partner' ? (
          <section className="card form-section" aria-labelledby="wf-where">
            <h2 id="wf-where">{t('form.whereTitle')}</h2>
            <div className="notice notice--info">
              <Icon name="lock" />
              <p>{t('form.whereInfo')}</p>
            </div>
            <Field label={t('form.mpName')} hint={t('form.mpNameHint')} optional={!isGroupKind} error={errors.meetingPointName}>
              <input className="input" value={mpName} maxLength={120} onChange={(e) => setMpName(e.target.value)} />
            </Field>
            <Field label={t('form.mpAddress')} hint={t('form.mpAddressHint')} optional={!isGroupKind} error={errors.meetingAddress}>
              <input className="input" value={mpAddress} maxLength={200} autoComplete="street-address" onChange={(e) => setMpAddress(e.target.value)} />
            </Field>
            <Field label={t('form.mpDesc')} hint={t('form.mpDescHint')} optional error={errors.meetingDescription}>
              <textarea className="textarea textarea--short" value={mpDesc} maxLength={500} onChange={(e) => setMpDesc(e.target.value)} />
            </Field>
          </section>
        ) : kind?.kind === 'distance' ? (
          <div className="notice notice--info">
            <Icon name="globe" />
            <p>{t('detail.distanceText')}</p>
          </div>
        ) : null}

        <div className="btn-row form-actions">
          <button type="submit" className="btn btn--large" disabled={save.isPending}>
            <Icon name="check" /> {save.isPending ? t('common:status.saving') : editing ? t('form.save') : t('form.create')}
          </button>
          <Link className="btn btn--ghost" to={walk ? `/walks/${walk.id}` : '/walks'}>
            {t('common:actions.cancel')}
          </Link>
        </div>
      </form>
    </div>
  );
}
