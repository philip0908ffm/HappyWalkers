import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

/**
 * Deutliche Bestätigungen für jede Aktion.
 * Die Meldung erscheint groß oben und wird über eine Live-Region (role="status") vorgelesen.
 * Sie bleibt 8 Sekunden und kann mit „Schließen“ entfernt werden.
 */
type Toast = { id: number; message: string; kind: 'success' | 'error' };
const Ctx = createContext<{ success: (m: string) => void; error: (m: string) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const remove = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (message: string, kind: Toast['kind']) => {
      const id = next.current++;
      setToasts((t) => [...t.filter((x) => x.message !== message), { id, message, kind }].slice(-3));
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
