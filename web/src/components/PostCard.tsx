import { useQuery } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Comment, Post } from '../api/types-walks';
import { useAction } from '../hooks/useAction';
import { useMe } from '../hooks/useMe';
import { formatDateShort, formatDuration, formatKm, formatTime } from '../lib/format';
import { Avatar } from './Avatar';
import { ConfirmDialog } from './ConfirmDialog';
import { Field } from './Field';
import { Icon } from './Icon';
import { LoadError, Loading } from './Loading';
import { ReportDialog } from './ReportDialog';
import { VisibilityHint } from './VisibilityHint';

/**
 * Ein Beitrag in den Neuigkeiten (Gruppe, Profil, Startseite).
 * Herz und Kommentare sind echte Knöpfe mit Text; Löschen nur nach Rückfrage.
 */
export function PostCard({ post, headingLevel = 3 }: { post: Post; headingLevel?: 2 | 3 | 4 }) {
  const { t } = useTranslation('groups');
  const H = `h${headingLevel}` as 'h2' | 'h3' | 'h4';
  const [showComments, setShowComments] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reporting, setReporting] = useState(false);
  const commentsId = useId();
  const { data: me } = useMe();
  const isOwn = me?.id === post.author.id;

  const like = useAction({
    fn: (liked: boolean) =>
      liked ? api.del<{ likeCount: number; likedByMe: boolean }>(`/posts/${post.id}/like`) : api.put<{ likeCount: number; likedByMe: boolean }>(`/posts/${post.id}/like`),
    success: (_r, liked) => (liked ? t('feed.unliked') : t('feed.liked')),
    invalidate: [['feed']],
  });
  const del = useAction({
    fn: () => api.del(`/posts/${post.id}`),
    success: t('feed.deleted'),
    invalidate: [['feed']],
    onSuccess: () => setConfirmDelete(false),
  });

  return (
    <article className="post-card">
      <header className="post-card__head">
        <Avatar person={post.author} />
        <div>
          <H className="post-card__author">
            <Link to={`/personen/${post.author.id}`}>{post.author.displayName}</Link>
          </H>
          <p className="post-card__meta">
            <span>
              {formatDateShort(post.createdAt)}, {formatTime(post.createdAt)}
            </span>
            {post.group ? (
              <span>
                <Icon name="group" className="inline-icon" /> <Link to={`/gruppen/${post.group.id}`}>{post.group.name}</Link>
              </span>
            ) : null}
            <VisibilityHint visibility={post.walk?.kind === 'distance' ? 'walkParticipants' : post.visibility} />
          </p>
        </div>
      </header>

      {post.activity ? (
        <p className="post-card__activity">
          <Icon name="walk" className="inline-icon" />{' '}
          {t('feed.activity', { km: formatKm(post.activity.distanceKm), duration: formatDuration(post.activity.durationMinutes) })}
        </p>
      ) : null}
      {post.walk ? (
        <p className="post-card__activity">
          <Icon name="calendar" className="inline-icon" /> <Link to={`/walks/${post.walk.id}`}>{post.walk.title}</Link>
        </p>
      ) : null}
      {post.text ? <p className="post-card__text">{post.text}</p> : null}
      {post.photos.length ? (
        <div className="post-card__photos">
          {post.photos.map((p) => (
            <img key={p.id} src={p.url} alt={p.altText || t('feed.photoNoAlt')} width={p.width} height={p.height} loading="lazy" />
          ))}
        </div>
      ) : null}

      <div className="post-card__actions btn-row">
        <button
          type="button"
          className={`btn btn--secondary heart-btn ${post.likedByMe ? 'heart-btn--on' : ''}`}
          aria-pressed={post.likedByMe}
          disabled={like.isPending}
          onClick={() => like.mutate(post.likedByMe)}
        >
          <Icon name="heart" /> {post.likedByMe ? t('feed.likedLabel') : t('feed.like')}
          <span className="heart-btn__count">({t('feed.hearts', { count: post.likeCount })})</span>
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          aria-expanded={showComments}
          aria-controls={commentsId}
          onClick={() => setShowComments((s) => !s)}
        >
          <Icon name="comment" /> {t('feed.comments', { count: post.commentCount })}
        </button>
        {post.canDelete ? (
          <button type="button" className="btn btn--ghost" onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" /> {t('common:actions.delete')}
          </button>
        ) : null}
        {me && !isOwn ? (
          <button type="button" className="btn btn--ghost" aria-haspopup="dialog" onClick={() => setReporting(true)}>
            <Icon name="flag" /> {t('feed.report')}
          </button>
        ) : null}
      </div>

      <div id={commentsId} hidden={!showComments}>
        {showComments ? <Comments postId={post.id} /> : null}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={t('feed.deleteTitle')}
        confirmLabel={t('feed.deleteConfirm')}
        danger
        busy={del.isPending}
        onConfirm={() => del.mutate(undefined)}
        onCancel={() => setConfirmDelete(false)}
      >
        <p>{t('feed.deleteText')}</p>
      </ConfirmDialog>
      <ReportDialog
        open={reporting}
        onClose={() => setReporting(false)}
        targetType="post"
        targetId={post.id}
        name={t('feed.reportPostName', { name: post.author.displayName })}
      />
    </article>
  );
}

