import { TEMPOS, type Tempo } from '@happywalkers/shared';
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { GroupDetail, GroupMember, MemberAction, SeriesSummary } from '../../api/types-walks';
import { groupsApi, qk, walksApi } from '../../api/walks';
import { Avatar } from '../../components/Avatar';
import { Calendar } from '../../components/Calendar';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Field } from '../../components/Field';
import { Icon } from '../../components/Icon';
import { LoadError, Loading } from '../../components/Loading';
import { PageHeader } from '../../components/PageHeader';
import { TempoBadge } from '../../components/Tempo';
import { useAction } from '../../hooks/useAction';
import { useMe } from '../../hooks/useMe';
import { timeOfDayLabel, weekdayName } from '../../lib/dates';
import { formatDate, formatDateShort, formatDuration, formatTime } from '../../lib/format';

export default function GroupAdmin() {
  const { id = '' } = useParams();
  const { t } = useTranslation('groups');
  const q = useQuery({ queryKey: qk.group(id), queryFn: () => groupsApi.get(id) });
  if (q.isLoading) return <Loading />;
  if (q.error || !q.data)
    return (
      <>
        <PageHeader title={t('admin.title')} />
        <LoadError error={q.error} onRetry={() => q.refetch()} />
      </>
    );
  if (!q.data.canManage)
    return (
      <>
        <PageHeader title={t('admin.title')} />
        <LoadError error={new ApiError(403, 'not_group_lead')} />
        <Link to={`/gruppen/${id}`}>{t('admin.backToGroup')}</Link>
      </>
    );
  return <Admin group={q.data} />;
}

type Pending = { member: GroupMember; action: MemberAction } | null;

