import { DEFAULT_APP_NAME } from '@happywalkers/shared';

declare const __APP_NAME__: string | undefined;

/**
 * Projektname der Oberfläche. Kommt beim Bauen aus der Umgebungsvariable APP_NAME
 * (dieselbe wie beim Server), sonst aus shared/src/brand.ts.
 * In Texten nicht fest eintragen: `{{appName}}` in den i18n-Dateien oder diese Konstante nutzen.
 */
export const APP_NAME: string = (typeof __APP_NAME__ === 'string' && __APP_NAME__.trim()) || DEFAULT_APP_NAME;
