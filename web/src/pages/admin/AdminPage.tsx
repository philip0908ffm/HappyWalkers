import './admin.css';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { authClient } from '../../api/auth';
import { api, ApiError } from '../../api/client';
import type { AdminReport } from '../../api/types';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Field } from '../../components/Field';
import { Icon } from '../../components/Icon';
import { LoadError, Loading } from '../../components/Loading';
import { PageHeader } from '../../components/PageHeader';
import { TabPanel, Tabs } from '../../components/Tabs';
import { useAction } from '../../hooks/useAction';
import { useMe } from '../../hooks/useMe';
import { formatDateTime } from '../../lib/format';
import NotFound from '../info/NotFound';

/**
 * Verwaltung (/verwaltung) – nur für Personen mit Rolle „admin“, alle anderen sehen die 404-Seite.
 * Meldungen über /api/v1/admin/*, Personen über die Better-Auth-Admin-Endpunkte (authClient.admin).
 */
export default function AdminPage() {
  const { t } = useTranslation('admin');
  const { data: me, isLoading } = useMe();
  const [tab, setTab] = useState<'reports' | 'people'>('reports');
  if (isLoading) return <Loading />;
  if (!me?.isAdmin) return <NotFound />;
  return (
    <>
      <PageHeader title={t('title')} lead={t('lead')} />
      <Tabs
        id="verwaltung"
        label={t('tabsLabel')}
        selected={tab}
        onSelect={setTab}
        tabs={[
          { key: 'reports', label: t('tabReports'), icon: 'flag' },
          { key: 'people', label: t('tabPeople'), icon: 'people2' },
        ]}
      />
      <TabPanel id="verwaltung" tabKey="reports" selected={tab}>
        <Reports />
      </TabPanel>
      <TabPanel id="verwaltung" tabKey="people" selected={tab}>
        <People myId={me.id} />
      </TabPanel>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Meldungen                                                           */
/* ------------------------------------------------------------------ */

type ReportsPage = { reports: AdminReport[]; nextCursor: string | null };

function Reports() {
  const { t } = useTranslation('admin');
  const [status, setStatus] = useState<'open' | 'closed'>('open');
  const [toRemove, setToRemove] = useState<AdminReport | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusHeading = () => setTimeout(() => headingRef.current?.focus(), 0);

  const q = useInfiniteQuery({
    queryKey: ['admin', 'reports', status],
    queryFn: ({ pageParam }) =>
      api.get<ReportsPage>(`/admin/reports?status=${status}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: '',
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const reports = q.data?.pages.flatMap((p) => p.reports) ?? [];

  const close = useAction({
    fn: (id: string) => api.post(`/admin/reports/${id}/close`),
    success: t('reports.closed'),
    invalidate: [['admin', 'reports']],
    onSuccess: focusHeading,
  });
  const remove = useAction({
    fn: (id: string) => api.post(`/admin/reports/${id}/remove-content`),
    success: t('reports.removed'),
    invalidate: [['admin', 'reports']],
    onSuccess: () => {
      setToRemove(null);
      focusHeading();
    },
  });

  return (
    <section aria-labelledby="reports-h">
      <h2 id="reports-h" ref={headingRef} tabIndex={-1}>
        {t('reports.title')}
      </h2>
      <fieldset className="field">
        <legend>{t('reports.statusLabel')}</legend>
        <div className="choice-list choice-list--row">
          <label className="choice">
            <input type="radio" name="report-status" checked={status === 'open'} onChange={() => setStatus('open')} />
            {t('reports.statusOpen')}
          </label>
          <label className="choice">
            <input type="radio" name="report-status" checked={status === 'closed'} onChange={() => setStatus('closed')} />
            {t('reports.statusClosed')}
          </label>
        </div>
      </fieldset>

      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <LoadError error={q.error} onRetry={() => q.refetch()} />
      ) : !reports.length ? (
        <div className="empty-state" role="status">
          <Icon name="check" />
          <p>{status === 'open' ? t('reports.emptyOpen') : t('reports.emptyClosed')}</p>
        </div>
      ) : (
        <>
          <div className="table-wrap" tabIndex={0} role="group" aria-labelledby="reports-h">
            <table className="data admin-table">
              <caption className="visually-hidden">{t('reports.caption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('reports.colWhat')}</th>
                  <th scope="col">{t('reports.colAuthor')}</th>
                  <th scope="col">{t('reports.colReporter')}</th>
                  <th scope="col">{t('reports.colReason')}</th>
                  <th scope="col">{t('reports.colDate')}</th>
                  <th scope="col">{t('reports.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => {
                  const typeLabel = t(`reports.type.${r.target.type}`);
                  return (
                    <tr key={r.id}>
                      <th scope="row">
                        <strong>{typeLabel}</strong>
                        <br />
                        {r.target.exists ? (
                          <span className="admin-table__excerpt">{r.target.excerpt ?? t('reports.noText')}</span>
                        ) : (
                          <span className="field__hint">{t('reports.gone')}</span>
                        )}
                      </th>
                      <td>{r.target.author ? r.target.author.displayName || t('reports.unknownPerson') : '—'}</td>
                      <td>{r.reporter ? r.reporter.displayName || t('reports.unknownPerson') : t('reports.unknownPerson')}</td>
                      <td className="admin-table__reason">{r.reason}</td>
                      <td>{formatDateTime(r.createdAt)}</td>
                      <td>
                        {r.status === 'open' ? (
                          <div className="table-actions">
                            <button
                              type="button"
                              className="btn btn--secondary btn--small"
                              disabled={close.isPending}
                              onClick={() => close.mutate(r.id)}
                            >
                              <Icon name="check" /> {t('reports.close')}
                              <span className="visually-hidden">: {typeLabel}</span>
                            </button>
                            {r.target.removable ? (
                              <button type="button" className="btn btn--small btn--danger-outline" onClick={() => setToRemove(r)}>
                                <Icon name="trash" /> {t('reports.remove')}
                                <span className="visually-hidden">: {typeLabel}</span>
                              </button>
                            ) : null}
                          </div>
                        ) : (
                          <span className="status-pill">{t('reports.done')}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {q.hasNextPage ? (
            <button type="button" className="btn btn--secondary" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
              {t('reports.more')}
            </button>
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={!!toRemove}
        danger
        title={t('reports.removeTitle')}
        confirmLabel={t('reports.removeConfirm')}
        busy={remove.isPending}
        onConfirm={() => toRemove && remove.mutate(toRemove.id)}
        onCancel={() => setToRemove(null)}
      >
        <p>{t('reports.removeText', { type: toRemove ? t(`reports.type.${toRemove.target.type}`) : '' })}</p>
        {toRemove?.target.excerpt ? <blockquote className="admin-quote">{toRemove.target.excerpt}</blockquote> : null}
      </ConfirmDialog>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Personen (Better-Auth-Admin-Plugin)                                 */
/* ------------------------------------------------------------------ */

interface AdminUser {
  id: string;
  name: string;
  /** null bei Konten, die nur per SMS-Code angelegt wurden */
  email: string | null;
  role?: string | null;
  banned?: boolean | null;
  banReason?: string | null;
}

type AuthResult<T> = { data: T | null; error: { status: number; code?: string; message?: string } | null };

/** Better-Auth-Antwort in Daten oder ApiError umwandeln (Fehlertexte über i18n: errors.<code>). */
async function unwrap<T>(p: Promise<unknown>): Promise<T> {
  const { data, error } = (await p) as AuthResult<T>;
  if (error) throw new ApiError(error.status, (error.code || error.message || 'server_error').toLowerCase());
  return data as T;
}

const isAdminRole = (role?: string | null) => !!role && role.split(',').some((r) => r.trim() === 'admin');
const LIST_LIMIT = 50;

type PendingAction = { user: AdminUser; action: 'ban' | 'unban' | 'makeAdmin' | 'removeAdmin' } | null;

function People({ myId }: { myId: string }) {
  const { t } = useTranslation('admin');
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<PendingAction>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  const q = useQuery({
    queryKey: ['admin', 'users', search],
    queryFn: () =>
      unwrap<{ users: AdminUser[]; total: number }>(
        authClient.admin.listUsers({
          query: {
            limit: LIST_LIMIT,
            sortBy: 'createdAt',
            sortDirection: 'desc',
            ...(search
              ? { searchValue: search, searchField: search.includes('@') ? 'email' : 'name', searchOperator: 'contains' }
              : {}),
          },
        }),
      ),
  });

  const nameOf = (u: AdminUser) => u.name || t('people.noName');
  const act = useAction({
    fn: async (p: NonNullable<PendingAction> & { reason?: string }) => {
      if (p.action === 'ban') return unwrap(authClient.admin.banUser({ userId: p.user.id, banReason: p.reason }));
      if (p.action === 'unban') return unwrap(authClient.admin.unbanUser({ userId: p.user.id }));
      return unwrap(authClient.admin.setRole({ userId: p.user.id, role: p.action === 'makeAdmin' ? 'admin' : 'user' }));
    },
    success: (_r, p) =>
      t(
        { ban: 'people.banned', unban: 'people.unbanned', makeAdmin: 'people.madeAdmin', removeAdmin: 'people.removedAdmin' }[p.action],
        { name: nameOf(p.user) },
      ),
    invalidate: [['admin', 'users']],
    onSuccess: () => setPending(null),
  });

  function onSearch(e: FormEvent) {
    e.preventDefault();
    setSearch(input.trim());
  }

  function ask(user: AdminUser, action: NonNullable<PendingAction>['action']) {
    setReason('');
    setReasonError(null);
    setPending({ user, action });
  }

  function confirm() {
    if (!pending) return;
    if (pending.action === 'ban') {
      const r = reason.trim();
      if (!r) {
        setReasonError(t('people.banReasonRequired'));
        reasonRef.current?.focus();
        return;
      }
      act.mutate({ ...pending, reason: r });
      return;
    }
    act.mutate(pending);
  }

  const users = q.data?.users ?? [];
  const dialogTexts = pending
    ? {
        ban: { title: t('people.banTitle', { name: nameOf(pending.user) }), text: t('people.banText'), confirm: t('people.banConfirm') },
        unban: { title: t('people.unbanTitle', { name: nameOf(pending.user) }), text: t('people.unbanText'), confirm: t('people.unbanConfirm') },
        makeAdmin: { title: t('people.makeAdminTitle', { name: nameOf(pending.user) }), text: t('people.makeAdminText'), confirm: t('people.makeAdminConfirm') },
        removeAdmin: { title: t('people.removeAdminTitle', { name: nameOf(pending.user) }), text: t('people.removeAdminText'), confirm: t('people.removeAdminConfirm') },
      }[pending.action]
    : null;

  return (
    <section aria-labelledby="people-h">
      <h2 id="people-h">{t('people.title')}</h2>
      <div className="notice notice--info">
        <Icon name="lock" />
        <p>{t('people.privacyHint')}</p>
      </div>
      <form onSubmit={onSearch} className="admin-search" role="search" aria-label={t('people.title')}>
        <Field label={t('people.search')} hint={t('people.searchHint')}>
          <input className="input" type="search" value={input} onChange={(e) => setInput(e.target.value)} autoComplete="off" />
        </Field>
        <button type="submit" className="btn">
          <Icon name="search" /> {t('people.searchButton')}
        </button>
      </form>

      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <LoadError error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          <p role="status">
            {users.length ? t('people.count', { count: q.data?.total ?? users.length }) : t('people.empty')}
            {q.data && q.data.total > users.length ? ` ${t('people.showing', { shown: users.length })}` : null}
          </p>
          {users.length ? (
            <div className="table-wrap" tabIndex={0} role="group" aria-labelledby="people-h">
              <table className="data admin-table">
                <caption className="visually-hidden">{t('people.caption')}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t('people.colName')}</th>
                    <th scope="col">{t('people.colEmail')}</th>
                    <th scope="col">{t('people.colRole')}</th>
                    <th scope="col">{t('people.colStatus')}</th>
                    <th scope="col">{t('people.colActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const self = u.id === myId;
                    const admin = isAdminRole(u.role);
                    const name = nameOf(u);
                    return (
                      <tr key={u.id}>
                        <th scope="row">
                          {name}
                          {self ? <span className="field__hint"> ({t('people.you')})</span> : null}
                        </th>
                        <td className="admin-table__email">{u.email && !u.email.endsWith('.invalid') ? u.email : t('people.phoneOnly')}</td>
                        <td>{admin ? t('people.roleAdmin') : t('people.roleUser')}</td>
                        <td>
                          {u.banned ? (
                            <>
                              <span className="status-pill status-pill--error">
                                <Icon name="block" /> {t('people.statusBanned')}
                              </span>
                              {u.banReason ? <span className="field__hint">{t('people.bannedReason', { reason: u.banReason })}</span> : null}
                            </>
                          ) : (
                            t('people.statusActive')
                          )}
                        </td>
                        <td>
                          {self ? (
                            <span className="field__hint">{t('people.selfHint')}</span>
                          ) : (
                            <div className="table-actions">
                              {u.banned ? (
                                <button type="button" className="btn btn--secondary btn--small" onClick={() => ask(u, 'unban')}>
                                  <Icon name="check" /> {t('people.unban')}
                                  <span className="visually-hidden">: {name}</span>
                                </button>
                              ) : (
                                <button type="button" className="btn btn--small btn--danger-outline" onClick={() => ask(u, 'ban')}>
                                  <Icon name="block" /> {t('people.ban')}
                                  <span className="visually-hidden">: {name}</span>
                                </button>
                              )}
                              {admin ? (
                                <button type="button" className="btn btn--secondary btn--small" onClick={() => ask(u, 'removeAdmin')}>
                                  {t('people.removeAdmin')}
                                  <span className="visually-hidden">: {name}</span>
                                </button>
                              ) : (
                                <button type="button" className="btn btn--secondary btn--small" onClick={() => ask(u, 'makeAdmin')}>
                                  <Icon name="star" /> {t('people.makeAdmin')}
                                  <span className="visually-hidden">: {name}</span>
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={!!pending}
        danger={pending?.action === 'ban' || pending?.action === 'removeAdmin'}
        title={dialogTexts?.title ?? ''}
        confirmLabel={dialogTexts?.confirm ?? ''}
        busy={act.isPending}
        onConfirm={confirm}
        onCancel={() => setPending(null)}
      >
        <p>{dialogTexts?.text}</p>
        {pending?.action === 'ban' ? (
          <Field label={t('people.banReason')} hint={t('people.banReasonHint')} error={reasonError}>
            <textarea ref={reasonRef} className="input" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
        ) : null}
      </ConfirmDialog>
    </section>
  );
}
