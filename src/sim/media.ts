import { dbGetMedia, dbPutMedia } from './db';
import { networkAllowed } from './flags';
import type { NicheId, Post } from './types';

/**
 * Sucht echte Fotos und Videos, die zum Motiv eines Beitrags passen.
 *
 * Quelle ist Wikimedia Commons: frei zugaenglich, ohne Zugangsschluessel, mit
 * einer richtigen Volltextsuche. Ein Zufallsdienst liefert bei "Meal Prep"
 * schon mal eine Getreideernte - eine Suche nach Stichworten nicht.
 *
 * Gefundene Treffer werden dauerhaft gespeichert, damit dieselbe Suche nur
 * einmal laeuft und die App offline weiter funktioniert.
 */

export interface MediaHit {
  url: string;
  title: string;
  width?: number;
  height?: number;
}

interface CacheEntry {
  hits: MediaHit[];
  at: number;
}

const API = 'https://commons.wikimedia.org/w/api.php';
/** Wie lange ein Suchergebnis gilt. */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const memory = new Map<string, MediaHit[]>();
const inFlight = new Map<string, Promise<MediaHit[]>>();
/** Suchen, die nicht funktioniert haben - nicht endlos wiederholen. */
const failed = new Set<string>();

function cleanTitle(title: string): string {
  return title
    .replace(/^File:/, '')
    .replace(/\.(jpe?g|png|webm|ogv|gif|svg)$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+\d{2,}$/, '')
    .trim();
}

// Hoechstens drei Suchen gleichzeitig - ein Feed oeffnet sonst dreissig
// Verbindungen auf einmal und blockiert das Laden der Bilder.
let active = 0;
const waiting: (() => void)[] = [];

async function withSlot<T>(work: () => Promise<T>): Promise<T> {
  if (active >= 3) await new Promise<void>((resolve) => waiting.push(resolve));
  else active++;
  try {
    return await work();
  } finally {
    const next = waiting.shift();
    if (next) next();
    else active--;
  }
}

async function fetchJson(params: Record<string, string>): Promise<unknown> {
  // Im Privatmodus geht keine einzige Anfrage raus.
  if (!networkAllowed()) throw new Error('Privatmodus');
  const url = `${API}?${new URLSearchParams({ format: 'json', origin: '*', ...params }).toString()}`;
  return withSlot(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        // Weder Herkunft noch Sitzungsdaten mitschicken.
        referrerPolicy: 'no-referrer',
        credentials: 'omit',
        cache: 'force-cache',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  });
}

interface CommonsPage {
  title?: string;
  imageinfo?: { thumburl?: string; url?: string; width?: number; height?: number; mime?: string; size?: number }[];
}

/** Bilder zu einer Suchanfrage. */
export async function searchImages(query: string, width = 800): Promise<MediaHit[]> {
  const key = `img:${query}:${width}`;
  return cached(key, async () => {
    const data = (await fetchJson({
      action: 'query',
      generator: 'search',
      gsrsearch: `${query} filetype:bitmap`,
      gsrnamespace: '6',
      gsrlimit: '24',
      prop: 'imageinfo',
      iiprop: 'url|size|mime',
      iiurlwidth: String(width),
    })) as { query?: { pages?: Record<string, CommonsPage> } };

    const pages = Object.values(data.query?.pages ?? {});
    const hits: MediaHit[] = [];
    for (const page of pages) {
      const info = page.imageinfo?.[0];
      if (!info?.thumburl || !info.mime?.startsWith('image/')) continue;
      // Sehr schmale Hochformate sind meist Grafiken, keine Fotos.
      if (info.width && info.height && info.width / info.height < 0.55) continue;
      hits.push({ url: info.thumburl, title: cleanTitle(page.title ?? ''), width: info.width, height: info.height });
    }
    return hits;
  });
}

/** Videos zu einer Suchanfrage - nur Formate, die Browser abspielen. */
export async function searchVideos(query: string): Promise<MediaHit[]> {
  const key = `vid:${query}`;
  return cached(key, async () => {
    const data = (await fetchJson({
      action: 'query',
      generator: 'search',
      gsrsearch: `${query} filetype:video`,
      gsrnamespace: '6',
      gsrlimit: '20',
      prop: 'imageinfo',
      iiprop: 'url|size|mime',
    })) as { query?: { pages?: Record<string, CommonsPage> } };

    const pages = Object.values(data.query?.pages ?? {});
    const hits: MediaHit[] = [];
    for (const page of pages) {
      const info = page.imageinfo?.[0];
      if (!info?.url) continue;
      // Ogg-Theora spielt kaum ein Handy ab; sehr grosse Dateien laden zu lange.
      if (!/\.(webm|mp4)$/i.test(info.url)) continue;
      if (info.size && info.size > 40 * 1024 * 1024) continue;
      hits.push({ url: info.url, title: cleanTitle(page.title ?? '') });
    }
    return hits;
  });
}

