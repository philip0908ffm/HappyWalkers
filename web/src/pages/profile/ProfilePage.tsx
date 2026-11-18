import '../../styles/pages-e.css';
import { LIMITS, badgeDefinition } from '@happywalkers/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../../api/client';
import type { Me, Place } from '../../api/types';
import type { ActivitiesPage, BadgesOverview, Follows, PersonRef } from '../../api/types-e';
import { BadgeEmblem } from '../../components/BadgeEmblem';
import { DropZone } from '../../components/DropZone';
import { Field } from '../../components/Field';
import { Icon, type IconName } from '../../components/Icon';
import { LoadError, Loading } from '../../components/Loading';
import { PageHeader } from '../../components/PageHeader';
import { PremiumTag } from '../../components/PremiumTag';
import { VisibilityHint } from '../../components/VisibilityHint';
import { useAction } from '../../hooks/useAction';
import { useErrorMessage } from '../../hooks/useErrorMessage';
import { useMe, useSetMe } from '../../hooks/useMe';
import { formatDate, formatDuration, formatKm } from '../../lib/format';
import { useBadgeText } from '../badges/badgeText';
import { ConfirmDialogE } from './parts/ConfirmDialogE';
import { PersonAvatar } from './parts/PersonAvatar';

export default function ProfilePage() {
  const { t } = useTranslation('people');
  const { data: me } = useMe();
  const location = useLocation();

  // Sprungziele (#eintraege, #kontakte) nach dem Laden anspringen
  useEffect(() => {
    if (!location.hash) return;
    const id = window.setTimeout(() => {
      const el = document.getElementById(location.hash.slice(1));
      el?.scrollIntoView();
    }, 300);
    return () => window.clearTimeout(id);
  }, [location.hash]);

  if (!me) return <Loading />;
  return (
    <div className="page-e">
      <PageHeader title={t('profile.title', { name: me.displayName })} lead={t('profile.lead')} />

      <nav aria-label={t('profile.onThisPage')} className="toc-e">
        <h2 className="toc-e__title">{t('profile.onThisPage')}</h2>
        <ul>
          <li><a href="#angaben">{t('profile.sectionAbout')}</a></li>
          <li><a href="#zahlen">{t('profile.sectionStats')}</a></li>
          <li><a href="#eintraege">{t('profile.sectionActivities')}</a></li>
          <li><a href="#kontakte">{t('profile.sectionContacts')}</a></li>
          <li><a href="#mehr">{t('profile.sectionMore')}</a></li>
        </ul>
      </nav>

      <QuickLinks me={me} />
      <AboutMe me={me} />
      <StatsAndShowcase />
      <MyActivities />
      <Contacts />
      <Blocked />
    </div>
  );
}