function Admin({ group }: { group: GroupDetail }) {
  const { t } = useTranslation('groups');
  const { data: me } = useMe();
  const navigate = useNavigate();
  const membersQ = useQuery({ queryKey: qk.members(group.id), queryFn: () => groupsApi.members(group.id) });
  const [pending, setPending] = useState<Pending>(null);
  const [askDelete, setAskDelete] = useState(false);

  const act = useAction({
    fn: ({ member, action }: { member: GroupMember; action: MemberAction }) =>
      api.patch<{ member: GroupMember }>(`/groups/${group.id}/members/${member.id}`, { action }),
    success: (_r, v) => t(`admin.done.${v.action}`, { name: v.member.displayName }),
    invalidate: [qk.members(group.id), qk.group(group.id), qk.myGroups],
    onSuccess: () => setPending(null),
  });
  const del = useAction({
    fn: () => api.del(`/groups/${group.id}`),
    success: t('admin.deleted', { name: group.name }),
    invalidate: [qk.groups, qk.myGroups],
    onSuccess: () => navigate('/gruppen', { replace: true }),
  });

  const members = membersQ.data ?? [];
  const requests = members.filter((m) => m.status === 'pending');
  const active = members.filter((m) => m.status === 'active');
  const banned = members.filter((m) => m.status === 'banned');

  const ask = (member: GroupMember, action: MemberAction) => setPending({ member, action });

  return (
    <div className="admin-page">
      <p>
        <Link to={`/gruppen/${group.id}`}>
          <Icon name="arrowLeft" className="inline-icon" /> {t('admin.backToGroup')}
        </Link>
      </p>
      <PageHeader
        title={t('admin.title')}
        lead={group.name}
        actions={
          <>
            <Link className="btn btn--secondary" to={`/walks/neu?gruppe=${group.id}`}>
              <Icon name="plus" /> {t('detail.newWalk')}
            </Link>
            <Link className="btn btn--secondary" to={`/gruppen/${group.id}/bearbeiten`}>
              <Icon name="edit" /> {t('detail.edit')}
            </Link>
            <Link className="btn btn--secondary" to={`/gruppen/${group.id}/aushang`}>
              <Icon name="print" /> {t('invite.poster')}
            </Link>
          </>
        }
      />

      {membersQ.isLoading ? <Loading /> : null}
      {membersQ.error ? <LoadError error={membersQ.error} onRetry={() => membersQ.refetch()} /> : null}

      <section className={`card ${requests.length ? 'card--attention' : ''}`} aria-labelledby="req-title">
        <h2 id="req-title">
          <Icon name="mail" className="inline-icon" /> {t('admin.requests', { count: requests.length })}
        </h2>
        {membersQ.data && requests.length === 0 ? <p>{t('admin.noRequests')}</p> : null}
        <ul className="plain-list request-list">
          {requests.map((m) => (
            <li key={m.id} className="request-item">
              <div className="request-item__who">
                <Avatar person={m} />
                <div>
                  <p className="request-item__name">{m.displayName}</p>
                  <p className="field__hint">{t('admin.requestedAt', { date: formatDateShort(m.joinedAt) })}</p>
                  {m.requestMessage ? <blockquote className="request-item__msg">{m.requestMessage}</blockquote> : null}
                </div>
              </div>
              <div className="btn-row">
                <button type="button" className="btn" onClick={() => ask(m, 'approve')}>
                  <Icon name="check" /> {t('admin.action.approve')}
                  <span className="visually-hidden">: {m.displayName}</span>
                </button>
                <button type="button" className="btn btn--secondary" onClick={() => ask(m, 'decline')}>
                  <Icon name="close" /> {t('admin.action.decline')}
                  <span className="visually-hidden">: {m.displayName}</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card" aria-labelledby="mem-title">
        <h2 id="mem-title">
          <Icon name="people2" className="inline-icon" /> {t('admin.members', { count: active.length })}
        </h2>
        <p className="field__hint">{t('admin.membersHint')}</p>
        <div className="table-wrap" tabIndex={0} role="group" aria-labelledby="mem-title">
          <table className="data member-table">
            <caption className="visually-hidden">{t('admin.members', { count: active.length })}</caption>
            <thead>
              <tr>
                <th scope="col">{t('admin.col.name')}</th>
                <th scope="col">{t('admin.col.role')}</th>
                <th scope="col">{t('admin.col.since')}</th>
                <th scope="col">{t('admin.col.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {active.map((m) => {
                const self = m.id === me?.id;
                const founderRow = m.role === 'founder';
                return (
                  <tr key={m.id}>
                    <th scope="row" className="member-table__name">
                      <Avatar person={m} size="small" /> {m.displayName}
                      {self ? <span className="field__hint"> ({t('admin.you')})</span> : null}
                    </th>
                    <td>{t(`role.${m.role}`)}</td>
                    <td>{formatDateShort(m.joinedAt)}</td>
                    <td>
                      {self || founderRow ? (
                        <span className="field__hint">—</span>
                      ) : (
                        <div className="table-actions">
                          {group.isFounder && m.role === 'member' ? (
                            <button type="button" className="btn btn--secondary btn--small" onClick={() => ask(m, 'make_moderator')}>
                              <Icon name="star" /> {t('admin.action.make_moderator')}
                              <span className="visually-hidden">: {m.displayName}</span>
                            </button>
                          ) : null}
                          {group.isFounder && m.role === 'moderator' ? (
                            <>
                              <button type="button" className="btn btn--secondary btn--small" onClick={() => ask(m, 'remove_moderator')}>
                                {t('admin.action.remove_moderator')}
                                <span className="visually-hidden">: {m.displayName}</span>
                              </button>
                              <button type="button" className="btn btn--secondary btn--small" onClick={() => ask(m, 'make_founder')}>
                                {t('admin.action.make_founder')}
                                <span className="visually-hidden">: {m.displayName}</span>
                              </button>
                            </>
                          ) : null}
                          {m.role === 'member' || group.isFounder ? (
                            <>
                              <button type="button" className="btn btn--secondary btn--small" onClick={() => ask(m, 'remove')}>
                                <Icon name="logout" /> {t('admin.action.remove')}
                                <span className="visually-hidden">: {m.displayName}</span>
                              </button>
                              <button type="button" className="btn btn--secondary btn--small btn--danger-outline" onClick={() => ask(m, 'ban')}>
                                <Icon name="block" /> {t('admin.action.ban')}
                                <span className="visually-hidden">: {m.displayName}</span>
                              </button>
                            </>
                          ) : null}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {banned.length ? (
        <section className="card" aria-labelledby="ban-title">
          <h2 id="ban-title">
            <Icon name="block" className="inline-icon" /> {t('admin.banned', { count: banned.length })}
          </h2>
          <ul className="plain-list request-list">
            {banned.map((m) => (
              <li key={m.id} className="request-item">
                <div className="request-item__who">
                  <Avatar person={m} size="small" /> <span>{m.displayName}</span>
                </div>
                <button type="button" className="btn btn--secondary" onClick={() => ask(m, 'unban')}>
                  {t('admin.action.unban')}
                  <span className="visually-hidden">: {m.displayName}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <GroupCalendar group={group} />
      <SeriesAdmin group={group} />

      {group.isFounder ? (
        <section className="card danger-zone" aria-labelledby="danger-title">
          <h2 id="danger-title">{t('admin.dangerTitle')}</h2>
          <p>{t('admin.deleteText')}</p>
          <button type="button" className="btn btn--danger" onClick={() => setAskDelete(true)}>
            <Icon name="trash" /> {t('admin.delete')}
          </button>
        </section>
      ) : null}

      <ConfirmDialog
        open={pending != null}
        title={pending ? t(`admin.confirm.${pending.action}.title`, { name: pending.member.displayName }) : ''}
        confirmLabel={pending ? t(`admin.confirm.${pending.action}.button`) : ''}
        danger={pending?.action === 'remove' || pending?.action === 'ban' || pending?.action === 'make_founder'}
        busy={act.isPending}
        onConfirm={() => pending && act.mutate(pending)}
        onCancel={() => setPending(null)}
      >
        {pending ? (
          <>
            <p>{t(`admin.confirm.${pending.action}.text`, { name: pending.member.displayName })}</p>
            {['remove', 'ban', 'decline'].includes(pending.action) ? (
              <p className="notice notice--info">
                <Icon name="info" />
                <span>{t('admin.notNotified')}</span>
              </p>
            ) : null}
          </>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={askDelete}
        title={t('admin.deleteTitle', { name: group.name })}
        confirmLabel={t('admin.deleteConfirm')}
        danger
        busy={del.isPending}
        onConfirm={() => del.mutate(undefined)}
        onCancel={() => setAskDelete(false)}
      >
        <p>{t('admin.deleteWarning')}</p>
      </ConfirmDialog>
    </div>
  );
}

function GroupCalendar({ group }: { group: GroupDetail }) {
  const { t } = useTranslation('groups');
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const from = new Date(ym.y, ym.m, 1);
  const to = new Date(ym.y, ym.m + 1, 1);
  const params = new URLSearchParams({ groupId: group.id, from: from.toISOString(), to: to.toISOString() });
  const q = useQuery({ queryKey: [...qk.walks, 'group', group.id, params.toString()], queryFn: () => walksApi.search(params) });
  const walks = q.data?.walks ?? [];

  return (
    <section className="card" aria-labelledby="cal-title">
      <h2 id="cal-title">
        <Icon name="calendar" className="inline-icon" /> {t('admin.calendarTitle')}
      </h2>
      <Calendar
        year={ym.y}
        month={ym.m}
        onChange={(y, m) => setYm({ y, m })}
        events={walks.map((w) => ({ id: w.id, startsAt: w.startsAt, title: w.title, href: `/walks/${w.id}`, cancelled: w.status === 'cancelled' }))}
      />
      {q.isLoading ? <Loading /> : null}
      {q.error ? <LoadError error={q.error} onRetry={() => q.refetch()} /> : null}
      <h3 className="calendar-list-title">{t('admin.calendarList')}</h3>
      {q.data && walks.length === 0 ? <p>{t('admin.calendarEmpty')}</p> : null}
      {walks.length ? (
        <ul className="plain-list cal-list">
          {walks.map((w) => (
            <li key={w.id} className={w.status === 'cancelled' ? 'cal-list__cancelled' : undefined}>
              <span className="cal-list__date">
                {formatDate(w.startsAt)}, {formatTime(w.startsAt)}
              </span>
              <Link to={`/walks/${w.id}`}>{w.title}</Link>
              <span className="cal-list__info">
                {w.status === 'cancelled' ? t('walks:card.cancelled') : t('walks:card.participants', { count: w.participantCount })}
                {w.confirmed ? ` · ${t('walks:card.confirmed')}` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function SeriesAdmin({ group }: { group: GroupDetail }) {
  const { t } = useTranslation('groups');
  const [editing, setEditing] = useState<string | null>(null);
  const [ending, setEnding] = useState<SeriesSummary | null>(null);
  const end = useAction({
    fn: (id: string) => api.del(`/walks/series/${id}`),
    success: t('admin.seriesEnded'),
    invalidate: [qk.group(group.id), qk.walks],
    onSuccess: () => setEnding(null),
  });
  const active = group.series.filter((s) => s.active);
  return (
    <section className="card" aria-labelledby="series-admin-title">
      <h2 id="series-admin-title">{t('admin.seriesTitle')}</h2>
      <p className="field__hint">{t('admin.seriesHint')}</p>
      {active.length === 0 ? <p>{t('admin.seriesEmpty')}</p> : null}
      <ul className="plain-list series-list">
        {active.map((s) => (
          <li key={s.id} className="series-item">
            <p className="series-item__when">{t('detail.seriesWhen', { weekday: weekdayName(s.weekday), time: timeOfDayLabel(s.timeOfDay) })}</p>
            <p className="series-item__title">{s.title}</p>
            <p className="walk-card__meta">
              <TempoBadge tempo={s.tempo} />
              <span>{formatDuration(s.durationMinutes)}</span>
            </p>
            {editing === s.id ? (
              <SeriesForm groupId={group.id} series={s} onDone={() => setEditing(null)} />
            ) : (
              <div className="btn-row">
                <button type="button" className="btn btn--secondary" onClick={() => setEditing(s.id)}>
                  <Icon name="edit" /> {t('admin.seriesEdit')}
                  <span className="visually-hidden">: {s.title}</span>
                </button>
                <button type="button" className="btn btn--secondary btn--danger-outline" onClick={() => setEnding(s)}>
                  <Icon name="close" /> {t('admin.seriesEnd')}
                  <span className="visually-hidden">: {s.title}</span>
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <Link className="btn" to={`/walks/neu?gruppe=${group.id}`}>
        <Icon name="plus" /> {t('admin.seriesNew')}
      </Link>
      <ConfirmDialog
        open={ending != null}
        title={t('admin.seriesEndTitle', { title: ending?.title ?? '' })}
        confirmLabel={t('admin.seriesEndConfirm')}
        danger
        busy={end.isPending}
        onConfirm={() => ending && end.mutate(ending.id)}
        onCancel={() => setEnding(null)}
      >
        <p>{t('admin.seriesEndText')}</p>
      </ConfirmDialog>
    </section>
  );
}

function SeriesForm({ groupId, series, onDone }: { groupId: string; series: SeriesSummary; onDone: () => void }) {
  const { t } = useTranslation('groups');
  const [title, setTitle] = useState(series.title);
  const [weekday, setWeekday] = useState(series.weekday);
  const [time, setTime] = useState(series.timeOfDay.slice(0, 5));
  const [duration, setDuration] = useState(series.durationMinutes);
  const [tempo, setTempo] = useState<Tempo>(series.tempo);
  const [error, setError] = useState<string | null>(null);
  const save = useAction({
    fn: (body: Partial<SeriesSummary>) => api.patch(`/walks/series/${series.id}`, body),
    success: t('admin.seriesSaved'),
    invalidate: [qk.group(groupId), qk.walks],
    onSuccess: onDone,
  });
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError(t('admin.seriesTitleRequired'));
    setError(null);
    if (!save.isPending) save.mutate({ title: title.trim(), weekday, timeOfDay: time, durationMinutes: duration, tempo });
  }
  return (
    <form onSubmit={onSubmit} noValidate className="series-form">
      <Field label={t('admin.seriesName')} error={error}>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="form-row">
        <Field label={t('walks:form.weekday')}>
          <select className="select" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
            {[1, 2, 3, 4, 5, 6, 0].map((w) => (
              <option key={w} value={w}>
                {weekdayName(w)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('walks:form.time')}>
          <input className="input" type="time" value={time} step={300} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label={t('walks:form.duration')}>
          <select className="select" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
            {[...new Set([30, 45, 60, 75, 90, 120, 150, 180, duration])].sort((a, b) => a - b).map((m) => (
              <option key={m} value={m}>
                {formatDuration(m)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('common:tempo.label')}>
          <select className="select" value={tempo} onChange={(e) => setTempo(e.target.value as Tempo)}>
            {TEMPOS.map((x) => (
              <option key={x} value={x}>
                {t(`common:tempo.${x}`)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="field__hint">{t('admin.seriesEditHint')}</p>
      <div className="btn-row">
        <button type="submit" className="btn" disabled={save.isPending}>
          <Icon name="check" /> {save.isPending ? t('common:status.saving') : t('common:actions.save')}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onDone}>
          {t('common:actions.cancel')}
        </button>
      </div>
    </form>
  );
}
