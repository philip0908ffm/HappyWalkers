import { useState } from 'react';

/** Profilbild oder Anfangsbuchstabe (dekorativ – der Name steht daneben). */
export function PersonAvatar({ name, url, large }: { name: string; url: string | null; large?: boolean }) {
  const [broken, setBroken] = useState(false);
  const cls = `avatar ${large ? 'avatar--large' : ''}`;
  if (url && !broken) return <img className={cls} src={url} alt="" onError={() => setBroken(true)} />;
  return (
    <span className={cls} aria-hidden="true">
      {(name.trim()[0] ?? '?').toUpperCase()}
    </span>
  );
}