function QuickLinks({ me }: { me: Me }) {
  const { t } = useTranslation('people');
  const unread = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => api.get<{ unread: number }>('/notifications/unread-count').then((r) => r.unread),
    retry: false,
  });
  const links: { to: string; icon: IconName; label: string; extra?: ReactNode }[] = [
    {
      to: '/profil/nachrichten',
      icon: 'bell',
      label: t('profile.linkNotifications'),
      extra: unread.data ? <span className="badge-pill badge-pill--count">{t('profile.unread', { count: unread.data })}</span> : null,
    },
    { to: '/walk-eintragen', icon: 'plus', label: t('profile.linkLogWalk') },
    { to: '/abzeichen', icon: 'badge', label: t('profile.linkShowcase') },
    { to: '/fortschritt', icon: 'chart', label: t('profile.linkProgress'), extra: me.premium ? null : <PremiumTag /> },
    { to: '/in-der-naehe', icon: 'pin', label: t('profile.linkNearby') },
    { to: '/profil/einstellungen', icon: 'settings', label: t('profile.linkSettings') },
    { to: '/wer-sieht-was', icon: 'eye', label: t('profile.linkWhoSees') },
    ...(me.isAdmin ? [{ to: '/verwaltung', icon: 'settings' as IconName, label: t('admin:profileLink') }] : []),
  ];
  return (
    <section id="mehr" aria-labelledby="mehr-h" className="section-e">
      <h2 id="mehr-h" className="visually-hidden">
        {t('profile.sectionMore')}
      </h2>
      <ul className="link-tiles plain-list">
        {links.map((l) => (
          <li key={l.to}>
            <Link to={l.to} className="link-tile">
              <Icon name={l.icon} />
              <span>{l.label}</span>
              {l.extra}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AboutMe({ me }: { me: Me }) {
  const { t } = useTranslation('people');
  const setMe = useSetMe();
  const errMsg = useErrorMessage();
  const [name, setName] = useState(me.displayName);
  const [plz, setPlz] = useState(me.postalCode ?? '');
  const [bio, setBio] = useState(me.bio ?? '');
  const [errors, setErrors] = useState<{ name?: string; plz?: string; avatar?: string }>({});
  const [confirmRemove, setConfirmRemove] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const plzRef = useRef<HTMLInputElement>(null);

  const place = useQuery({
    queryKey: ['plz', plz],
    queryFn: () => api.get<{ place: Place }>(`/geo/postal/${plz}`).then((r) => r.place),
    enabled: /^\d{5}$/.test(plz),
    retry: false,
  });

  const save = useAction({
    fn: () => api.patch<{ me: Me }>('/me/profile', { displayName: name.trim(), postalCode: plz, bio: bio.trim() || null }),
    success: t('profile.saved'),
    onSuccess: (r) => setMe(r.me),
  });

  const avatar = useAction({
    fn: (file: File) => {
      const f = new FormData();
      f.append('photo', file);
      return api.upload<{ avatarUrl: string }>('/photos/avatar', f);
    },
    success: t('profile.avatarSaved'),
    invalidate: [['me']],
  });
  const removeAvatar = useAction({
    fn: () => api.del('/photos/avatar'),
    success: t('profile.avatarRemoved'),
    invalidate: [['me']],
    onSuccess: () => setConfirmRemove(false),
  });

  function onAvatar(file: File) {
    setErrors((e) => ({ ...e, avatar: undefined }));
    if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) && !/\.(jpe?g|png|webp|heic)$/i.test(file.name)) {
      setErrors((e) => ({ ...e, avatar: t('profile.avatarWrongType') }));
      return;
    }
    if (file.size > LIMITS.maxUploadBytes) {
      setErrors((e) => ({ ...e, avatar: t('common:errors.file_too_large') }));
      return;
    }
    avatar.mutate(file, { onError: (e) => setErrors((x) => ({ ...x, avatar: errMsg(e) })) });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!name.trim()) errs.name = t('profile.nameRequired');
    if (!/^\d{5}$/.test(plz)) errs.plz = t('profile.plzRequired');
    else if (place.isError) errs.plz = t('common:errors.postal_code_unknown');
    setErrors(errs);
    if (errs.name) return nameRef.current?.focus();
    if (errs.plz) return plzRef.current?.focus();
    if (!save.isPending) save.mutate(undefined);
  }

  return (
    <section id="angaben" aria-labelledby="angaben-h" className="card stack section-e">
      <h2 id="angaben-h">{t('profile.sectionAbout')}</h2>
      <div className="avatar-edit">
        <PersonAvatar name={me.displayName} url={me.avatarUrl} large />
        <div className="avatar-edit__controls">
          <DropZone
            label={t('profile.avatarLabel')}
            buttonLabel={me.avatarUrl ? t('profile.avatarChange') : t('profile.avatarChoose')}
            dropHint={t('profile.avatarDrop')}
            hint={t('profile.avatarHint')}
            accept="image/jpeg,image/png,image/webp,image/heic"
            disabled={avatar.isPending}
            error={errors.avatar}
            selectedName={avatar.isPending ? t('profile.avatarUploading') : null}
            onFile={onAvatar}
          />
          {me.avatarUrl ? (
            <button type="button" className="btn btn--ghost" onClick={() => setConfirmRemove(true)}>
              <Icon name="trash" /> {t('profile.avatarRemove')}
            </button>
          ) : null}
        </div>
      </div>

      <form onSubmit={submit} noValidate>
        <Field label={t('profile.name')} hint={t('profile.nameHint')} error={errors.name}>
          <input ref={nameRef} className="input" maxLength={40} autoComplete="nickname" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('profile.plz')} hint={t('profile.plzHint')} error={errors.plz}>
          <input
            ref={plzRef}
            className="input input--short"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={5}
            value={plz}
            onChange={(e) => setPlz(e.target.value.replace(/\D/g, ''))}
          />
        </Field>
        <p role="status" className="field__hint place-found-e">
          {place.data ? (
            <>
              <Icon name="pin" className="inline-icon" /> {t('profile.placeFound', { city: place.data.city })}
            </>
          ) : null}
        </p>
        <Field label={t('profile.bio')} hint={t('profile.bioHint')} optional>
          <textarea className="textarea" maxLength={300} value={bio} onChange={(e) => setBio(e.target.value)} />
        </Field>
        <button type="submit" className="btn" disabled={save.isPending}>
          <Icon name="check" /> {save.isPending ? t('common:status.saving') : t('profile.save')}
        </button>
      </form>
      <p className="field__hint">
        {t('profile.visibilityNow', { who: t(`profile:settings.profile_${me.settings.profileVisibility}`) })}{' '}
        <Link to="/profil/einstellungen">{t('profile.changeVisibility')}</Link>
      </p>

      <ConfirmDialogE
        open={confirmRemove}
        title={t('profile.avatarRemoveTitle')}
        confirmLabel={t('profile.avatarRemoveConfirm')}
        danger
        pending={removeAvatar.isPending}
        onClose={() => setConfirmRemove(false)}
        onConfirm={() => removeAvatar.mutate(undefined)}
      >
        <p>{t('profile.avatarRemoveText')}</p>
      </ConfirmDialogE>
    </section>
  );
}

