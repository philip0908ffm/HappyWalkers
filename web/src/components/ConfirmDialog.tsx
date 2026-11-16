import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

/**
 * Bestätigungsdialog für folgenreiche Aktionen (natives <dialog>):
 * - Fokus startet auf „Abbrechen“ (der sichere Weg), Escape bricht ab.
 * - Nach dem Schließen kehrt der Fokus zum auslösenden Knopf zurück.
 * - Während die Aktion läuft (`busy`), sind beide Knöpfe gesperrt.
 *
 * <ConfirmDialog open={open} title="Walk absagen?" confirmLabel="Ja, absagen" danger
 *   onConfirm={() => cancel.mutate()} onCancel={() => setOpen(false)}>Alle Zusagenden …</ConfirmDialog>
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel,
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      returnTo.current = document.activeElement as HTMLElement | null;
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
      cancelRef.current?.focus();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  // Fokus zurückgeben, wenn der Dialog geschlossen wurde
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onClose = () => {
      const el = returnTo.current;
      if (el && document.contains(el)) el.focus();
    };
    d.addEventListener('close', onClose);
    return () => d.removeEventListener('close', onClose);
  }, []);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      aria-describedby={children ? bodyId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <h2 id={titleId} className="dialog__title">
        {danger ? <Icon name="warning" className="inline-icon" /> : null} {title}
      </h2>
      {children ? (
        <div id={bodyId} className="dialog__body">
          {children}
        </div>
      ) : null}
      <div className="btn-row dialog__actions">
        <button type="button" className={`btn ${danger ? 'btn--danger' : ''}`} disabled={busy} onClick={onConfirm}>
          {busy ? t('status.saving') : confirmLabel}
        </button>
        <button ref={cancelRef} type="button" className="btn btn--secondary" disabled={busy} onClick={onCancel}>
          {cancelLabel ?? t('actions.cancel')}
        </button>
      </div>
    </dialog>
  );
}
