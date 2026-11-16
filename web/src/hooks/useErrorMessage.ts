import { useTranslation } from 'react-i18next';
import { ApiError } from '../api/client';
import { namespaces } from '../i18n';

/**
 * Übersetzt API-Fehler in einen verständlichen Satz.
 * Gesucht wird `errors.<code>` zuerst in „common“, dann in allen anderen Bereichen
 * (jedes Arbeitspaket kann eigene Fehlertexte in seiner Datei unter "errors" ablegen).
 */
export function useErrorMessage() {
  const { t, i18n } = useTranslation();
  return (err: unknown): string => {
    const code = err instanceof ApiError ? err.code : 'server_error';
    for (const ns of ['common', ...namespaces.filter((n) => n !== 'common')]) {
      const key = `${ns}:errors.${code}`;
      if (i18n.exists(key)) return t(key);
    }
    return t('common:errors.server_error');
  };
}

/** Feldfehler aus `invalid_input`-Antworten: { feldname: Meldung } */
export function useFieldErrors() {
  const { t } = useTranslation();
  return (err: unknown): Record<string, string> => {
    if (!(err instanceof ApiError) || !err.details) return {};
    const out: Record<string, string> = {};
    for (const d of err.details) out[d.field] = t('errors.field_invalid');
    return out;
  };
}
