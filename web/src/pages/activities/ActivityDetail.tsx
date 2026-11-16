import '../../styles/pages-e.css';
import { LIMITS, VISIBILITIES, type Visibility } from '@gehmeinsam/shared';
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { Activity, PersonRef } from '../../api/types-e';
import { Field } from '../../components/Field';
import { Icon } from '../../components/Icon';
import { LoadError, Loading } from '../../components/Loading';
import { PageHeader } from '../../components/PageHeader';
import { RouteDrawMap } from '../../components/RouteDrawMap';
import { VisibilityHint } from '../../components/VisibilityHint';
import { useAction } from '../../hooks/useAction';
import { useMe } from '../../hooks/useMe';
import { formatDate, formatDuration, formatKm, toDateInput } from '../../lib/format';
import { ConfirmDialogE } from '../profile/parts/ConfirmDialogE';
import { parseKm, tempoWord } from './util';

export default function ActivityDetail() {
  const { id = '' } = useParams();
  const { t } = useTranslation('activities');
  const { data: me } = useMe();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const q = useQuery({
    queryKey: ['activities', id],
    queryFn: () => api.get<{ activity: Activity; author: PersonRef }>(`/activities/${id}`),
  });

  const del = useAction({
    fn: () => api.del(`/activities/${id}`),
    success: t('detail.deleted'),
    invalidate: [['activities'], ['badges'], ['challenges']],
    onSuccess: () => navigate('/profil#eintraege', { replace: true }),
  });

  if (q.isLoading) return <Loading />;
  if (q.isError || !q.data) return <LoadError error={q.error} onRetry={() => q.refetch()} />;
  const { activity: a, author } = q.data;
  const mine = me?.id === author.id;
  const title = a.title || t('detail.defaultTitle', { date: formatDate(a.startedAt) });
  const where = [a.city, a.district && a.district !== a.city ? a.district : null].filter(Boolean).join(', ');

  return (
    <div className="page-e">
      <p>
        <Link to={mine ? '/profil#eintraege' : `/personen/${author.id}`}>
          <Icon name="arrowLeft" className="inline-icon" /> {mine ? t('detail.backToProfile') : t('common:actions.back')}
        </Link>
      </p>
      <PageHeader title={title} lead={mine ? undefined : t('detail.by', { name: author.displayName })} />

      <section className="card" aria-labelledby="facts-h">
        <h2 id="facts-h" className="visually-hidden">
          {t('detail.facts')}
        </h2>
        <dl className="facts-e facts-e--big">
          <div>
            <dt>{t('fields.distance')}</dt>
            <dd>{t('common:units.km', { value: formatKm(a.distanceKm) })}</dd>
          </div>
          <div>
            <dt>{t('fields.duration')}</dt>
            <dd>{formatDuration(a.durationMinutes)}</dd>
          </div>
          <div>
            <dt>{t('detail.speed')}</dt>
            <dd>
              {t('detail.speedValue', { kmh: formatKm(a.speedKmh) })}
              <span className="facts-e__sub">{t('detail.speedWord', { tempo: t(`common:tempo.${tempoWord(a.speedKmh)}`) })}</span>
            </dd>
          </div>
          <div>
            <dt>{t('fields.date')}</dt>
            <dd>{formatDate(a.startedAt)}</dd>
          </div>
          {where ? (
            <div>
              <dt>{t('detail.where')}</dt>
              <dd>{where}</dd>
            </div>
          ) : null}
          <div>
            <dt>{t('detail.source')}</dt>
            <dd>{t(`detail.source_${a.source}`)}</dd>
          </div>
          <div>
            <dt>{t('common:visibility.label')}</dt>
            <dd>
              <VisibilityHint visibility={a.visibility} />
            </dd>
          </div>
        </dl>
        {a.note ? <p className="note-e">{a.note}</p> : null}
        {a.walkId ? (
          <p>
            <Link to={`/walks/${a.walkId}`}>{t('detail.toWalk')}</Link>
          </p>
        ) : null}
      </section>

      <section className="card stack" aria-labelledby="route-h">
        <h2 id="route-h">{t('detail.route')}</h2>
        {a.route && a.route.length >= 2 ? (
          <RouteDrawMap route={a.route} readOnly label={t('map.detailLabel', { title })} />
        ) : (
          <p className="muted-text">{t('detail.noRoute')}</p>
        )}
      </section>

      {mine ? (
        <section className="card stack" aria-labelledby="manage-h">
          <h2 id="manage-h">{t('detail.manage')}</h2>
          {editing ? (
            <EditForm activity={a} onDone={() => setEditing(false)} />
          ) : (
            <div className="btn-row">
              <button type="button" className="btn btn--secondary" onClick={() => setEditing(true)}>
                <Icon name="edit" /> {t('detail.edit')}
              </button>
              <button type="button" className="btn btn--danger" onClick={() => setConfirmDelete(true)}>
                <Icon name="trash" /> {t('detail.delete')}
              </button>
            </div>
          )}
        </section>
      ) : null}

      <ConfirmDialogE
        open={confirmDelete}
        title={t('detail.deleteTitle')}
        confirmLabel={t('detail.deleteConfirm')}
        danger
        pending={del.isPending}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => del.mutate(undefined)}
      >
        <p>{t('detail.deleteText', { title })}</p>
      </ConfirmDialogE>
    </div>
  );
}

