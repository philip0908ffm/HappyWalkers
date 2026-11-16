import fs from 'node:fs/promises';
import path from 'node:path';
import sharp, { type OutputInfo } from 'sharp';
import { config } from '../config.js';
import { badRequest } from '../lib/http.js';

/**
 * Bildspeicher auf der Festplatte (auf Railway: ein „Volume“, Pfad über UPLOAD_DIR).
 * Bilder werden IMMER neu kodiert: das entfernt EXIF-Daten (z. B. GPS-Position des Fotos)
 * und eingebettete Fremdinhalte. Dateien liegen nie in einem öffentlichen Ordner;
 * Auslieferung nur über Routen mit Zugriffsprüfung.
 */
const root = () => path.resolve(config.UPLOAD_DIR);

/** Erlaubte Eingangsformate (nach Inhalt erkannt, nicht nach Dateiendung). SVG ist bewusst nicht dabei. */
const ALLOWED_FORMATS: string[] = ['jpeg', 'png', 'webp', 'heif', 'gif'];

export interface StoredImage {
  key: string;
  width: number;
  height: number;
}

export async function storeImage(buffer: Buffer, opts: { maxSize?: number; folder?: string } = {}): Promise<StoredImage> {
  const max = opts.maxSize ?? 1600;
  let data: Buffer;
  let info: OutputInfo;
  try {
    if (!buffer?.length) throw new Error('empty');
    // limitInputPixels: Schutz vor „Bildbomben“ (riesige Abmessungen bei kleiner Datei).
    // pages: 1 → bei animierten GIF/WebP nur das erste Bild dekodieren.
    const img = sharp(buffer, { failOn: 'error', limitInputPixels: 50_000_000, pages: 1 }).rotate();
    const meta = await img.metadata();
    if (!meta.format || !ALLOWED_FORMATS.includes(meta.format)) throw new Error('format');
    // Neu-Kodierung entfernt alle Metadaten (EXIF/GPS, XMP, ICC-Kommentare); sharp übernimmt sie nur mit .withMetadata().
    ({ data, info } = await img
      .resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer({ resolveWithObject: true }));
  } catch {
    // auch abgeschnittene/kaputte Dateien, die erst beim Dekodieren auffallen → Eingabefehler statt 500
    throw badRequest('invalid_image');
  }
  const folder = opts.folder ?? 'photos';
  const key = `${folder}/${crypto.randomUUID()}.jpg`;
  const file = path.join(root(), key);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, data);
  return { key, width: info.width, height: info.height };
}

/** Absoluter Pfad zu einem Schlüssel – verhindert Pfad-Ausbrüche („../“). */
export function resolveKey(key: string): string {
  const file = path.resolve(root(), key);
  if (!file.startsWith(root() + path.sep)) throw badRequest('invalid_key');
  return file;
}

export async function deleteStoredFiles(keys: (string | null | undefined)[]) {
  await Promise.all(
    keys.filter((k): k is string => !!k).map((k) => fs.rm(resolveKey(k), { force: true }).catch(() => undefined)),
  );
}
