import '../styles/pages-e.css';
import { useId } from 'react';

/**
 * Fortschrittsbalken als <progress> MIT Text (der Text trägt die Bedeutung, der Balken ist die Hilfe).
 * <ProgressBar label="Mein Fortschritt" value={3.2} max={5} text="3,2 von 5 km" />
 */
export function ProgressBar({
  label,
  value,
  max,
  text,
  done,
}: {
  label: string;
  value: number;
  max: number;
  /** z. B. „3,2 von 5 km – noch 1,8 km“ */
  text: string;
  done?: boolean;
}) {
  const id = useId();
  const safeMax = max > 0 ? max : 1;
  return (
    <div className={`progress ${done ? 'progress--done' : ''}`}>
      <span className="progress__label" id={`${id}-l`}>
        {label}
      </span>
      <progress
        className="progress__bar"
        value={Math.min(Math.max(value, 0), safeMax)}
        max={safeMax}
        aria-labelledby={`${id}-l`}
        aria-describedby={`${id}-t`}
      />
      <span className="progress__text" id={`${id}-t`}>
        {text}
      </span>
    </div>
  );
}