function EditForm({ activity: a, onDone }: { activity: Activity; onDone: () => void }) {
  const { t } = useTranslation('activities');
  const fromGroup = a.source === 'group';
  const [title, setTitle] = useState(a.title ?? '');
  const [note, setNote] = useState(a.note ?? '');
  const [visibility, setVisibility] = useState<Visibility>(a.visibility);
  const [date, setDate] = useState(toDateInput(new Date(a.startedAt)));
  const [km, setKm] = useState(formatKm(a.distanceKm, 2));
  const [minutes, setMinutes] = useState(String(a.durationMinutes));
  const [errors, setErrors] = useState<{ km?: string; minutes?: string; date?: string }>({});
  const today = toDateInput(new Date());

  const save = useAction({
    fn: (body: Record<string, unknown>) => api.patch(`/activities/${a.id}`, body),
    success: t('detail.saved'),
    invalidate: [['activities'], ['badges'], ['challenges']],
    onSuccess: onDone,
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    const k = parseKm(km);
    const m = parseInt(minutes, 10);
    if (!date || date > today) errs.date = t('errors.dateFuture');
    if (!fromGroup) {
      if (!Number.isFinite(k) || k <= 0 || k > LIMITS.maxActivityKm) errs.km = t('errors.kmInvalid');
      if (!Number.isFinite(m) || m < 1 || m > LIMITS.maxActivityMinutes) errs.minutes = t('errors.durationInvalid');
      if (!errs.km && !errs.minutes && k / (m / 60) > 15) errs.km = t('errors.tooFast');
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const body: Record<string, unknown> = { title: title.trim() || null, note: note.trim() || null, visibility };
    if (date !== toDateInput(new Date(a.startedAt))) body.startedAt = new Date(`${date}T10:00:00`).toISOString();
    if (!fromGroup) {
      body.distanceKm = Math.round(k * 100) / 100;
      body.durationMinutes = m;
    }
    if (!save.isPending) save.mutate(body);
  }

  return (
    <form onSubmit={submit} noValidate>
      <Field label={t('fields.title')} optional>
        <input className="input" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label={t('fields.date')} error={errors.date}>
        <input type="date" className="input input--short" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      {fromGroup ? (
        <p className="field__hint">{t('detail.groupLocked')}</p>
      ) : (
        <>
          <Field label={t('fields.distanceKm')} hint={t('fields.distanceHint')} error={errors.km}>
            <input className="input input--short" inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} />
          </Field>
          <Field label={t('fields.durationMinutes')} error={errors.minutes}>
            <input className="input input--short" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))} />
          </Field>
        </>
      )}
      <Field label={t('fields.note')} optional>
        <textarea className="textarea" maxLength={LIMITS.maxTextLength} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <fieldset className="field">
        <legend>{t('fields.visibility')}</legend>
        <div className="choice-list">
          {VISIBILITIES.map((v) => (
            <label key={v} className="choice">
              <input type="radio" name="edit-visibility" checked={visibility === v} onChange={() => setVisibility(v)} />
              <VisibilityHint visibility={v} />
            </label>
          ))}
        </div>
      </fieldset>
      <div className="btn-row">
        <button type="submit" className="btn" disabled={save.isPending}>
          <Icon name="check" /> {save.isPending ? t('common:status.saving') : t('common:actions.save')}
        </button>
        <button type="button" className="btn btn--secondary" onClick={onDone}>
          {t('common:actions.cancel')}
        </button>
      </div>
    </form>
  );
}
