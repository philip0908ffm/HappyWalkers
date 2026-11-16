import type { ReactNode } from 'react';
import type { PersonRef } from '../api/types-walks';

/**
 * Profilbild oder – falls keins da ist – Anfangsbuchstabe.
 * Das Bild ist dekorativ (alt=""), der Name steht immer daneben als Text.
 */
export function Avatar({ person, size = 'normal' }: { person: Pick<PersonRef, 'displayName' | 'avatarUrl'>; size?: 'small' | 'normal' | 'large' }) {
  const cls = `avatar ${size === 'large' ? 'avatar--large' : size === 'small' ? 'avatar--small' : ''}`;
  if (person.avatarUrl) return <img className={cls} src={person.avatarUrl} alt="" loading="lazy" />;
  const initial = (person.displayName || '?').trim().charAt(0).toUpperCase();
  return (
    <span className={cls} aria-hidden="true">
      {initial}
    </span>
  );
}

/** Person mit Bild und Name in einer Zeile. */
export function PersonChip({ person, extra }: { person: PersonRef; extra?: ReactNode }) {
  return (
    <span className="person-chip">
      <Avatar person={person} size="small" />
      <span>
        <span className="person-chip__name">{person.displayName}</span>
        {extra ? <span className="person-chip__extra">{extra}</span> : null}
      </span>
    </span>
  );
}
