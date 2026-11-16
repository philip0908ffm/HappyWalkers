import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useToast } from '../components/Toast';
import { useErrorMessage } from './useErrorMessage';

/**
 * Schreibende Aktion mit deutlicher Bestätigung.
 * - Während die Aktion läuft, ist der Knopf gesperrt (isPending) → kein doppeltes Absenden.
 * - Erfolg: grüne Meldung `success`; Fehler: verständlicher Satz.
 * - `invalidate`: Daten, die danach neu geladen werden.
 */
export function useAction<TVars, TResult>(opts: {
  fn: (vars: TVars) => Promise<TResult>;
  success?: string | ((r: TResult, v: TVars) => string);
  invalidate?: QueryKey[];
  onSuccess?: (r: TResult, v: TVars) => void;
}) {
  const toast = useToast();
  const msg = useErrorMessage();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: opts.fn,
    onSuccess: async (r, v) => {
      if (opts.invalidate) await Promise.all(opts.invalidate.map((k) => qc.invalidateQueries({ queryKey: k })));
      if (opts.success) toast.success(typeof opts.success === 'function' ? opts.success(r, v) : opts.success);
      opts.onSuccess?.(r, v);
    },
    onError: (e) => toast.error(msg(e)),
  });
}
