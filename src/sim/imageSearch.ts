import { ask } from './ai';
import { networkAllowed } from './flags';
import { searchImages } from './media';

/**
 * Bildersuche zum Selbereingeben.
 *
 * Google laesst sich aus einer Webseite heraus nicht durchsuchen - es gibt
 * keine offene Schnittstelle dafuer, und der Browser laesst den Zugriff auf
 * die Ergebnisseite nicht zu. Stattdessen wird hier in zwei grossen, offenen
 * Bildersammlungen gesucht:
 *
 * - Openverse (die Bildersuche der Wikimedia-Stiftung, ueber 700 Millionen
 *   frei verwendbare Bilder aus Flickr, Wikimedia, Museen und anderen),
 * - Wikimedia Commons als zweite Quelle.
 *
 * Wichtig fuer die Privatsphaere: der Suchbegriff und die IP-Adresse gehen an
 * diese Dienste - anders kann keine Bildersuche funktionieren, auch die von
 * Google nicht. Das ausgewaehlte Bild wird danach auf dem Geraet gespeichert
 * (mit gesetzter PIN verschluesselt) und liegt nur dort.
 */

export interface PictureHit {
  /** Adresse zum Anzeigen - bewusst die Fassung des Dienstes selbst. */
  thumb: string;
  /** Adresse fuer die gespeicherte Fassung. */
  full: string;
  title: string;
  source: 'openverse' | 'commons';
  /** Urheber, soweit bekannt. */
  by?: string;
}

const OPENVERSE = 'https://api.openverse.org/v1/images/';

interface OpenverseResult {
  id?: string;
  title?: string;
  creator?: string;
  url?: string;
  thumbnail?: string;
}

/**
 * Nur Bilder, die der Dienst selbst ausliefert, werden angezeigt. Damit
 * bleibt die Liste der erlaubten Adressen in der Sicherheitsregel der Seite
 * kurz - und die Bilder lassen sich auch wirklich herunterladen und
 * verschluesselt ablegen.
 */
function ownThumb(url: string | undefined): boolean {
  return !!url && (url.startsWith('https://api.openverse.org/') || url.startsWith('https://upload.wikimedia.org/'));
}

async function searchOpenverse(query: string, signal?: AbortSignal): Promise<PictureHit[]> {
  const url = `${OPENVERSE}?${new URLSearchParams({
    q: query,
    page_size: '24',
    // Keine anstoessigen Ergebnisse.
    mature: 'false',
  }).toString()}`;

  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    referrerPolicy: 'no-referrer',
    credentials: 'omit',
    signal,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = (await response.json()) as { results?: OpenverseResult[] };

  return (data.results ?? [])
    .filter((r) => ownThumb(r.thumbnail))
    .map((r) => ({
      thumb: r.thumbnail as string,
      full: r.thumbnail as string,
      title: (r.title ?? 'Bild').slice(0, 90),
      source: 'openverse' as const,
      by: r.creator ?? undefined,
    }));
}

/** Wortgrenzen, die fuer eine Bildersuche nichts beitragen. */
const FILLER = /\b(bilder|bild|fotos|foto|images|image|pictures|picture|photos|photo|von|vom|mit|und|der|die|das|ein|eine|zeig|zeige|mir|suche)\b/gi;

/** Kleine Uebersetzungshilfe, wenn keine KI eingerichtet ist. */
const WORDS: Record<string, string> = {
  fitnessstudio: 'gym',
  fitness: 'fitness',
  hantel: 'dumbbell',
  hanteln: 'dumbbells',
  krafttraining: 'weight training',
  laufen: 'running',
  essen: 'food',
  kochen: 'cooking',
  kuchen: 'cake',
  kaffee: 'coffee',
  hund: 'dog',
  hunde: 'dogs',
  katze: 'cat',
  katzen: 'cats',
  welpe: 'puppy',
  berge: 'mountains',
  berg: 'mountain',
  strand: 'beach',
  meer: 'sea',
  wald: 'forest',
  sonnenuntergang: 'sunset',
  sonnenaufgang: 'sunrise',
  reisen: 'travel',
  urlaub: 'vacation',
  auto: 'car',
  autos: 'cars',
  fahrrad: 'bicycle',
  stadt: 'city',
  wohnung: 'apartment interior',
  buecher: 'books',
  buch: 'book',
  musik: 'music',
  gitarre: 'guitar',
  konzert: 'concert',
  tanzen: 'dancing',
  mode: 'fashion',
  schuhe: 'shoes',
  kunst: 'art',
  malerei: 'painting',
  zeichnung: 'drawing',
  blumen: 'flowers',
  pflanzen: 'plants',
  schnee: 'snow',
  regen: 'rain',
  himmel: 'sky',
  tennis: 'tennis',
  fussball: 'football',
  basketball: 'basketball',
  schwimmen: 'swimming',
  yoga: 'yoga',
  computer: 'computer',
  schreibtisch: 'desk',
  handy: 'smartphone',
  spiele: 'video games',
  natur: 'nature',
};

