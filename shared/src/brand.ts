/**
 * Projektname – die EINZIGE Stelle, an der er steht.
 * Überschreibbar mit der Umgebungsvariable APP_NAME (Server und Build der Oberfläche).
 * In Texten nie fest eintragen: Server nutzt `config.APP_NAME`, die Oberfläche `APP_NAME`
 * aus `web/src/lib/brand.ts` bzw. `{{appName}}` in den i18n-Dateien.
 */
export const DEFAULT_APP_NAME = 'HappyWalkers';

/** Kurzform für Dateinamen, z. B. „happywalkers-urkunde.pdf“. */
export function appSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'app'
  );
}
