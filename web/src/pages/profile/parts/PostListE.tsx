import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../../../api/client';
import type { Post } from '../../../api/types-e';
import { Icon } from '../../../components/Icon';
import { LoadError, Loading } from '../../../components/Loading';
import { VisibilityHint } from '../../../components/VisibilityHint';
import { useAction } from '../../../hooks/useAction';
import { formatDateTime, formatDuration, formatKm } from '../../../lib/format';
import { PersonAvatar } from './PersonAvatar';

/**
 * Schlichte Beitragsliste für Paket E (Beiträge einer Person, Neuigkeiten eines „Gemeinsam auf Distanz“-Termins).
 * Eigene Variante, solange es keinen gemeinsamen PostCard-Baustein gibt.
 */
export function PostListE({ filter, emptyText, headingLevel = 3 }: { filter: { userId?: string; walkId?: string }; emptyText: string; headingLevel?: 2 | 3 | 4 }) {
  const { t } = useTranslation('people');
  const qs = new URLSearchParams(Object.entries(filter).filter(([, v]) => !!v) as [string, string][]).toString();
  const key = ['feed', filter];
  const q = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) =>
      api.get<{ posts: Post[]; nextCursor: string | null }>(`/feed?${qs}${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`),
    initialPageParam: '' as string,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  if (q.isLoading) return <Loading />;
  if (q.isError) return <LoadError error={q.error} onRetry={() => q.refetch()} />;
  const posts = q.data?.pages.flatMap((p) => p.posts) ?? [];
  if (!posts.length) return <p className="muted-text">{emptyText}</p>;

  return (
    <>
      <ul className="plain-list post-list-e">
        {posts.map((p) => (
          <li key={p.id}>
            <PostItem post={p} queryKey={key} headingLevel={headingLevel} />
          </li>
        ))}
      </ul>
      {q.hasNextPage ? (
        <button type="button" className="btn btn--secondary" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
          {q.isFetchingNextPage ? t('common:status.loading') : t('common:actions.showMore')}
        </button>
      ) : null}
    </>
  );
}

function PostItem({ post, queryKey, headingLevel }: { post: Post; queryKey: unknown[]; headingLevel: 2 | 3 | 4 }) {
  const { t } = useTranslation('people');
  const qc = useQueryClient();
  const H = `h${headingLevel}` as 'h3';
  const like = useAction({
    fn: () =>
      post.likedByMe
        ? api.del<{ likeCount: number; likedByMe: boolean }>(`/posts/${post.id}/like`)
        : api.put<{ likeCount: number; likedByMe: boolean }>(`/posts/${post.id}/like`),
    success: (r) => (r.likedByMe ? t('posts.liked') : t('posts.unliked')),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  return (
    <article className="card post-e">
      <header className="post-e__head">
        <PersonAvatar name={post.author.displayName} url={post.author.avatarUrl} />
        <div>
          <H className="post-e__author">
            <Link to={`/personen/${post.author.id}`}>{post.author.displayName}</Link>
          </H>
          <p className="post-e__meta">
            {formatDateTime(post.createdAt)}
            {post.group ? (
              <>
                {' · '}
                <Link to={`/gruppen/${post.group.id}`}>{post.group.name}</Link>
              </>
            ) : null}
            {' · '}
            <VisibilityHint visibility={post.visibility} />
          </p>
        </div>
      </header>
      {post.activity ? (
        <p className="post-e__activity">
          <Icon name="walk" className="inline-icon" />{' '}
          {t('posts.activity', { km: formatKm(post.activity.distanceKm), duration: formatDuration(post.activity.durationMinutes) })}
        </p>
      ) : null}
      {post.text ? <p className="post-e__text">{post.text}</p> : null}
      {post.photos.length ? (
        <div className="post-e__photos">
          {post.photos.map((ph) => (
            <img key={ph.id} src={ph.url} alt={ph.altText || t('posts.photoNoAlt')} width={ph.width} height={ph.height} loading="lazy" />
          ))}
        </div>
      ) : null}
      <div className="btn-row">
        <button type="button" className="btn btn--secondary" aria-pressed={post.likedByMe} disabled={like.isPending} onClick={() => like.mutate(undefined)}>
          <Icon name="heart" className={post.likedByMe ? 'icon-heart--on' : undefined} />
          {post.likedByMe ? t('posts.unlike') : t('posts.like')}
          <span className="post-e__count">{t('posts.likeCount', { count: post.likeCount })}</span>
        </button>
        <span className="post-e__comments">
          <Icon name="comment" className="inline-icon" /> {t('posts.commentCount', { count: post.commentCount })}
        </span>
      </div>
    </article>
  );
}