/** Macht aus einer deutschen Eingabe brauchbare Suchworte - ohne KI. */
export function plainQuery(input: string): string {
  const cleaned = input
    .toLowerCase()
    .replace(/[ä]/g, 'ae')
    .replace(/[ö]/g, 'oe')
    .replace(/[ü]/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(FILLER, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => WORDS[word] ?? word);
  const out = [...new Set(cleaned)].slice(0, 6).join(' ').trim();
  return out || input.trim();
}

/**
 * Laesst die KI aus der Eingabe gute Suchworte machen - sie uebersetzt und
 * ergaenzt, was ein Bilderdienst versteht. Ohne KI greift die Wortliste.
 */
export async function refineQuery(input: string): Promise<string> {
  const fallback = plainQuery(input);
  const answer = await ask({
    system: [
      'Du hilfst bei einer Bildersuche in einer englischsprachigen Bilddatenbank.',
      'Der Nutzer beschreibt auf Deutsch, was er sehen will.',
      'Antworte mit zwei bis fuenf englischen Suchbegriffen, durch Leerzeichen getrennt.',
      'Nur die Begriffe, kein Satz, keine Anfuehrungszeichen, keine Erklaerung.',
    ].join('\n'),
    messages: [{ role: 'user', content: input.slice(0, 200) }],
    maxTokens: 40,
  });
  if (!answer) return fallback;
  const cleaned = answer
    .replace(/["'`\n]/g, ' ')
    .replace(/[^A-Za-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .join(' ')
    .trim();
  return cleaned || fallback;
}

export interface SearchOutcome {
  hits: PictureHit[];
  /** Womit tatsaechlich gesucht wurde - hilft beim Nachbessern. */
  usedQuery: string;
  error?: string;
}

/**
 * Sucht Bilder zu einer freien Eingabe. Zuerst Openverse, dann Wikimedia
 * Commons - so gibt es auch dann Ergebnisse, wenn ein Dienst gerade klemmt.
 */
export async function searchPictures(input: string, useAi = true): Promise<SearchOutcome> {
  const term = input.trim();
  if (!term) return { hits: [], usedQuery: '' };
  if (!networkAllowed()) {
    return { hits: [], usedQuery: term, error: 'Der Privatmodus ist an - dabei geht keine Suche nach draussen.' };
  }

  const usedQuery = useAi ? await refineQuery(term) : plainQuery(term);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    let hits: PictureHit[] = [];
    let error: string | undefined;

    try {
      hits = await searchOpenverse(usedQuery, controller.signal);
    } catch (err) {
      error = describe(err);
    }

    if (hits.length === 0) {
      try {
        const commons = await searchImages(usedQuery, 640);
        hits = commons.filter((hit) => ownThumb(hit.url)).map((hit) => ({
          thumb: hit.url,
          full: hit.url,
          title: hit.title,
          source: 'commons' as const,
        }));
        if (hits.length > 0) error = undefined;
      } catch (err) {
        error ??= describe(err);
      }
    }

    if (hits.length === 0 && !error) error = `Zu "${usedQuery}" wurde nichts gefunden. Versuch es mit anderen Worten.`;
    return { hits, usedQuery, error };
  } finally {
    clearTimeout(timeout);
  }
}

function describe(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/abort/i.test(message)) return 'Die Suche hat zu lange gedauert.';
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'Keine Internetverbindung.';
  return `Die Bildersuche ist gerade nicht erreichbar (${message}).`;
}

/** Holt ein gefundenes Bild als Datei, damit es auf dem Geraet landet. */
export async function downloadPicture(hit: PictureHit): Promise<File | null> {
  if (!networkAllowed()) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(hit.full, { referrerPolicy: 'no-referrer', credentials: 'omit', signal: controller.signal });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) return null;
    return new File([blob], `${hit.source}.jpg`, { type: blob.type });
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
