import { LIMITS, TEMPOS, type Tempo } from '@happywalkers/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import type { WalkSummaryE } from '../../api/types-e';
import { Explain } from '../../components/Explain';
import { Field } from '../../components/Field';
import { Icon } from '../../components/Icon';
import { Loading } from '../../components/Loading';
import { VisibilityHint } from '../../components/VisibilityHint';
import { useAction } from '../../hooks/useAction';
import { formatDateTime, formatDuration, formatKm, toDateInput } from '../../lib/format';
import { parseKm } from '../activities/util';
import { PostListE } from '../profile/parts/PostListE';

/** „Gemeinsam auf Distanz“: Termine, an denen alle zur gleichen Zeit bei sich zu Hause gehen. */
export function DistanceSection({ walks, loading }: { walks: WalkSummaryE[] | null; loading: boolean }) {
  const { t } = useTranslation('rural');
  const [showForm, setShowForm] = useState(false);
  const formId = useId();
  const upcoming = (walks ?? []).filter((w) => w.status !== 'cancelled');
  return (
    <section id="distanz" aria-labelledby="distanz-h" className="card stack section-e">
      <h2 id="distanz-h">
        {t('distance.title')} <Explain term={t('distance.title')}>{t('distance.explain')}</Explain>
      </h2>
      <p>{t('distance.intro')}</p>
      {loading ? (
        <Loading />
      ) : upcoming.length ? (
        <ul className="plain-list distance-list-e">
          {upcoming.map((w) => (
            <li key={w.id}>
              <DistanceWalk walk={w} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted-text">{t('distance.empty')}</p>
      )}
      <button type="button" className="btn btn--secondary" aria-expanded={showForm} aria-controls={formId} onClick={() => setShowForm((s) => !s)}>
        <Icon name="plus" /> {t('distance.create')}
      </button>
      <div id={formId} hidden={!showForm}>
        {showForm ? <CreateDistanceWalk onDone={() => setShowForm(false)} /> : null}
      </div>
    </section>
  );
}

function DistanceWalk({ walk: w }: { walk: WalkSummaryE }) {
  const { t } = useTranslation('rural');
  const qc = useQueryClient();
  const [showNews, setShowNews] = useState(false);
  const newsId = useId();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const rsvp = useAction({
    fn: (status: 'yes' | 'no') => api.put<{ myRsvp: 'yes' | null; participantCount: number }>(`/walks/${w.id}/rsvp`, { status }),
    success: (_r, s) => (s === 'yes' ? t('distance.rsvpYes', { title: w.title }) : t('distance.rsvpNo')),
    invalidate: [['rural', 'overview']],
  });
  const post = useAction({
    fn: () => api.post('/posts', { text: text.trim(), visibility: 'group', walkId: w.id }),
    success: t('distance.posted'),
    onSuccess: () => {
      setText('');
      void qc.invalidateQueries({ queryKey: ['feed', { walkId: w.id }] });
    },
  });
  const going = w.myRsvp === 'yes';

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return setError(t('distance.postRequired'));
    setError(null);
    if (!post.isPending) post.mutate(undefined);
  }

  return (
    <article className="distance-e">
      <h3 className="card__title">
        <Link to={`/walks/${w.id}`}>{w.title}</Link>
      </h3>
      <p className="card__meta">
        <span>
          <Icon name="calendar" /> {formatDateTime(w.startsAt)}
        </span>
        <span>
          <Icon name="clock" /> {formatDuration(w.durationMinutes)}
        </span>
        {w.distanceKm ? (
          <span>
            <Icon name="route" /> {t('common:units.km', { value: formatKm(w.distanceKm) })}
          </span>
        ) : null}
        <span className={`badge-pill badge-pill--tempo-${w.tempo}`}>{t(`common:tempo.${w.tempo}`)}</span>
        <span>
          <Icon name="people2" /> {t('distance.participants', { count: w.participantCount })}
        </span>
      </p>
      {going ? (
        <p className="notice notice--success">
          <Icon name="check" /> {t('distance.youAreIn')}
        </p>
      ) : null}
      <div className="btn-row">
        {going ? (
          <button type="button" className="btn btn--secondary" disabled={rsvp.isPending} onClick={() => rsvp.mutate('no')}>
            {t('distance.cancelRsvp')}
          </button>
        ) : (
          <button type="button" className="btn" disabled={rsvp.isPending} onClick={() => rsvp.mutate('yes')}>
            <Icon name="check" /> {t('distance.join')}
          </button>
        )}
        <button type="button" className="btn btn--secondary" aria-expanded={showNews} aria-controls={newsId} onClick={() => setShowNews((s) => !s)}>
          <Icon name="comment" /> {showNews ? t('distance.hideNews') : t('distance.showNews')}
        </button>
      </div>
      <div id={newsId} hidden={!showNews} className="stack">
        {showNews ? (
          <>
            <h4>{t('distance.newsTitle')}</h4>
            {going ? (
              <form onSubmit={submit} noValidate>
                <Field label={t('distance.postLabel')} hint={<VisibilityHint visibility="walkParticipants" />} error={error}>
                  <textarea className="textarea" maxLength={LIMITS.maxTextLength} value={text} onChange={(e) => setText(e.target.value)} />
                </Field>
                <button type="submit" className="btn" disabled={post.isPending}>
                  {post.isPending ? t('common:status.sending') : t('distance.postSubmit')}
                </button>
              </form>
            ) : (
              <p className="field__hint">{t('distance.postJoinFirst')}</p>
            )}
            <PostListE filter={{ walkId: w.id }} emptyText={t('distance.newsEmpty')} headingLevel={4} />
          </>
        ) : null}
      </div>
    </article>
  );
}

function CreateDistanceWalk({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation('rural');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(toDateInput(new Date(Date.now() + 86_400_000)));
  const [time, setTime] = useState('10:00');
  const [duration, setDuration] = useState('60');
  const [km, setKm] = useState('');
  const [tempo, setTempo] = useState<Tempo>('zuegig');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useAction({
    fn: (body: Record<string, unknown>) => api.post<{ walk: { id: string } }>('/walks', body),
    success: t('distance.created'),
    invalidate: [['rural', 'overview'], ['walks']],
    onSuccess: onDone,
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const when = new Date(`${date}T${time}`);
    const mins = parseInt(duration, 10);
    const k = km.trim() ? parseKm(km) : null;
    if (!title.trim()) errs.title = t('distance.titleRequired');
    if (Number.isNaN(when.getTime())) errs.when = t('partner.whenRequired');
    else if (when.getTime() < Date.now()) errs.when = t('partner.whenPast');
    if (!Number.isFinite(mins) || mins < 10 || mins > 600) errs.duration = t('distance.durationInvalid');
    if (k !== null && (!Number.isFinite(k) || k <= 0 || k > LIMITS.maxActivityKm)) errs.km = t('distance.kmInvalid');
    setErrors(errs);
    const first = ['title', 'when', 'duration', 'km'].find((f) => errs[f]);
    if (first) return document.getElementById(`dist-${first}`)?.focus();
    const body: Record<string, unknown> = {
      kind: 'distance',
      title: title.trim(),
      startsAt: when.toISOString(),
      durationMinutes: mins,
      tempo,
    };
    if (description.trim()) body.description = description.trim();
    if (k !== null) body.distanceKm = k;
    if (!create.isPending) create.mutate(body);
  }

  return (
    <form onSubmit={submit} noValidate className="subsection-e">
      <h3>{t('distance.createTitle')}</h3>
      <Field label={t('distance.titleLabel')} hint={t('distance.titleHint')} error={errors.title}>
        <input id="dist-title" className="input" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="inline-fields">
        <Field label={t('partner.date')} error={errors.when}>
          <input id="dist-when" type="date" className="input" min={toDateInput(new Date())} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t('partner.time')}>
          <input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
      <Field label={t('partner.duration')} error={errors.duration}>
        <input id="dist-duration" className="input input--short" inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value.replace(/\D/g, ''))} />
      </Field>
      <Field label={t('distance.kmLabel')} hint={t('distance.kmHint')} error={errors.km} optional>
        <input id="dist-km" className="input input--short" inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} />
      </Field>
      <fieldset className="field">
        <legend>{t('common:tempo.label')}</legend>
        <div className="choice-list choice-list--row">
          {TEMPOS.map((tp) => (
            <label key={tp} className="choice">
              <input type="radio" name="dist-tempo" checked={tempo === tp} onChange={() => setTempo(tp)} />
              {t(`common:tempo.${tp}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label={t('distance.descLabel')} optional>
        <textarea className="textarea" maxLength={LIMITS.maxTextLength} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="btn-row">
        <button type="submit" className="btn" disabled={create.isPending}>
          <Icon name="check" /> {create.isPending ? t('common:status.saving') : t('distance.createSubmit')}
        </button>
        <button type="button" className="btn btn--secondary" onClick={onDone}>
          {t('common:actions.cancel')}
        </button>
      </div>
    </form>
  );
}
