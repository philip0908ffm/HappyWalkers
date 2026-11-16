import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * Formularfeld mit Beschriftung, Hinweis und Fehlermeldung (sauber verknüpft für Screenreader).
 * <Field label="Postleitzahl" hint="5 Ziffern" error={err}><input className="input" /></Field>
 */
export function Field({
  label,
  hint,
  error,
  children,
  optional,
  optionalLabel = '(freiwillig)',
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: ReactElement<Record<string, unknown>>;
  optional?: boolean;
  optionalLabel?: string;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id: (children.props.id as string) ?? id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
      })
    : children;
  const controlId = (isValidElement(children) && (children.props.id as string)) || id;
  return (
    <div className="field">
      <label htmlFor={controlId}>
        {label} {optional ? <span className="field__hint" style={{ display: 'inline' }}>{optionalLabel}</span> : null}
      </label>
      {hint ? (
        <span id={hintId} className="field__hint">
          {hint}
        </span>
      ) : null}
      {control}
      {error ? (
        <p id={errId} className="field__error">
          <Icon name="warning" /> {error}
        </p>
      ) : null}
    </div>
  );
}
