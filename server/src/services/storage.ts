import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { config } from '../config.js';
import { badRequest } from '../lib/http.js';

/**
 * Bildspeicher auf der Festplatte (auf Railway: ein „Volume“, Pfad über UPLOAD_DIR).
 * Bilder werden IMMER neu kodiert: das entfernt EXIF-Daten (z. B. GPS-Position des Fotos)
 * und eingebettete Fremdinhalte. Dateien liegen nie in einem öffentlichen Ordner;
 * Auslieferung nur über Routen mit Zugriffsprüfung.
 */
const root = () => path.resolve(config.UPLOAD_DIR);

export interface StoredImage {
  key: string;
  width: number;
  height: number;
}

export async function storeImage(buffer: Buffer, opts: { maxSize?: number; folder?: string } = {}): Promise<StoredImage> {
  let img;
  try {
    img = sharp(buffer, { failOn: 'error', limitInputPixels: 50_000_000 }).rotate();
    const meta = await img.metadata();
    if (!meta.format || !['jpeg', 'png', 'webp', 'heif', 'gif'].includes(meta.format)) throw new Error('format');
  } catch {
    throw badRequest('invalid_image');
  }
  const max = opts.maxSize ?? 1600;
  const { data, info } = await img
    .resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
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
