import { useInfiniteQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import type { Post, Visibility } from '../api/types-walks';
import { useAction } from '../hooks/useAction';
import { Field } from './Field';
import { Icon } from './Icon';
import { LoadError, Loading } from './Loading';
import { PostCard } from './PostCard';
import { VisibilityHint } from './VisibilityHint';

/**
 * Neuigkeiten (Beitragsliste) mit optionalem Eingabefeld.
 * Wiederverwendbar: Gruppe (`groupId`), Distanz-Walk (`walkId`), Person (`userId`) oder alles (ohne Filter).
 * Sichtbare Texte sprechen von „Neuigkeiten“, nicht von „Feed“.
 */
export function GroupFeed({
  groupId,
  walkId,
  userId,
  canPost = false,
  postVisibility = 'group',
  headingLevel = 3,
  emptyText,
}: {
  groupId?: string;
  walkId?: string;
  userId?: string;
  canPost?: boolean;
  postVisibility?: Visibility;
  headingLevel?: 2 | 3 | 4;
  emptyText?: string;
}) {
  const { t } = useTranslation('groups');
  const filter = new URLSearchParams();
  if (groupId) filter.set('groupId', groupId);
  if (walkId) filter.set('walkId', walkId);
  if (userId) filter.set('userId', userId);

  const q = useInfiniteQuery({
    queryKey: ['feed', { groupId, walkId, userId }],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      const p = new URLSearchParams(filter);
      if (pageParam) p.set('cursor', pageParam);
      return api.get<{ posts: Post[]; nextCursor: string | null }>(`/feed?${p}`);
    },
    getNextPageParam: (last) => last.nextCursor,
  });

  const posts = q.data?.pages.flatMap((p) => p.posts) ?? [];
  // Solange Paket C noch nicht fertig ist, freundlicher Platzhalter statt Fehlermeldung
  const notReady = q.error instanceof ApiError && (q.error.status === 404 || q.error.status === 501);

  return (
    <div className="feed">
      {canPost && !notReady ? <Composer groupId={groupId} walkId={walkId} visibility={postVisibility} /> : null}
      {q.isLoading ? <Loading /> : null}
      {notReady ? (
        <div className="empty-state">
          <Icon name="comment" />
          <p>{t('feed.notReady')}</p>
        </div>
      ) : q.error ? (
        <LoadError error={q.error} onRetry={() => q.refetch()} />
      ) : null}
      {q.data && posts.length === 0 ? (
        <div className="empty-state">
          <Icon name="comment" />
          <p>{emptyText ?? t('feed.empty')}</p>
        </div>
      ) : null}
      {posts.length ? (
        <ul className="plain-list feed__list">
          {posts.map((p) => (
            <li key={p.id}>
              <PostCard post={p} headingLevel={headingLevel} />
            </li>
          ))}
        </ul>
      ) : null}
      {q.hasNextPage ? (
        <button type="button" className="btn btn--secondary" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
          {q.isFetchingNextPage ? t('common:status.loading') : t('feed.more')}
        </button>
      ) : null}
    </div>
  );
}

function Composer({ groupId, walkId, visibility }: { groupId?: string; walkId?: string; visibility: Visibility }) {
  const { t } = useTranslation('groups');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const send = useAction({
    fn: (body: string) => api.post<{ post: Post }>('/posts', { text: body, visibility, groupId, walkId }),
    success: t('feed.posted'),
    invalidate: [['feed']],
    onSuccess: () => setText(''),
  });
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) {
      setError(t('feed.postRequired'));
      return;
    }
    setError(null);
    if (!send.isPending) send.mutate(text.trim());
  }
  return (
    <form onSubmit={onSubmit} noValidate className="card feed__composer">
      <Field label={t('feed.postLabel')} hint={<VisibilityHint visibility={visibility} />} error={error}>
        <textarea className="textarea textarea--short" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} />
      </Field>
      <button type="submit" className="btn" disabled={send.isPending}>
        <Icon name="share" /> {send.isPending ? t('common:status.sending') : t('feed.postSend')}
      </button>
    </form>
  );
}
