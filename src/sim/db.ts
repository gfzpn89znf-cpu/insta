/**
 * Dauerhafter Speicher im Browser.
 *
 * Der Spielstand und die hochgeladenen Fotos liegen in IndexedDB. Das
 * localStorage-Limit von rund fuenf Megabyte reicht fuer Fotos nicht - und
 * ein Spielstand, der beim Speichern scheitert, ist keiner.
 */

const DB_NAME = 'fotogram';
const DB_VERSION = 1;
const STORE_WORLD = 'world';
const STORE_PHOTOS = 'photos';
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

export function dbGetWorld<T>(): Promise<T | null> {
  return run<T>(STORE_WORLD, 'readonly', (s) => s.get(WORLD_KEY) as IDBRequest<T>);
}

export function dbPutWorld(value: unknown): Promise<boolean> {
  return run(STORE_WORLD, 'readwrite', (s) => s.put(value, WORLD_KEY) as IDBRequest<unknown>).then((r) => r !== null);
}

export function dbClearWorld(): Promise<void> {
  return run(STORE_WORLD, 'readwrite', (s) => s.delete(WORLD_KEY) as IDBRequest<undefined>).then(() => undefined);
}

export function dbPutPhoto(id: string, blob: Blob): Promise<boolean> {
  return run(STORE_PHOTOS, 'readwrite', (s) => s.put(blob, id) as IDBRequest<unknown>).then((r) => r !== null);
}

export function dbGetPhoto(id: string): Promise<Blob | null> {
  return run<Blob>(STORE_PHOTOS, 'readonly', (s) => s.get(id) as IDBRequest<Blob>);
}

export function dbDeletePhoto(id: string): Promise<void> {
  return run(STORE_PHOTOS, 'readwrite', (s) => s.delete(id) as IDBRequest<undefined>).then(() => undefined);
}

export function dbAllPhotoIds(): Promise<string[]> {
  return run<IDBValidKey[]>(STORE_PHOTOS, 'readonly', (s) => s.getAllKeys() as IDBRequest<IDBValidKey[]>).then(
    (keys) => (keys ?? []).map(String),
  );
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
