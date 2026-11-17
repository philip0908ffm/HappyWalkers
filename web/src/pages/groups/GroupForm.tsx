import { JOIN_POLICIES, type JoinPolicy, type Tempo } from '@happywalkers/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { Place } from '../../api/types';
import type { GroupDetail, GroupTemplate } from '../../api/types-walks';
import { groupsApi, qk } from '../../api/walks';
import { Field } from '../../components/Field';
import { joinPolicyIcon } from '../../components/GroupCard';
import { Icon } from '../../components/Icon';
import { LoadError, Loading } from '../../components/Loading';
import { PageHeader } from '../../components/PageHeader';
import { TempoBadge, TempoPicker } from '../../components/Tempo';
import { useToast } from '../../components/Toast';
import { useAction } from '../../hooks/useAction';
import { useFieldErrors } from '../../hooks/useErrorMessage';
import { useMe } from '../../hooks/useMe';
import { timeOfDayLabel, weekdayName } from '../../lib/dates';
import { formatDuration } from '../../lib/format';

export default function GroupForm() {
  const { id } = useParams();
  const { t } = useTranslation('groups');
  const q = useQuery({ queryKey: qk.group(id ?? ''), queryFn: () => groupsApi.get(id!), enabled: !!id });
  const [template, setTemplate] = useState<GroupTemplate | null | undefined>(id ? null : undefined);

  if (id) {
    if (q.isLoading) return <Loading />;
    if (q.error || !q.data)
      return (
        <>
          <PageHeader title={t('form.editTitle')} />
          <LoadError error={q.error} onRetry={() => q.refetch()} />
        </>
      );
    if (!q.data.canManage)
      return (
        <>
          <PageHeader title={t('form.editTitle')} />
          <LoadError error={new ApiError(403, 'not_group_lead')} />
        </>
      );
    return <GroupFormInner group={q.data} template={null} />;
  }
  // Schritt 1: Vorlage wählen (undefined = noch nicht gewählt, null = ohne Vorlage)
  if (template === undefined) return <TemplateStep onPick={setTemplate} />;
  return <GroupFormInner group={null} template={template} onBack={() => setTemplate(undefined)} />;
}

function TemplateStep({ onPick }: { onPick: (t: GroupTemplate | null) => void }) {
  const { t } = useTranslation('groups');
  const q = useQuery({ queryKey: ['groups', 'templates'], queryFn: groupsApi.templates, staleTime: Infinity });
  return (
    <div className="form-page">
      <p>
        <Link to="/gruppen">
          <Icon name="arrowLeft" className="inline-icon" /> {t('common:actions.back')}
        </Link>
      </p>
      <PageHeader title={t('form.newTitle')} lead={t('form.newLead')} />
      <p className="step-indicator">{t('form.step', { n: 1, total: 2 })}</p>
      <section aria-labelledby="tpl-title">
        <h2 id="tpl-title">{t('form.templateTitle')}</h2>
        <p>{t('form.templateText')}</p>
        {q.isLoading ? <Loading /> : null}
        {q.error ? <LoadError error={q.error} onRetry={() => q.refetch()} /> : null}
        <ul className="plain-list template-grid">
          {(q.data ?? []).map((tpl) => (
            <li key={tpl.key}>
              <button type="button" className="template-tile" onClick={() => onPick(tpl)}>
                <span className="template-tile__name">{tpl.name}</span>
                <span className="template-tile__desc">{tpl.description}</span>
                <span className="template-tile__meta">
                  <TempoBadge tempo={tpl.defaultTempo} />
                  {tpl.series ? (
                    <span>
                      <Icon name="calendar" className="inline-icon" />{' '}
                      {t('form.templateSeries', { weekday: weekdayName(tpl.series.weekday), time: timeOfDayLabel(tpl.series.timeOfDay) })}
                    </span>
                  ) : null}
                </span>
                <span className="template-tile__cta">
                  {t('form.useTemplate')} <Icon name="arrowRight" className="inline-icon" />
                </span>
              </button>
            </li>
          ))}
          <li>
            <button type="button" className="template-tile template-tile--blank" onClick={() => onPick(null)}>
              <span className="template-tile__name">{t('form.noTemplate')}</span>
              <span className="template-tile__desc">{t('form.noTemplateText')}</span>
              <span className="template-tile__cta">
                {t('form.useBlank')} <Icon name="arrowRight" className="inline-icon" />
              </span>
            </button>
          </li>
        </ul>
      </section>
    </div>
  );
}