function StatsAndShowcase() {
  const { t } = useTranslation('people');
  const bt = useBadgeText();
  const q = useQuery({ queryKey: ['badges'], queryFn: () => api.get<BadgesOverview>('/badges') });
  return (
    <section id="zahlen" aria-labelledby="zahlen-h" className="card stack section-e">
      <h2 id="zahlen-h">{t('profile.sectionStats')}</h2>
      {q.isLoading ? (
        <Loading />
      ) : q.isError || !q.data ? (
        <LoadError error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          <ul className="stat-tiles plain-list">
            <li className="stat-tile">
              <span className="stat-tile__value">{q.data.walksCount}</span>
              <span className="stat-tile__label">{t('profile.statWalks', { count: q.data.walksCount })}</span>
            </li>
            <li className="stat-tile">
              <span className="stat-tile__value">{formatKm(q.data.totalKm)}</span>
              <span className="stat-tile__label">{t('profile.statKm')}</span>
            </li>
            <li className="stat-tile">
              <span className="stat-tile__value">{q.data.groupWalksCount}</span>
              <span className="stat-tile__label">{t('profile.statGroupWalks', { count: q.data.groupWalksCount })}</span>
            </li>
            <li className="stat-tile stat-tile--accent">
              <span className="stat-tile__value">{q.data.points}</span>
              <span className="stat-tile__label">{t('profile.statPoints')}</span>
            </li>
          </ul>
          <h3>{t('profile.showcaseTitle')}</h3>
          {q.data.earned.length ? (
            <ul className="mini-badges plain-list">
              {[...q.data.earned]
                .sort((a, b) => b.awardedAt.localeCompare(a.awardedAt))
                .slice(0, 6)
                .map((b) => {
                  const def = badgeDefinition(b.key);
                  return (
                    <li key={b.key}>
                      <BadgeEmblem kind={b.kind ?? def?.kind ?? 'distance'} tier={b.tier ?? def?.tier ?? 1} size={72} />
                      <span>{bt.name(b.key, b.label)}</span>
                    </li>
                  );
                })}
            </ul>
          ) : (
            <p className="muted-text">{t('profile.showcaseEmpty')}</p>
          )}
          <Link to="/abzeichen" className="btn btn--secondary">
            <Icon name="badge" /> {t('profile.toShowcase')}
          </Link>
        </>
      )}
    </section>
  );
}

