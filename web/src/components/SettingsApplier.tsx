import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useMe } from '../hooks/useMe';
import { languageFor } from '../i18n';

const FONT_KEY = 'happywalkers.fontScale';
const ANREDE_KEY = 'happywalkers.anrede';

/** Gerätespeicher (nur Komfort, keine Tracking-Daten). */
export function readLocalPref(key: 'fontScale' | 'anrede'): string | null {
  try {
    return localStorage.getItem(key === 'fontScale' ? FONT_KEY : ANREDE_KEY);
  } catch {
    return null;
  }
}
export function writeLocalPref(key: 'fontScale' | 'anrede', value: string) {
  try {
    localStorage.setItem(key === 'fontScale' ? FONT_KEY : ANREDE_KEY, value);
  } catch {
    /* privater Modus */
  }
}

export function applyFontScale(scale: string) {
  document.documentElement.dataset.font = scale;
}

/**
 * Wendet Schriftgröße, Sprache und Anrede an.
 * Vor der Anmeldung gelten die auf dem Gerät gespeicherten Werte.
 */
export function SettingsApplier() {
  const { data: me } = useMe();
  const { i18n } = useTranslation();
  useEffect(() => {
    const font = me?.settings.fontScale ?? readLocalPref('fontScale') ?? 'normal';
    const anrede = me?.settings.anrede ?? readLocalPref('anrede') ?? 'sie';
    const locale = me?.settings.locale ?? 'de';
    applyFontScale(font);
    if (me) {
      writeLocalPref('fontScale', font);
      writeLocalPref('anrede', anrede);
    }
    document.documentElement.lang = locale;
    const lng = languageFor(locale, anrede);
    if (i18n.language !== lng) void i18n.changeLanguage(lng);
  }, [me, i18n]);
  return null;
}