/** Ergebnis aus dem Speicher holen oder einmalig suchen. */
async function cached(key: string, load: () => Promise<MediaHit[]>): Promise<MediaHit[]> {
  const known = memory.get(key);
  if (known) return known;
  if (failed.has(key)) return [];

  const running = inFlight.get(key);
  if (running) return running;

  const promise = (async () => {
    const stored = await dbGetMedia<CacheEntry>(key);
    if (stored && Date.now() - stored.at < MAX_AGE_MS && stored.hits.length > 0) {
      memory.set(key, stored.hits);
      return stored.hits;
    }
    try {
      const hits = await load();
      if (hits.length === 0) {
        failed.add(key);
        return [];
      }
      memory.set(key, hits);
      void dbPutMedia(key, { hits, at: Date.now() } satisfies CacheEntry);
      return hits;
    } catch {
      // Kein Netz oder Dienst gestoert - die App zeichnet dann selbst.
      failed.add(key);
      return [];
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}

/**
 * Suchbegriffe je Motiv - in natuerlicher Sprache, denn danach wird
 * tatsaechlich gesucht.
 */
const TOPIC_QUERIES: Record<string, string> = {
  'fitness:transformation': 'bodybuilder muscles',
  'fitness:workout': 'gym workout training',
  'fitness:mealprep': 'meal prep food containers',
  'fitness:gymselfie': 'fitness gym mirror',
  'fitness:pr': 'weightlifting barbell',
  'fitness:mistakes': 'gym exercise machine',
  'fitness:restday': 'stretching yoga mat',
  'fitness:homeworkout': 'push up home exercise',
  'food:rezept': 'cooking recipe ingredients',
  'food:streetfood': 'street food stall',
  'food:backen': 'baking cake bread',
  'food:restaurant': 'restaurant dish plate',
  'food:meal': 'lunch plate meal',
  'food:omas': 'home cooking stew pot',
  'food:vegan': 'vegan salad bowl',
  'food:kaffee': 'coffee cup espresso',
  'travel:geheimtipp': 'small village travel',
  'travel:budget': 'backpacker hostel travel',
  'travel:sonnenaufgang': 'sunrise mountain viewpoint',
  'travel:roadtrip': 'road trip highway car',
  'travel:vanlife': 'camper van travel',
  'travel:packliste': 'travel backpack luggage',
  'travel:fail': 'airport terminal traveller',
  'travel:hotel': 'hotel room interior',
  'fashion:outfit': 'street fashion outfit',
  'fashion:thrift': 'second hand clothes shop',
  'fashion:capsule': 'wardrobe clothes rack',
  'fashion:dupes': 'clothing store shopping',
  'fashion:styling': 'fashion model clothing',
  'fashion:runway': 'fashion show runway',
  'fashion:diy': 'sewing machine fabric',
  'fashion:shoes': 'sneakers shoes pair',
  'art:prozess': 'artist painting studio',
  'art:skizze': 'sketchbook pencil drawing',
  'art:fertig': 'painting artwork canvas',
  'art:atelier': 'art studio easel',
  'art:tutorial': 'paint brushes palette',
  'art:fail': 'abstract painting canvas',
  'art:commission': 'portrait drawing',
  'art:material': 'acrylic paint tubes',
  'photo:street': 'street photography city people',
  'photo:portrait': 'portrait photography person',
  'photo:edit': 'photo editing computer',
  'photo:gear': 'camera lens photography',
  'photo:analog': 'analog film camera',
  'photo:settings': 'photographer camera hands',
  'photo:bluehour': 'blue hour city dusk',
  'photo:behind': 'photo studio lighting',
  'tech:setup': 'desk computer workspace',
  'tech:review': 'smartphone gadget device',
  'tech:tipps': 'laptop keyboard hands',
  'tech:ki': 'server data center',
  'tech:code': 'programming code screen',
  'tech:budget': 'electronics components',
  'tech:fail': 'cables computer repair',
  'tech:zukunft': 'robot technology',
  'gaming:clip': 'video game controller',
  'gaming:review': 'game console',
  'gaming:setup': 'gaming pc setup',
  'gaming:speedrun': 'arcade machine',
  'gaming:indie': 'pixel art game',
  'gaming:rant': 'gamepad controller',
  'gaming:nostalgie': 'retro video game console',
  'gaming:tipps': 'person playing video game',
  'music:studio': 'recording studio mixing desk',
  'music:live': 'concert live band stage',
  'music:cover': 'singer microphone',
  'music:beat': 'synthesizer music producer',
  'music:release': 'vinyl record album',
  'music:vinyl': 'vinyl records collection',
  'music:story': 'acoustic guitar songwriter',
  'music:jam': 'band rehearsal instruments',
  'pets:alltag': 'dog pet home',
  'pets:trick': 'dog training trick',
  'pets:welpe': 'puppy kitten young animal',
  'pets:fail': 'dog playing mess',
  'pets:tierarzt': 'veterinarian dog examination',
  'pets:adoption': 'animal shelter dog',
  'pets:schlaf': 'sleeping cat dog',
  'pets:tipps': 'dog leash walk',
  'beauty:routine': 'skincare products bathroom',
  'beauty:tutorial': 'makeup application face',
  'beauty:drogerie': 'cosmetics products shelf',
  'beauty:haare': 'hairstyle hairdresser',
  'beauty:nomakeup': 'natural face portrait',
  'beauty:fails': 'makeup mirror cosmetics',
  'beauty:nails': 'manicure nails hands',
  'beauty:inci': 'cosmetic serum bottle',
  'lifestyle:morgen': 'breakfast morning table',
  'lifestyle:wohnung': 'living room interior',
  'lifestyle:produktiv': 'notebook planner desk',
  'lifestyle:minimal': 'minimalist interior room',
  'lifestyle:mentalhealth': 'window calm person',
  'lifestyle:geld': 'coins savings money',
  'lifestyle:sonntag': 'candle blanket cozy',
  'lifestyle:buch': 'book reading shelf',
  'cars:build': 'car repair garage',
  'cars:youngtimer': 'classic car oldtimer',
  'cars:detail': 'car wheel detail',
  'cars:roadtrip': 'mountain road car',
  'cars:werkstatt': 'mechanic workshop car',
  'cars:ev': 'electric car charging',
  'cars:kosten': 'car engine bay',
  'cars:treffen': 'car meeting show',
  'nature:wandern': 'hiking trail mountains',
  'nature:tiere': 'wild animal deer bird',
  'nature:jahreszeit': 'autumn forest leaves',
  'nature:camping': 'camping tent nature',
  'nature:umwelt': 'forest nature landscape',
  'nature:pflanzen': 'wild flowers plants',
  'nature:nebel': 'fog forest morning',
  'nature:route': 'mountain hiking path',
  'comedy:alltag': 'friends laughing people',
  'comedy:sketch': 'people talking gesture',
  'comedy:meme': 'funny people group',
  'comedy:eltern': 'family children parents',
  'comedy:buero': 'office meeting people',
  'comedy:dialekt': 'people conversation',
  'comedy:selbstironie': 'person laughing portrait',
  'comedy:reaction': 'surprised person face',
  'dance:choreo': 'dancer dancing performance',
  'dance:tutorial': 'dance studio class',
  'dance:freestyle': 'hip hop dancer street',
  'dance:battle': 'breakdance dancer',
  'dance:probe': 'dance rehearsal studio',
  'dance:duo': 'couple dancing',
  'dance:ballett': 'ballet dancer',
  'dance:fail': 'dancer stage performance',
};

/** Rueckfall je Nische, falls ein Motiv keinen eigenen Begriff hat. */
const NICHE_QUERIES: Record<NicheId, string> = {
  fitness: 'gym fitness training',
  food: 'food dish cooking',
  travel: 'travel landscape city',
  fashion: 'fashion clothing style',
  art: 'painting art studio',
  photo: 'photography camera',
  tech: 'computer technology',
  gaming: 'video game gaming',
  music: 'music instruments concert',
  pets: 'dog cat pet',
  beauty: 'cosmetics makeup',
  lifestyle: 'home interior lifestyle',
  cars: 'car automobile',
  nature: 'nature forest landscape',
  comedy: 'people laughing',
  dance: 'dance dancer',
};

export function queryFor(niche: NicheId, topicId: string): string {
  return TOPIC_QUERIES[`${niche}:${topicId}`] ?? NICHE_QUERIES[niche];
}

/** Waehlt aus den Treffern immer denselben - passend zum Seed des Beitrags. */
export function pickHit(hits: MediaHit[], seed: number): MediaHit | undefined {
  if (hits.length === 0) return undefined;
  return hits[Math.abs(seed) % hits.length];
}

/* ------------------------------------------------------------------ */
/* Zuordnung zu Beitraegen                                             */
/* ------------------------------------------------------------------ */


/**
 * Sucht einmalig das passende Medium zu einem Beitrag und merkt es sich am
 * Beitrag. Gibt true zurueck, wenn sich etwas geaendert hat.
 */
export async function resolvePostMedia(post: Post): Promise<boolean> {
  if (post.photoSource !== 'stock' || post.videoId) return false;
  if (post.mediaUrl && (post.format !== 'reel' || post.mediaVideo)) return false;

  const query = queryFor(post.niche, post.topic);
  let changed = false;

  // Reels brauchen zuerst ein Video; klappt das nicht, bleibt das Foto.
  if (post.format === 'reel' && !post.mediaVideo) {
    const videos = await searchVideos(query);
    const hit = pickHit(videos, post.imageSeed);
    if (hit) {
      post.mediaVideo = hit.url;
      post.mediaTitle = hit.title;
      changed = true;
    }
  }

  if (!post.mediaUrl) {
    const images = await searchImages(query);
    const hit = pickHit(images, post.imageSeed);
    if (hit) {
      post.mediaUrl = hit.url;
      if (!post.mediaTitle) post.mediaTitle = hit.title;
      changed = true;
    }
  }

  post.mediaTried = true;
  return changed;
}