function GroupFormInner({ group, template, onBack }: { group: GroupDetail | null; template: GroupTemplate | null; onBack?: () => void }) {
  const { t } = useTranslation('groups');
  const navigate = useNavigate();
  const toast = useToast();
  const fieldErrors = useFieldErrors();
  const { data: me } = useMe();
  const editing = !!group;

  const [name, setName] = useState(group?.name ?? '');
  const [description, setDescription] = useState(group?.description ?? template?.description ?? '');
  const [rules, setRules] = useState(group?.rules ?? template?.rules ?? '');
  const [joinPolicy, setJoinPolicy] = useState<JoinPolicy>(group?.joinPolicy ?? template?.joinPolicy ?? 'open');
  const [womenOnly, setWomenOnly] = useState(group?.womenOnly ?? (!!template?.womenOnly && me?.gender === 'woman'));
  const [postalCode, setPostalCode] = useState(me?.postalCode ?? '');
  const [place, setPlace] = useState<Place | null>(null);
  const [tempo, setTempo] = useState<Tempo | ''>(group?.defaultTempo ?? template?.defaultTempo ?? 'zuegig');
  const [createSeries, setCreateSeries] = useState(!!template?.series);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const summaryRef = useRef<HTMLDivElement>(null);
  const canWomenOnly = me?.gender === 'woman' || (editing && group.womenOnly);

  // PLZ prüfen und Ort anzeigen
  useEffect(() => {
    if (editing || !/^\d{5}$/.test(postalCode)) {
      setPlace(null);
      return;
    }
    let alive = true;
    api
      .get<{ place: Place }>(`/geo/postal/${postalCode}`)
      .then((r) => alive && setPlace(r.place))
      .catch(() => alive && setPlace(null));
    return () => {
      alive = false;
    };
  }, [postalCode, editing]);

  const save = useAction({
    fn: (body: Record<string, unknown>) =>
      editing ? api.patch<{ group: GroupDetail }>(`/groups/${group!.id}`, body) : api.post<{ group: GroupDetail }>('/groups', body),
    invalidate: [qk.groups, qk.myGroups],
    onSuccess: (r) => {
      if (!editing && createSeries && template?.series) {
        // Der regelmäßige Termin braucht noch einen Treffpunkt → Terminformular mit Vorlage öffnen
        const ser = template.series;
        toast.success(t('form.createdNextSeries', { name: r.group.name }));
        const p = new URLSearchParams({
          gruppe: r.group.id,
          wochentag: String(ser.weekday),
          uhrzeit: ser.timeOfDay,
          dauer: String(ser.durationMinutes),
          tempo: ser.tempo,
          titel: template.name,
        });
        navigate(`/walks/neu?${p}`);
        return;
      }
      toast.success(editing ? t('form.saved') : t('form.created', { name: r.group.name }));
      navigate(`/gruppen/${r.group.id}`);
    },
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
    if (name.trim().length < 3) errs.name = t('form.nameRequired');
    if (!editing && !/^\d{5}$/.test(postalCode.trim())) errs.postalCode = t('form.postalRequired');
    if (!tempo) errs.defaultTempo = t('walks:form.tempoRequired');
    setErrors(errs);
    if (Object.keys(errs).length) {
      setTimeout(() => summaryRef.current?.focus(), 0);
      return;
    }
    if (save.isPending) return;
    const body: Record<string, unknown> = {
      name: name.trim(),
      description: description.trim(),
      rules: rules.trim(),
      joinPolicy,
      womenOnly,
      defaultTempo: tempo,
    };
    if (!editing) body.postalCode = postalCode.trim();
    save.mutate(body);
  }

  const errorList = Object.values(errors);

  return (
    <div className="form-page">
      <p>
        {onBack ? (
          <button type="button" className="btn btn--ghost" onClick={onBack}>
            <Icon name="arrowLeft" /> {t('form.backToTemplates')}
          </button>
        ) : (
          <Link to={`/gruppen/${group?.id ?? ''}`}>
            <Icon name="arrowLeft" className="inline-icon" /> {t('common:actions.back')}
          </Link>
        )}
      </p>
      <PageHeader title={editing ? t('form.editTitle') : t('form.newTitle')} lead={template ? t('form.withTemplate', { name: template.name }) : undefined} />
      {!editing ? <p className="step-indicator">{t('form.step', { n: 2, total: 2 })}</p> : null}

      {errorList.length ? (
        <div className="notice notice--error" role="alert" tabIndex={-1} ref={summaryRef}>
          <Icon name="warning" />
          <div>
            <p>
              <strong>{t('walks:form.errorSummary')}</strong>
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
        <section className="card form-section" aria-labelledby="gf-basic">
          <h2 id="gf-basic">{t('form.basicTitle')}</h2>
          <Field label={t('form.name')} hint={t('form.nameHint')} error={errors.name}>
            <input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </Field>
          {!editing ? (
            <Field label={t('form.postalCode')} hint={place ? t('form.placeFound', { city: place.city }) : t('form.postalHint')} error={errors.postalCode}>
              <input className="input input--short" inputMode="numeric" autoComplete="postal-code" maxLength={5} value={postalCode} onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, ''))} />
            </Field>
          ) : null}
          <Field label={t('form.description')} hint={t('form.descriptionHint')} optional error={errors.description}>
            <textarea className="textarea" value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label={t('form.rules')} hint={t('form.rulesHint')} optional error={errors.rules}>
            <textarea className="textarea" value={rules} maxLength={2000} onChange={(e) => setRules(e.target.value)} />
          </Field>
        </section>

        <section className="card form-section" aria-labelledby="gf-who">
          <h2 id="gf-who">{t('form.whoTitle')}</h2>
          <fieldset className="field">
            <legend>{t('form.joinPolicy')}</legend>
            <div className="choice-list">
              {JOIN_POLICIES.map((p) => (
                <label key={p} className="choice">
                  <input type="radio" name="joinPolicy" checked={joinPolicy === p} onChange={() => setJoinPolicy(p)} />
                  <span className="choice__text">
                    <strong>
                      <Icon name={joinPolicyIcon[p]} className="inline-icon" /> {t(`joinPolicy.${p}`)}
                    </strong>
                    {t(`joinPolicy.${p}_lead`)}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="field">
            <label className="switch">
              <input type="checkbox" role="switch" checked={womenOnly} disabled={!canWomenOnly} onChange={(e) => setWomenOnly(e.target.checked)} />
              <span>
                {t('form.womenOnly')} <span className="switch__state">({womenOnly ? t('walks:form.on') : t('walks:form.off')})</span>
              </span>
            </label>
            <span className="field__hint">{canWomenOnly ? t('form.womenOnlyHint') : t('form.womenOnlyNeedsGender')}</span>
          </div>
          <TempoPicker name="defaultTempo" legend={t('form.tempo')} value={tempo} onChange={setTempo} />
        </section>

        {!editing && template?.series ? (
          <section className="card form-section" aria-labelledby="gf-series">
            <h2 id="gf-series">{t('form.seriesTitle')}</h2>
            <label className="choice">
              <input type="checkbox" checked={createSeries} onChange={(e) => setCreateSeries(e.target.checked)} />
              <span className="choice__text">
                <strong>
                  {t('form.seriesCreate', { weekday: weekdayName(template.series.weekday), time: timeOfDayLabel(template.series.timeOfDay) })}
                </strong>
                {t('form.seriesHint', { duration: formatDuration(template.series.durationMinutes) })}
              </span>
            </label>
          </section>
        ) : null}

        {editing ? <PhotoUpload group={group} /> : null}

        <div className="btn-row form-actions">
          <button type="submit" className="btn btn--large" disabled={save.isPending}>
            <Icon name="check" /> {save.isPending ? t('common:status.saving') : editing ? t('form.save') : t('form.create')}
          </button>
          <Link className="btn btn--ghost" to={group ? `/gruppen/${group.id}` : '/gruppen'}>
            {t('common:actions.cancel')}
          </Link>
        </div>
      </form>
    </div>
  );
}

function PhotoUpload({ group }: { group: GroupDetail }) {
  const { t } = useTranslation('groups');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const upload = useAction({
    fn: (f: File) => {
      const form = new FormData();
      form.append('photo', f);
      return api.upload<{ photoUrl: string }>(`/groups/${group.id}/photo`, form);
    },
    success: t('form.photoSaved'),
    invalidate: [qk.group(group.id), qk.groups],
    onSuccess: () => setFile(null),
  });
  return (
    <section className="card form-section" aria-labelledby="gf-photo">
      <h2 id="gf-photo">{t('form.photoTitle')}</h2>
      {group.photoUrl ? <img className="photo-preview" src={group.photoUrl} alt={t('form.photoCurrent')} /> : null}
      <Field label={t('form.photoLabel')} hint={t('form.photoHint')} error={error}>
        <input
          className="input"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setError(f && f.size > 10 * 1024 * 1024 ? t('common:errors.file_too_large') : null);
            setFile(f);
          }}
        />
      </Field>
      <button type="button" className="btn btn--secondary" disabled={!file || !!error || upload.isPending} onClick={() => file && upload.mutate(file)}>
        <Icon name="upload" /> {upload.isPending ? t('common:status.saving') : t('form.photoUpload')}
      </button>
    </section>
  );
}
