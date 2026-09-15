/**
 * Service Worker von Fotogram.
 *
 * Aufgabe: die App startet auch ohne Internet. Programm und Gestaltung
 * werden beim ersten Besuch abgelegt, danach kommt alles aus dem Speicher.
 * Fotos aus dem Netz werden zusaetzlich aufbewahrt, aber begrenzt.
 */

/**
 * Die Liste der mitzuliefernden Dateien wird beim Build eingesetzt
 * (scripts/postbuild.mjs). Ohne sie waeren die Programmdateien beim ersten
 * Besuch nicht im Speicher - und die App bliebe offline leer.
 */
const PRECACHE = '__PRECACHE_ASSETS__';
const VERSION = '__BUILD_ID__';
const APP_CACHE = `fotogram-app-${VERSION}`;
const PHOTO_CACHE = `fotogram-photos-${VERSION}`;
const MAX_PHOTOS = 220;
/**
 * Beim Nachschlagen die Vary-Kopfzeilen ignorieren. Sonst gilt eine Datei
 * als "nicht gefunden", nur weil der Server sie mit anderen Kopfzeilen
 * ausgeliefert hat als beim Ablegen - und die App bliebe offline leer.
 */
const MATCH = { ignoreVary: true };

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_CACHE)
      .then((cache) => {
        const files = Array.isArray(PRECACHE) ? PRECACHE : [];
        const list = ['./', './index.html', './manifest.webmanifest', ...files];
        // Einzeln ablegen: eine fehlende Datei soll nicht alles verhindern.
        return Promise.all(list.map((url) => cache.add(url).catch(() => undefined)));
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== APP_CACHE && k !== PHOTO_CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

/** Haelt den Fotospeicher klein, damit er nicht endlos waechst. */
async function trimPhotoCache() {
  const cache = await caches.open(PHOTO_CACHE);
  const keys = await cache.keys();
  if (keys.length <= MAX_PHOTOS) return;
  for (const key of keys.slice(0, keys.length - MAX_PHOTOS)) await cache.delete(key);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  // Seitenaufrufe: erst das Netz, sonst die letzte bekannte Fassung.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(APP_CACHE).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html', MATCH).then((cached) => cached ?? Response.error())),
    );
    return;
  }

  // Eigene Dateien: aus dem Speicher, im Hintergrund erneuern.
  if (sameOrigin) {
    event.respondWith(
      caches.match(request, MATCH).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              void caches.open(APP_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached ?? Response.error());
        return cached ?? network;
      }),
    );
    return;
  }

  /*
   * Fotos von aussen: einmal geladen, bleiben sie auch offline sichtbar.
   *
   * Nur Bilder, die wirklich angezeigt werden - nichts, was die App selbst
   * abruft. Sonst laegen Suchanfragen und heruntergeladene Bilder
   * unverschluesselt im Zwischenspeicher des Browsers, waehrend dieselben
   * Bilder nebenan mit der PIN gesichert sind. Alles, was ueber fetch laeuft
   * (Bildersuche, KI, Herunterladen eines gewaehlten Bildes), geht direkt ans
   * Netz und wird nirgends abgelegt.
   */
  if (request.destination !== 'image') return;

  event.respondWith(
    caches.match(request, MATCH).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok || response.type === 'opaque') {
            const copy = response.clone();
            void caches.open(PHOTO_CACHE).then((cache) => cache.put(request, copy).then(trimPhotoCache));
          }
          return response;
        })
        .catch(() => Response.error());
    }),
  );
});
