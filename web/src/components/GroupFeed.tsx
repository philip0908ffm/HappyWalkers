import { useInfiniteQuery } from '@tanstack/react-query';
import { LIMITS } from '@gehmeinsam/shared';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../api/client';
import type { Post, Visibility } from '../api/types-walks';
import { useAction } from '../hooks/useAction';
import { DropZone } from './DropZone';
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
  hintVisibility,
  headingLevel = 3,
  emptyText,
}: {
  groupId?: string;
  walkId?: string;
  userId?: string;
  canPost?: boolean;
  postVisibility?: Visibility;
  /** abweichender Sichtbarkeits-Hinweis, z. B. 'walkParticipants' bei „Gemeinsam auf Distanz“ */
  hintVisibility?: string;
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
      {canPost && !notReady ? <Composer groupId={groupId} walkId={walkId} visibility={postVisibility} hintVisibility={hintVisibility} /> : null}
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

const PHOTO_TYPES = /^image\/(jpeg|png|webp|heic|heif)$/i;
const PHOTO_EXT = /\.(jpe?g|png|webp|heic|heif)$/i;

/**
 * Eingabe für einen neuen Beitrag – mit freiwilligem Foto (Klick ODER Ziehen und Ablegen).
 * Ablauf laut API: erst `POST /photos` (ohne postId) → Foto-ID, dann `POST /posts` mit `photoIds`.
 * Die Bildbeschreibung ist Pflicht (wird für blinde und sehbehinderte Menschen vorgelesen).
 */
function Composer({
  groupId,
  walkId,
  visibility,
  hintVisibility,
}: {
  groupId?: string;
  walkId?: string;
  visibility: Visibility;
  hintVisibility?: string;
}) {
  const { t } = useTranslation('groups');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [alt, setAlt] = useState('');
  const [errors, setErrors] = useState<{ text?: string; photo?: string; alt?: string }>({});
  const textRef = useRef<HTMLTextAreaElement>(null);
  const altRef = useRef<HTMLTextAreaElement>(null);
  // bereits hochgeladenes Foto merken – falls nur das Speichern des Beitrags scheitert, nicht doppelt hochladen
  const uploaded = useRef<{ file: File; alt: string; id: string } | null>(null);
  const hint = <VisibilityHint visibility={hintVisibility ?? visibility} />;

  // Vorschau-Adresse freigeben, wenn das Foto wechselt oder die Seite verlassen wird
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const send = useAction({
    fn: async (v: { text: string; file: File | null; alt: string }) => {
      let photoIds: string[] | undefined;
      if (v.file) {
        const u = uploaded.current;
        if (u && u.file === v.file && u.alt === v.alt) {
          photoIds = [u.id];
        } else {
          const form = new FormData();
          form.append('photo', v.file);
          form.append('altText', v.alt);
          form.append('visibility', visibility);
          if (groupId) form.append('groupId', groupId);
          const r = await api.upload<{ photo: { id: string } }>('/photos', form);
          uploaded.current = { file: v.file, alt: v.alt, id: r.photo.id };
          photoIds = [r.photo.id];
        }
      }
      return api.post<{ post: Post }>('/posts', { text: v.text, visibility, groupId, walkId, photoIds });
    },
    success: (_r, v) => (v.file ? t('feed.postedWithPhoto') : t('feed.posted')),
    invalidate: [['feed']],
    onSuccess: () => {
      setText('');
      setFile(null);
      setAlt('');
      uploaded.current = null;
    },
  });

  function onFile(f: File) {
    if (!PHOTO_TYPES.test(f.type) && !PHOTO_EXT.test(f.name)) {
      setErrors((e) => ({ ...e, photo: t('feed.photoWrongType') }));
      return;
    }
    if (f.size > LIMITS.maxUploadBytes) {
      setErrors((e) => ({ ...e, photo: t('common:errors.file_too_large') }));
      return;
    }
    setErrors((e) => ({ ...e, photo: undefined }));
    setFile(f);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!text.trim() && !file) errs.text = t('feed.postRequired');
    if (file && !alt.trim()) errs.alt = t('feed.photoAltRequired');
    setErrors(errs);
    if (errs.text) return textRef.current?.focus();
    if (errs.alt) return altRef.current?.focus();
    if (!send.isPending) send.mutate({ text: text.trim(), file, alt: alt.trim() });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="card feed__composer">
      <Field label={t('feed.postLabel')} hint={hint} error={errors.text}>
        <textarea ref={textRef} className="textarea textarea--short" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} />
      </Field>

      {file && preview ? (
        <div className="feed__photo stack">
          <img className="photo-preview" src={preview} alt={t('feed.photoPreviewAlt')} />
          <p className="feed__photo-name">
            <Icon name="check" className="inline-icon" /> {t('feed.photoSelected', { name: file.name })}
          </p>
          <Field label={t('feed.photoAltLabel')} hint={t('feed.photoAltHint')} error={errors.alt}>
            <textarea ref={altRef} className="textarea textarea--short" maxLength={300} value={alt} onChange={(e) => setAlt(e.target.value)} />
          </Field>
          <p className="field__hint">
            {t('feed.photoVisibility')} {hint}
          </p>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn--ghost"
              disabled={send.isPending}
              onClick={() => {
                setFile(null);
                setAlt('');
                setErrors((x) => ({ ...x, alt: undefined }));
              }}
            >
              <Icon name="trash" /> {t('feed.photoRemove')}
            </button>
          </div>
        </div>
      ) : (
        <DropZone
          label={t('feed.photoLabel')}
          buttonLabel={t('feed.photoAdd')}
          dropHint={t('feed.photoDrop')}
          hint={t('feed.photoHint')}
          accept="image/jpeg,image/png,image/webp,image/heic"
          disabled={send.isPending}
          error={errors.photo}
          onFile={onFile}
        />
      )}

      <button type="submit" className="btn" disabled={send.isPending}>
        <Icon name="share" /> {send.isPending ? t('common:status.sending') : t('feed.postSend')}
      </button>
    </form>
  );
}
