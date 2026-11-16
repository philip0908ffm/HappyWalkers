import { useEffect, useId, useRef, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../../components/Icon';

/**
 * Bestätigungsdialog für Paket E (eigene Variante, solange es keinen gemeinsamen ConfirmDialog gibt).
 * - echtes <dialog> (Fokus bleibt im Dialog, Esc schließt, Fokus kehrt danach zurück)
 * - Fokus startet auf „Abbrechen“ – nichts passiert aus Versehen
 * - während die Aktion läuft, ist der Bestätigungsknopf gesperrt
 * - `children` darf Formularfelder enthalten; Absenden = Bestätigen
 */
export function ConfirmDialogE({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel,
  danger,
  pending,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const { t } = useTranslation();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
      // Fokus auf das erste Eingabefeld, sonst auf „Abbrechen“
      const firstField = d.querySelector<HTMLElement>('input:not([type=hidden]), textarea, select');
      (firstField ?? cancelRef.current)?.focus();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!pending) onConfirm();
  }

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={`${id}-t`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {open ? (
        <form onSubmit={submit} noValidate>
          <h2 id={`${id}-t`}>{title}</h2>
          <div className="dialog__body">{children}</div>
          <div className="btn-row dialog__actions">
            <button type="submit" className={`btn ${danger ? 'btn--danger' : ''}`} disabled={pending}>
              {pending ? t('status.saving') : confirmLabel}
            </button>
            <button ref={cancelRef} type="button" className="btn btn--secondary" onClick={onClose}>
              <Icon name="close" /> {cancelLabel ?? t('actions.cancel')}
            </button>
          </div>
        </form>
      ) : null}
    </dialog>
  );
}
