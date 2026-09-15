/**
 * Dauerhafter Speicher im Browser.
 *
 * Der Spielstand und die hochgeladenen Fotos liegen in IndexedDB. Das
 * localStorage-Limit von rund fuenf Megabyte reicht fuer Fotos nicht - und
 * ein Spielstand, der beim Speichern scheitert, ist keiner.
 *
 * Ist eine PIN gesetzt, geht nichts mehr im Klartext hinein: Spielstand,
 * Fotos und Videos werden hier verschluesselt geschrieben und beim Lesen
 * wieder geoeffnet. Ohne den Schluessel liefert das Lesen nichts.
 */

import { getActiveKey, isSealed, openBytes, openJson, sealBytes, sealJson } from './crypto';

const DB_NAME = 'fotogram';
const DB_VERSION = 2;
const STORE_WORLD = 'world';
const STORE_PHOTOS = 'photos';
const STORE_MEDIA = 'media';
const WORLD_KEY = 'current';

let dbPromise: Promise<IDBDatabase | null> | undefined;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_WORLD)) db.createObjectStore(STORE_WORLD);
        if (!db.objectStoreNames.contains(STORE_PHOTOS)) db.createObjectStore(STORE_PHOTOS);
        if (!db.objectStoreNames.contains(STORE_MEDIA)) db.createObjectStore(STORE_MEDIA);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        console.warn('IndexedDB nicht verfuegbar', request.error);
        resolve(null);
      };
      request.onblocked = () => resolve(null);
    } catch (err) {
      console.warn('IndexedDB konnte nicht geoeffnet werden', err);
      resolve(null);
    }
  });
  return dbPromise;
}

function run<T>(store: string, mode: IDBTransactionMode, action: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) {
          resolve(null);
          return;
        }
        try {
          const tx = db.transaction(store, mode);
          const request = action(tx.objectStore(store));
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => {
            console.warn('Speicherzugriff fehlgeschlagen', request.error);
            resolve(null);
          };
        } catch (err) {
          console.warn('Speicherzugriff fehlgeschlagen', err);
          resolve(null);
        }
      }),
  );
}

export async function dbGetWorld<T>(): Promise<T | null> {
  const raw = await run<unknown>(STORE_WORLD, 'readonly', (s) => s.get(WORLD_KEY) as IDBRequest<unknown>);
  if (raw == null) return null;
  if (!isSealed(raw)) return raw as T;
  const key = getActiveKey();
  if (!key) return null;
  return openJson<T>(key, raw);
}

export async function dbPutWorld(value: unknown): Promise<boolean> {
  const key = getActiveKey();
  const payload = key ? await sealJson(key, value) : value;
  return run(STORE_WORLD, 'readwrite', (s) => s.put(payload, WORLD_KEY) as IDBRequest<unknown>).then((r) => r !== null);
}

export function dbClearWorld(): Promise<void> {
  return run(STORE_WORLD, 'readwrite', (s) => s.delete(WORLD_KEY) as IDBRequest<undefined>).then(() => undefined);
}

export async function dbPutPhoto(id: string, blob: Blob): Promise<boolean> {
  const key = getActiveKey();
  const payload = key ? await sealBytes(key, await blob.arrayBuffer(), blob.type || 'application/octet-stream') : blob;
  return run(STORE_PHOTOS, 'readwrite', (s) => s.put(payload, id) as IDBRequest<unknown>).then((r) => r !== null);
}

export async function dbGetPhoto(id: string): Promise<Blob | null> {
  const raw = await run<unknown>(STORE_PHOTOS, 'readonly', (s) => s.get(id) as IDBRequest<unknown>);
  if (raw == null) return null;
  if (!isSealed(raw)) return raw as Blob;
  const key = getActiveKey();
  if (!key) return null;
  const bytes = await openBytes(key, raw);
  return bytes ? new Blob([bytes], { type: raw.type || 'application/octet-stream' }) : null;
}

export function dbDeletePhoto(id: string): Promise<void> {
  return run(STORE_PHOTOS, 'readwrite', (s) => s.delete(id) as IDBRequest<undefined>).then(() => undefined);
}

export function dbAllPhotoIds(): Promise<string[]> {
  return run<IDBValidKey[]>(STORE_PHOTOS, 'readonly', (s) => s.getAllKeys() as IDBRequest<IDBValidKey[]>).then(
    (keys) => (keys ?? []).map(String),
  );
}

/** Gefundene Medien zu einer Suchanfrage merken, damit nicht jedes Mal
 *  neu gesucht werden muss. */
export function dbGetMedia<T>(query: string): Promise<T | null> {
  return run<T>(STORE_MEDIA, 'readonly', (s) => s.get(query) as IDBRequest<T>);
}

export function dbPutMedia(query: string, value: unknown): Promise<boolean> {
  return run(STORE_MEDIA, 'readwrite', (s) => s.put(value, query) as IDBRequest<unknown>).then((r) => r !== null);
}

/**
 * Schreibt alles mit einem anderen Schluessel neu - beim Setzen einer PIN
 * (from = null) und beim Entfernen (to = null). Schlaegt einer der Schritte
 * fehl, bleibt der alte Stand stehen, statt halb verschluesselt zu enden.
 */
export async function dbRekey(from: CryptoKey | null, to: CryptoKey | null): Promise<boolean> {
  const rawWorld = await run<unknown>(STORE_WORLD, 'readonly', (s) => s.get(WORLD_KEY) as IDBRequest<unknown>);
  if (rawWorld != null) {
    let plain: unknown = rawWorld;
    if (isSealed(rawWorld)) {
      if (!from) return false;
      plain = await openJson<unknown>(from, rawWorld);
      if (plain == null) return false;
    }
    const next = to ? await sealJson(to, plain) : plain;
    if ((await run(STORE_WORLD, 'readwrite', (s) => s.put(next, WORLD_KEY) as IDBRequest<unknown>)) === null) return false;
  }

  for (const id of await dbAllPhotoIds()) {
    const raw = await run<unknown>(STORE_PHOTOS, 'readonly', (s) => s.get(id) as IDBRequest<unknown>);
    if (raw == null) continue;
    let blob: Blob;
    if (isSealed(raw)) {
      if (!from) return false;
      const bytes = await openBytes(from, raw);
      if (!bytes) return false;
      blob = new Blob([bytes], { type: raw.type || 'application/octet-stream' });
    } else {
      blob = raw as Blob;
    }
    const next = to ? await sealBytes(to, await blob.arrayBuffer(), blob.type || 'application/octet-stream') : blob;
    if ((await run(STORE_PHOTOS, 'readwrite', (s) => s.put(next, id) as IDBRequest<unknown>)) === null) return false;
  }
  return true;
}

/** Leert alle Speicher restlos - fuer "alle Daten loeschen". */
export async function dbWipe(): Promise<void> {
  for (const store of [STORE_WORLD, STORE_PHOTOS, STORE_MEDIA]) {
    await run(store, 'readwrite', (s) => s.clear() as IDBRequest<undefined>);
  }
}

/** Verfuegbarer und belegter Speicherplatz, soweit der Browser ihn verraet. */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate();
      return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
    }
  } catch {
    /* ignorieren */
  }
  return null;
}

/**
 * Bittet den Browser, die Daten dauerhaft zu behalten. Ohne das raeumen
 * manche Browser bei Platzmangel die Fotos einer Website einfach weg.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* ignorieren */
  }
  return false;
}
