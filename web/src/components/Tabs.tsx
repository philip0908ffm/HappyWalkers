import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/**
 * Reiter (WAI-ARIA „Tabs“): Klick oder Pfeiltasten wechseln den Reiter.
 * Die Inhalte rendert die Seite selbst in <TabPanel>.
 */
export function Tabs<T extends string>({
  id,
  label,
  tabs,
  selected,
  onSelect,
}: {
  id: string;
  label: string;
  tabs: { key: T; label: string; icon?: IconName }[];
  selected: T;
  onSelect: (key: T) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKeyDown(e: KeyboardEvent, i: number) {
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
    if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onSelect(tabs[next].key);
    refs.current[next]?.focus();
  }
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((tab, i) => (
        <button
          key={tab.key}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="tab"
          id={`${id}-tab-${tab.key}`}
          aria-controls={`${id}-panel-${tab.key}`}
          aria-selected={selected === tab.key}
          tabIndex={selected === tab.key ? 0 : -1}
          onClick={() => onSelect(tab.key)}
          onKeyDown={(e) => onKeyDown(e, i)}
        >
          {tab.icon ? <Icon name={tab.icon} /> : null}
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({ id, tabKey, selected, children }: { id: string; tabKey: string; selected: string; children: ReactNode }) {
  return (
    <div
      role="tabpanel"
      id={`${id}-panel-${tabKey}`}
      aria-labelledby={`${id}-tab-${tabKey}`}
      hidden={selected !== tabKey}
      tabIndex={0}
      className="tab-panel"
    >
      {selected === tabKey ? children : null}
    </div>
  );
}
