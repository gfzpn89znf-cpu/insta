import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { plainQuery, searchPictures } from '../imageSearch';

/**
 * Die Bildersuche kommt in dieser Umgebung nicht ans Netz - geprueft wird
 * deshalb gegen eine nachgebaute Antwort von Openverse, genau so, wie sie im
 * Browser ankommt.
 */

const OPENVERSE_RESPONSE = {
  results: [
    {
      id: 'a1',
      title: 'Dumbbells in a gym',
      creator: 'Jane Doe',
      url: 'https://live.staticflickr.com/1/a1_b.jpg',
      thumbnail: 'https://api.openverse.org/v1/images/a1/thumb/',
    },
    {
      id: 'a2',
      title: 'Bench press',
      creator: 'John Roe',
      url: 'https://live.staticflickr.com/2/a2_b.jpg',
      // Vorschau liegt bei einem fremden Anbieter - wird ausgelassen, weil
      // sie sich weder anzeigen noch herunterladen laesst.
      thumbnail: 'https://cdn.example.com/a2.jpg',
    },
    {
      id: 'a3',
      title: 'Kettlebell',
      url: 'https://live.staticflickr.com/3/a3_b.jpg',
      thumbnail: 'https://api.openverse.org/v1/images/a3/thumb/',
    },
  ],
};

/** Kleiner Ersatz fuer den Browser-Speicher - hier laeuft kein Browser. */
const store = new Map<string, string>();
const fakeStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

function mockFetch(payload: unknown, ok = true) {
  return vi.fn(() =>
    Promise.resolve({
      ok,
      status: ok ? 200 : 503,
      json: () => Promise.resolve(payload),
    } as Response),
  );
}

beforeEach(() => {
  store.clear();
  // Nach jedem Test werden alle Ersatzobjekte entfernt - also jedes Mal neu.
  vi.stubGlobal('localStorage', fakeStorage);
});

afterEach(() => {
  // Nur die Netzanfrage zuruecksetzen - der Speicher-Ersatz bleibt stehen.
  vi.unstubAllGlobals();
  store.clear();
});

describe('Suchbegriffe aufbereiten', () => {
  it('wirft Fuellwoerter weg und uebersetzt bekannte Begriffe', () => {
    expect(plainQuery('Gym Bilder')).toBe('gym');
    expect(plainQuery('Zeig mir Bilder von Hunden am Strand')).toContain('beach');
    expect(plainQuery('Fitnessstudio Hanteln')).toBe('gym dumbbells');
  });

  it('behaelt Umlaute lesbar und gibt nie nichts zurueck', () => {
    expect(plainQuery('Küche')).toBe('kueche');
    expect(plainQuery('Bilder')).toBe('Bilder');
  });
});

describe('Bildersuche', () => {
  it('liefert nur Treffer, die sich anzeigen und speichern lassen', async () => {
    vi.stubGlobal('fetch', mockFetch(OPENVERSE_RESPONSE));
    const outcome = await searchPictures('Gym Bilder', false);

    expect(outcome.usedQuery).toBe('gym');
    expect(outcome.hits).toHaveLength(2);
    expect(outcome.hits.map((h) => h.title)).toEqual(['Dumbbells in a gym', 'Kettlebell']);
    expect(outcome.hits[0].by).toBe('Jane Doe');
    expect(outcome.hits.every((h) => h.thumb.startsWith('https://api.openverse.org/'))).toBe(true);
    expect(outcome.error).toBeUndefined();
  });

  it('sagt Bescheid, statt still nichts zu zeigen', async () => {
    vi.stubGlobal('fetch', mockFetch({ results: [] }));
    const outcome = await searchPictures('etwas sehr abwegiges', false);
    expect(outcome.hits).toHaveLength(0);
    expect(outcome.error).toBeTruthy();
  });

  it('sucht im Privatmodus ueberhaupt nicht', async () => {
    store.set('fotogram.privacy.offline', '1');
    const fetchSpy = mockFetch(OPENVERSE_RESPONSE);
    vi.stubGlobal('fetch', fetchSpy);

    const outcome = await searchPictures('Gym', false);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(outcome.hits).toHaveLength(0);
    expect(outcome.error).toMatch(/Privatmodus/);
  });
});
