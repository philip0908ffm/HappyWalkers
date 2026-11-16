import { useId, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * Datei wählen per Klick (großer Knopf, auch per Tastatur) ODER per Ziehen und Ablegen.
 * Das Ablegen ist nur eine Abkürzung – der Knopf funktioniert immer.
 * Texte kommen vom Aufrufer (i18n).
 */
export function DropZone({
  label,
  buttonLabel,
  dropHint,
  hint,
  accept,
  disabled,
  error,
  selectedName,
  onFile,
  children,
}: {
  label: string;
  buttonLabel: string;
  dropHint: string;
  hint?: ReactNode;
  accept?: string;
  disabled?: boolean;
  error?: string | null;
  /** angezeigter Dateiname (z. B. „Morgenrunde.gpx ausgewählt“) */
  selectedName?: string | null;
  onFile: (file: File) => void;
  children?: ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const id = useId();

  function pick(files: FileList | null) {
    const f = files?.[0];
    if (f && !disabled) onFile(f);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    pick(e.dataTransfer.files);
  }

  return (
    <div className="field">
      <span className="dropzone__label" id={`${id}-label`}>
        {label}
      </span>
      {hint ? (
        <span className="field__hint" id={`${id}-hint`}>
          {hint}
        </span>
      ) : null}
      <div
        role="group"
        aria-labelledby={`${id}-label`}
        className={`dropzone ${over ? 'dropzone--over' : ''} ${error ? 'dropzone--error' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <Icon name="upload" className="dropzone__icon" />
        <button
          type="button"
          className="btn btn--secondary"
          disabled={disabled}
          aria-describedby={[hint ? `${id}-hint` : '', error ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined}
          onClick={() => inputRef.current?.click()}
        >
          <Icon name="upload" /> {buttonLabel}
        </button>
        <span className="dropzone__drop" aria-hidden="true">
          {dropHint}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            pick(e.target.files);
            e.target.value = '';
          }}
        />
        {children}
      </div>
      <p role="status" className="dropzone__selected">
        {selectedName ? (
          <>
            <Icon name="check" className="inline-icon" /> {selectedName}
          </>
        ) : null}
      </p>
      {error ? (
        <p id={`${id}-err`} className="field__error">
          <Icon name="warning" /> {error}
        </p>
      ) : null}
    </div>
  );
}
