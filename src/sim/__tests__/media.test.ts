import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pickHit, queryFor, searchImages, searchVideos, type MediaHit } from '../media';

/**
 * Die Mediensuche kann in dieser Umgebung nicht wirklich ans Netz - deshalb
 * wird hier gegen eine nachgebaute Antwort von Wikimedia Commons geprueft,
 * genau so, wie sie im Browser ankommt.
 */

const IMAGE_RESPONSE = {
  query: {
    pages: {
      '1': {
        title: 'File:Meal prep containers 2019.jpg',
        imageinfo: [
          {
            thumburl: 'https://upload.wikimedia.org/thumb/meal.jpg/800px-meal.jpg',
            url: 'https://upload.wikimedia.org/meal.jpg',
            width: 1200,
            height: 800,
            mime: 'image/jpeg',
          },
        ],
      },
      '2': {
        // Sehr schmales Hochformat: meist eine Grafik, kein Foto.
        title: 'File:Nutrition_chart.png',
        imageinfo: [
          {
            thumburl: 'https://upload.wikimedia.org/thumb/chart.png/800px-chart.png',
            url: 'https://upload.wikimedia.org/chart.png',
            width: 300,
            height: 1200,
            mime: 'image/png',
          },
        ],
      },
      '3': {
        // Kein Bild - muss aussortiert werden.
        title: 'File:Something.pdf',
        imageinfo: [{ url: 'https://upload.wikimedia.org/something.pdf', mime: 'application/pdf' }],
      },
    },
  },
};

const VIDEO_RESPONSE = {
  query: {
    pages: {
      '1': {
        title: 'File:Tennis serve slow motion.webm',
        imageinfo: [{ url: 'https://upload.wikimedia.org/tennis.webm', size: 8_000_000, mime: 'video/webm' }],
      },
      '2': {
        // Ogg-Theora spielt kaum ein Handy ab.
        title: 'File:Old clip.ogv',
        imageinfo: [{ url: 'https://upload.wikimedia.org/old.ogv', size: 2_000_000, mime: 'video/ogg' }],
      },
      '3': {
        // Zu gross zum Laden ueber Mobilfunk.
        title: 'File:Huge documentary.webm',
        imageinfo: [{ url: 'https://upload.wikimedia.org/huge.webm', size: 90_000_000, mime: 'video/webm' }],
      },
    },
  },
};

beforeEach(() => {
  vi.stubGlobal('indexedDB', undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mockFetch(payload: unknown) {
  const fetchMock = vi.fn(async (_url: string | URL | Request) => ({ ok: true, json: async () => payload }) as unknown as Response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('Mediensuche', () => {
  it('sucht mit echten Stichworten statt mit Schlagwort-Kuerzeln', () => {
    expect(queryFor('fitness', 'mealprep')).toBe('meal prep food containers');
    expect(queryFor('dance', 'ballett')).toBe('ballet dancer');
    // Unbekanntes Motiv faellt auf die Nische zurueck.
    expect(queryFor('nature', 'gibtesnicht')).toContain('nature');
  });

  it('liest Fotos aus der Antwort und sortiert Ungeeignetes aus', async () => {
    const fetchMock = mockFetch(IMAGE_RESPONSE);
    const hits = await searchImages('meal prep food containers');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toContain('meal+prep');
    expect(hits).toHaveLength(1);
    expect(hits[0].url).toContain('800px-meal.jpg');
    // Aus dem Dateinamen wird eine lesbare Beschreibung.
    expect(hits[0].title).toBe('Meal prep containers');
  });

  it('nimmt nur Videos, die Browser abspielen und die nicht zu gross sind', async () => {
    mockFetch(VIDEO_RESPONSE);
    const hits = await searchVideos('tennis match');
    expect(hits).toHaveLength(1);
    expect(hits[0].url).toContain('tennis.webm');
    expect(hits[0].title).toBe('Tennis serve slow motion');
  });

  it('merkt sich das Ergebnis und sucht nicht zweimal', async () => {
    const fetchMock = mockFetch(IMAGE_RESPONSE);
    await searchImages('gym workout training');
    await searchImages('gym workout training');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('bleibt ruhig, wenn der Dienst nicht erreichbar ist', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const hits = await searchImages('irgendwas ohne netz');
    expect(hits).toEqual([]);
  });

  it('waehlt zum selben Beitrag immer dasselbe Bild', () => {
    const hits: MediaHit[] = [
      { url: 'a', title: 'A' },
      { url: 'b', title: 'B' },
      { url: 'c', title: 'C' },
    ];
    expect(pickHit(hits, 7)?.url).toBe(pickHit(hits, 7)?.url);
    expect(pickHit(hits, 7)?.url).not.toBe(pickHit(hits, 8)?.url);
    expect(pickHit([], 3)).toBeUndefined();
  });
});
