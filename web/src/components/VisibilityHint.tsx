import { useTranslation } from 'react-i18next';
import { Icon, type IconName } from './Icon';

const icons: Record<string, IconName> = { private: 'lock', group: 'group', followers: 'people2', public: 'globe', walkParticipants: 'calendar' };

/**
 * Zeigt per Symbol UND Text, wer etwas sehen kann.
 * `walkParticipants`: Beiträge zu „Gemeinsam auf Distanz“-Terminen (nur Teilnehmende, unabhängig von visibility).
 */
export function VisibilityHint({ visibility }: { visibility: string }) {
  const { t } = useTranslation();
  return (
    <span className="visibility-hint">
      <Icon name={icons[visibility] ?? 'eye'} />
      {t(`visibility.${visibility}`)}
    </span>
  );
}