function MyActivities() {
  const { t } = useTranslation('people');
  const q = useInfiniteQuery({
    queryKey: ['activities', 'list'],
    queryFn: ({ pageParam }) => api.get<ActivitiesPage>(`/activities?limit=10${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: '' as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = q.data?.pages.flatMap((p) => p.activities) ?? [];
  return (
    <section id="eintraege" aria-labelledby="eintraege-h" className="card stack section-e">
      <h2 id="eintraege-h">{t('profile.sectionActivities')}</h2>
      <Link to="/walk-eintragen" className="btn">
        <Icon name="plus" /> {t('profile.linkLogWalk')}
      </Link>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <LoadError error={q.error} onRetry={() => q.refetch()} />
      ) : items.length ? (
        <>
          <ul className="plain-list activity-list-e">
            {items.map((a) => (
              <li key={a.id}>
                <Link to={`/eintraege/${a.id}`} className="activity-row-e">
                  <span className="activity-row-e__title">{a.title || t('profile.activityDefault', { date: formatDate(a.startedAt) })}</span>
                  <span className="activity-row-e__meta">
                    {t('common:units.km', { value: formatKm(a.distanceKm) })} · {formatDuration(a.durationMinutes)}
                    {a.title ? ` · ${formatDate(a.startedAt)}` : ''}
                  </span>
                  <VisibilityHint visibility={a.visibility} />
                </Link>
              </li>
            ))}
          </ul>
          {q.hasNextPage ? (
            <button type="button" className="btn btn--secondary" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
              {q.isFetchingNextPage ? t('common:status.loading') : t('common:actions.showMore')}
            </button>
          ) : null}
        </>
      ) : (
        <p className="muted-text">{t('profile.activitiesEmpty')}</p>
      )}
    </section>
  );
}

function PersonRow({ person, children }: { person: PersonRef; children?: ReactNode }) {
  return (
    <li className="person-row-e">
      <PersonAvatar name={person.displayName} url={person.avatarUrl} />
      <Link to={`/personen/${person.id}`} className="person-row-e__name">
        {person.displayName}
      </Link>
      {children ? <div className="btn-row person-row-e__actions">{children}</div> : null}
    </li>
  );
}

function Contacts() {
  const { t } = useTranslation('people');
  const q = useQuery({ queryKey: ['follows'], queryFn: () => api.get<Follows>('/follows') });
  const [confirm, setConfirm] = useState<{ kind: 'removeFollower' | 'unfollow'; person: PersonRef } | null>(null);

  const accept = useAction({
    fn: (p: PersonRef) => api.post(`/follows/requests/${p.id}/accept`),
    success: (_r, p) => t('contacts.accepted', { name: p.displayName }),
    invalidate: [['follows']],
  });
  const decline = useAction({
    fn: (p: PersonRef) => api.post(`/follows/requests/${p.id}/decline`),
    success: (_r, p) => t('contacts.declined', { name: p.displayName }),
    invalidate: [['follows']],
  });
  const withdraw = useAction({
    fn: (p: PersonRef) => api.del(`/users/${p.id}/follow`),
    success: t('person.requestWithdrawn'),
    invalidate: [['follows']],
  });
  const removeFollower = useAction({
    fn: (p: PersonRef) => api.del(`/follows/followers/${p.id}`),
    success: (_r, p) => t('contacts.removed', { name: p.displayName }),
    invalidate: [['follows']],
    onSuccess: () => setConfirm(null),
  });
  const unfollow = useAction({
    fn: (p: PersonRef) => api.del(`/users/${p.id}/follow`),
    success: (_r, p) => t('contacts.unfollowed', { name: p.displayName }),
    invalidate: [['follows']],
    onSuccess: () => setConfirm(null),
  });

  return (
    <section id="kontakte" aria-labelledby="kontakte-h" className="card stack section-e">
      <h2 id="kontakte-h">{t('contacts.title')}</h2>
      <p>{t('contacts.intro')}</p>
      {q.isLoading ? (
        <Loading />
      ) : q.isError || !q.data ? (
        <LoadError error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <>
          <h3>{t('contacts.requests', { count: q.data.requests.length })}</h3>
          {q.data.requests.length ? (
            <ul className="plain-list">
              {q.data.requests.map((p) => (
                <PersonRow key={p.id} person={p}>
                  <button type="button" className="btn" disabled={accept.isPending} onClick={() => accept.mutate(p)}>
                    <Icon name="check" /> {t('contacts.accept')}
                  </button>
                  <button type="button" className="btn btn--secondary" disabled={decline.isPending} onClick={() => decline.mutate(p)}>
                    <Icon name="close" /> {t('contacts.decline')}
                  </button>
                </PersonRow>
              ))}
            </ul>
          ) : (
            <p className="muted-text">{t('contacts.noRequests')}</p>
          )}
          {q.data.sentRequests?.length ? (
            <>
              <h3>{t('contacts.sent', { count: q.data.sentRequests.length })}</h3>
              <ul className="plain-list">
                {q.data.sentRequests.map((p) => (
                  <PersonRow key={p.id} person={p}>
                    <button type="button" className="btn btn--ghost" disabled={withdraw.isPending} onClick={() => withdraw.mutate(p)}>
                      {t('person.withdraw')}
                    </button>
                  </PersonRow>
                ))}
              </ul>
            </>
          ) : null}
          <h3>{t('contacts.followers', { count: q.data.followers.length })}</h3>
          <p className="field__hint">{t('contacts.followersHint')}</p>
          {q.data.followers.length ? (
            <ul className="plain-list">
              {q.data.followers.map((p) => (
                <PersonRow key={p.id} person={p}>
                  <button type="button" className="btn btn--ghost" onClick={() => setConfirm({ kind: 'removeFollower', person: p })}>
                    {t('contacts.remove')}
                  </button>
                </PersonRow>
              ))}
            </ul>
          ) : (
            <p className="muted-text">{t('contacts.noFollowers')}</p>
          )}
          <h3>{t('contacts.following', { count: q.data.following.length })}</h3>
          {q.data.following.length ? (
            <ul className="plain-list">
              {q.data.following.map((p) => (
                <PersonRow key={p.id} person={p}>
                  <button type="button" className="btn btn--ghost" onClick={() => setConfirm({ kind: 'unfollow', person: p })}>
                    {t('contacts.unfollow')}
                  </button>
                </PersonRow>
              ))}
            </ul>
          ) : (
            <p className="muted-text">{t('contacts.noFollowing')}</p>
          )}
        </>
      )}
      <ConfirmDialogE
        open={!!confirm}
        title={confirm ? t(`contacts.${confirm.kind}Title`, { name: confirm.person.displayName }) : ''}
        confirmLabel={confirm ? t(`contacts.${confirm.kind}Confirm`) : ''}
        pending={removeFollower.isPending || unfollow.isPending}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (!confirm) return;
          if (confirm.kind === 'removeFollower') removeFollower.mutate(confirm.person);
          else unfollow.mutate(confirm.person);
        }}
      >
        <p>{confirm ? t(`contacts.${confirm.kind}Text`, { name: confirm.person.displayName }) : null}</p>
      </ConfirmDialogE>
    </section>
  );
}

function Blocked() {
  const { t } = useTranslation('people');
  const q = useQuery({ queryKey: ['blocks'], queryFn: () => api.get<{ blocked: PersonRef[] }>('/blocks') });
  const unblock = useAction({
    fn: (p: PersonRef) => api.del(`/users/${p.id}/block`),
    success: (_r, p) => t('block.unblocked', { name: p.displayName }),
    invalidate: [['blocks']],
  });
  return (
    <section aria-labelledby="blocked-h" className="card stack section-e">
      <h2 id="blocked-h">{t('block.listTitle')}</h2>
      <p>{t('block.listIntro')}</p>
      {q.isLoading ? (
        <Loading />
      ) : q.isError || !q.data ? (
        <LoadError error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.blocked.length ? (
        <ul className="plain-list">
          {q.data.blocked.map((p) => (
            <li key={p.id} className="person-row-e">
              <PersonAvatar name={p.displayName} url={p.avatarUrl} />
              <span className="person-row-e__name">{p.displayName}</span>
              <div className="btn-row person-row-e__actions">
                <button type="button" className="btn btn--secondary" disabled={unblock.isPending} onClick={() => unblock.mutate(p)}>
                  {t('common:actions.unblock')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted-text">{t('block.listEmpty')}</p>
      )}
    </section>
  );
}
