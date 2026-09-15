import { dbAllPhotoIds, dbDeletePhoto, dbGetPhoto, dbPutPhoto } from './db';
import type { NicheId, World } from './types';

/**
 * Echte Fotos: eigene Aufnahmen des Nutzers und Fotos fuer die KI-Accounts.
 *
 * Eigene Fotos werden verkleinert und in IndexedDB abgelegt, damit sie den
 * Spielstand ueberleben. Die Fotos der KI-Accounts kommen von einem
 * oeffentlichen Fotodienst - und wenn der nicht erreichbar ist, zeichnet die
 * App wie bisher ein Bild selbst.
 */

/** Laengste Kante eines gespeicherten Fotos. */
const MAX_EDGE = 1280;
const JPEG_QUALITY = 0.82;

let counter = 0;

/** Liest eine Datei ein, verkleinert sie und legt sie im Speicher ab. */
export async function importPhoto(file: File): Promise<string | null> {
  try {
    const bitmap = await loadBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    if ('close' in bitmap) bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob) return null;

    const id = `ph${Date.now().toString(36)}${(counter++).toString(36)}`;
    if (!(await dbPutPhoto(id, blob))) return null;
    urlCache.set(id, URL.createObjectURL(blob));
    return id;
  } catch (err) {
    console.warn('Foto konnte nicht verarbeitet werden', err);
    return null;
  }
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      // Beruecksichtigt die Drehung aus den Kameradaten.
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* aelterer Browser - unten weiter */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Bild konnte nicht gelesen werden'));
      img.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}

const urlCache = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

/** Adresse eines gespeicherten Fotos - wird zwischengespeichert. */
export function photoUrl(id: string): Promise<string | null> {
  const cached = urlCache.get(id);
  if (cached) return Promise.resolve(cached);
  const existing = pending.get(id);
  if (existing) return existing;

  const promise = dbGetPhoto(id).then((blob) => {
    pending.delete(id);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urlCache.set(id, url);
    return url;
  });
  pending.set(id, promise);
  return promise;
}

export function forgetPhoto(id: string) {
  const url = urlCache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(id);
  }
}

/** Suchbegriffe, damit die Fotos zum Thema des Beitrags passen. */
const KEYWORDS: Record<NicheId, string> = {
  fitness: 'gym,fitness,workout',
  food: 'food,meal,cooking',
  travel: 'travel,landscape,city',
  fashion: 'fashion,style,clothing',
  art: 'art,painting,drawing',
  photo: 'street,photography,portrait',
  tech: 'technology,computer,desk',
  gaming: 'gaming,arcade,console',
  music: 'music,concert,guitar',
  pets: 'dog,cat,pet',
  beauty: 'makeup,cosmetics,portrait',
  lifestyle: 'interior,coffee,home',
  cars: 'car,automobile,road',
  nature: 'nature,forest,mountain',
  comedy: 'party,friends,fun',
  dance: 'dance,dancer,stage',
};

/**
 * Mehrere Quellen fuer ein Foto, in der Reihenfolge, in der sie versucht
 * werden. Schlaegt alles fehl, zeichnet die App das Bild selbst.
 */
export function stockPhotoUrls(seed: number, niche: NicheId, size = 600): string[] {
  const lock = Math.abs(seed) % 100000;
  return [
    `https://loremflickr.com/${size}/${size}/${encodeURIComponent(KEYWORDS[niche])}?lock=${lock}`,
    `https://picsum.photos/seed/fg${lock}/${size}/${size}`,
  ];
}

/**
 * Loescht Fotos, auf die kein Beitrag und kein Profil mehr verweist -
 * sonst belegen geloeschte Beitraege dauerhaft Speicher.
 */
export async function pruneOrphanPhotos(world: World): Promise<number> {
  const used = new Set<string>();
  for (const id of world.order) {
    const p = world.posts[id];
    if (p?.photoId) used.add(p.photoId);
  }
  for (const acc of Object.values(world.accounts)) {
    if (acc.photoId) used.add(acc.photoId);
  }
  const all = await dbAllPhotoIds();
  let removed = 0;
  for (const id of all) {
    if (!used.has(id)) {
      await dbDeletePhoto(id);
      forgetPhoto(id);
      removed++;
    }
  }
  return removed;
}