function Comments({ postId }: { postId: string }) {
  const { t } = useTranslation('groups');
  const key = ['feed', 'comments', postId];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<{ comments: Comment[] }>(`/posts/${postId}/comments`).then((r) => r.comments) });
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [toReport, setToReport] = useState<Comment | null>(null);
  const { data: me } = useMe();

  const add = useAction({
    fn: (body: string) => api.post(`/posts/${postId}/comments`, { text: body }),
    success: t('feed.commentSent'),
    invalidate: [['feed']],
    onSuccess: () => setText(''),
  });
  const del = useAction({
    fn: (id: string) => api.del(`/comments/${id}`),
    success: t('feed.commentDeleted'),
    invalidate: [['feed']],
    onSuccess: () => setToDelete(null),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) {
      setError(t('feed.commentRequired'));
      return;
    }
    setError(null);
    if (!add.isPending) add.mutate(text.trim());
  }

  return (
    <div className="comments">
      {q.isLoading ? <Loading /> : null}
      {q.error ? <LoadError error={q.error} onRetry={() => q.refetch()} /> : null}
      {q.data && q.data.length === 0 ? <p>{t('feed.noComments')}</p> : null}
      {q.data && q.data.length > 0 ? (
        <ul className="plain-list comments__list">
          {q.data.map((c) => (
            <li key={c.id} className="comment">
              <Avatar person={c.author} size="small" />
              <div>
                <p className="comment__head">
                  <strong>{c.author.displayName}</strong> <span className="comment__date">{formatDateShort(c.createdAt)}, {formatTime(c.createdAt)}</span>
                </p>
                <p className="comment__text">{c.text}</p>
                {c.canDelete ? (
                  <button type="button" className="btn btn--ghost" onClick={() => setToDelete(c.id)}>
                    <Icon name="trash" /> {t('feed.commentDelete')}
                  </button>
                ) : null}
                {me && me.id !== c.author.id ? (
                  <button type="button" className="btn btn--ghost" aria-haspopup="dialog" onClick={() => setToReport(c)}>
                    <Icon name="flag" /> {t('feed.commentReport')}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <form onSubmit={onSubmit} noValidate className="comments__form">
        <Field label={t('feed.commentLabel')} error={error}>
          <textarea className="textarea textarea--short" value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} />
        </Field>
        <button type="submit" className="btn" disabled={add.isPending}>
          <Icon name="comment" /> {add.isPending ? t('common:status.sending') : t('feed.commentSend')}
        </button>
      </form>
      <ConfirmDialog
        open={toDelete != null}
        title={t('feed.commentDeleteTitle')}
        confirmLabel={t('feed.commentDelete')}
        danger
        busy={del.isPending}
        onConfirm={() => toDelete && del.mutate(toDelete)}
        onCancel={() => setToDelete(null)}
      />
      <ReportDialog
        open={toReport != null}
        onClose={() => setToReport(null)}
        targetType="comment"
        targetId={toReport?.id ?? ''}
        name={t('feed.reportCommentName', { name: toReport?.author.displayName ?? '' })}
      />
    </div>
  );
}
