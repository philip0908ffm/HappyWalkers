import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { Icon } from './Icon';

/**
 * Deutliche Bestätigungen für jede Aktion.
 * Die Meldung erscheint groß unterhalb der festen Kopfzeile (verdeckt weder Kopf noch untere Navigation)
 * und wird über eine Live-Region (role="status") vorgelesen.
 * Sie bleibt 8 Sekunden und kann mit „Schließen“ entfernt werden. Höchstens 2 Meldungen gleichzeitig;
 * bei Seitenwechsel verschwinden ältere Meldungen (die Bestätigung der Aktion, die den Wechsel ausgelöst hat, bleibt).
 */
type Toast = { id: number; message: string; kind: 'success' | 'error'; at: number };
const MAX_TOASTS = 2;
/** Meldungen, die kurz vor dem Seitenwechsel entstanden sind, gehören zur auslösenden Aktion und bleiben. */
const KEEP_ON_NAVIGATION_MS = 1500;
const Ctx = createContext<{ success: (m: string) => void; error: (m: string) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const { pathname } = useLocation();
  const lastPath = useRef(pathname);

  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    const cutoff = Date.now() - KEEP_ON_NAVIGATION_MS;
    setToasts((t) => (t.some((x) => x.at < cutoff) ? t.filter((x) => x.at >= cutoff) : t));
  }, [pathname]);

  // Höhe der festen Kopfzeile als CSS-Variable, damit Meldungen direkt darunter erscheinen
  useEffect(() => {
    const header = document.querySelector<HTMLElement>('.app-header');
    if (!header || typeof ResizeObserver === 'undefined') return;
    const root = document.documentElement;
    const update = () => root.style.setProperty('--app-header-height', `${header.getBoundingClientRect().height}px`);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(header);
    return () => ro.disconnect();
  }, [pathname]);

  const remove = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (message: string, kind: Toast['kind']) => {
      const id = next.current++;
      setToasts((t) => [...t.filter((x) => x.message !== message), { id, message, kind, at: Date.now() }].slice(-MAX_TOASTS));
      window.setTimeout(() => remove(id), 8000);
    },
    [remove],
  );
  const value = { success: (m: string) => push(m, 'success'), error: (m: string) => push(m, 'error') };
  const { t } = useTranslation();
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toast-region" role="status" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.kind === 'error' ? 'toast--error' : ''}`}>
            <Icon name={toast.kind === 'error' ? 'warning' : 'check'} />
            <span>{toast.message}</span>
            <button type="button" className="toast__close" onClick={() => remove(toast.id)}>
              <span className="visually-hidden">{t('actions.closeMessage')}</span>
              <span aria-hidden="true">✕</span>
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('ToastProvider fehlt');
  return ctx;
}
