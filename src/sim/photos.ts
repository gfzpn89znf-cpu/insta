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

/** Groesste Datei, die als Reel gespeichert wird. */
export const MAX_VIDEO_BYTES = 60 * 1024 * 1024;

/**
 * Legt ein eigenes Video ab. Videos werden nicht umgerechnet - dafuer fehlt
 * dem Browser die Technik - sondern nur groessenmaessig begrenzt.
 */
export async function importVideo(file: File): Promise<{ id: string } | { error: string }> {
  if (!file.type.startsWith('video/')) return { error: 'Das ist keine Videodatei.' };
  if (file.size > MAX_VIDEO_BYTES) {
    return { error: `Das Video ist ${(file.size / 1024 / 1024).toFixed(0)} MB gross. Bitte hoechstens ${MAX_VIDEO_BYTES / 1024 / 1024} MB.` };
  }
  const id = `vd${Date.now().toString(36)}${(counter++).toString(36)}`;
  if (!(await dbPutPhoto(id, file))) return { error: 'Das Video konnte nicht gespeichert werden.' };
  urlCache.set(id, URL.createObjectURL(file));
  return { id };
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

/**
 * Suchbegriffe je Motiv. Frueher wurde nur nach der Nische gesucht - dann
 * stand unter "Mein Workout heute" schon mal ein Waldbild. Jetzt bestimmt das
 * gewaehlte Motiv die Suche.
 */
const TOPIC_KEYWORDS: Record<string, string> = {
  // Fitness
  'fitness:transformation': 'fitness,muscle',
  'fitness:workout': 'workout,gym',
  'fitness:mealprep': 'mealprep,healthyfood',
  'fitness:gymselfie': 'gym,fitness',
  'fitness:pr': 'weightlifting,barbell',
  'fitness:mistakes': 'gym,training',
  'fitness:restday': 'stretching,yoga',
  'fitness:homeworkout': 'homeworkout,pushup',
  // Food
  'food:rezept': 'recipe,cooking',
  'food:streetfood': 'streetfood,foodtruck',
  'food:backen': 'baking,cake',
  'food:restaurant': 'restaurant,dinner',
  'food:meal': 'lunch,plate',
  'food:omas': 'homemade,stew',
  'food:vegan': 'vegan,salad',
  'food:kaffee': 'coffee,espresso',
  // Reisen
  'travel:geheimtipp': 'village,travel',
  'travel:budget': 'backpacking,hostel',
  'travel:sonnenaufgang': 'sunrise,viewpoint',
  'travel:roadtrip': 'roadtrip,highway',
  'travel:vanlife': 'vanlife,campervan',
  'travel:packliste': 'backpack,luggage',
  'travel:fail': 'airport,train',
  'travel:hotel': 'hotel,room',
  // Fashion
  'fashion:outfit': 'outfit,fashion',
  'fashion:thrift': 'thriftstore,vintageclothes',
  'fashion:capsule': 'wardrobe,clothes',
  'fashion:dupes': 'shopping,fashion',
  'fashion:styling': 'style,model',
  'fashion:runway': 'runway,fashionweek',
  'fashion:diy': 'sewing,tailor',
  'fashion:shoes': 'sneakers,shoes',
  // Kunst
  'art:prozess': 'painting,artist',
  'art:skizze': 'sketchbook,drawing',
  'art:fertig': 'artwork,painting',
  'art:atelier': 'studio,artstudio',
  'art:tutorial': 'paintbrush,palette',
  'art:fail': 'canvas,paint',
  'art:commission': 'portrait,drawing',
  'art:material': 'paint,brushes',
  // Fotografie
  'photo:street': 'streetphotography,city',
  'photo:portrait': 'portrait,photography',
  'photo:edit': 'lightroom,editing',
  'photo:gear': 'camera,lens',
  'photo:analog': 'film,analog',
  'photo:settings': 'camera,photographer',
  'photo:bluehour': 'bluehour,dusk',
  'photo:behind': 'photoshoot,studio',
  // Tech
  'tech:setup': 'desksetup,workspace',
  'tech:review': 'gadget,technology',
  'tech:tipps': 'laptop,keyboard',
  'tech:ki': 'server,technology',
  'tech:code': 'code,programming',
  'tech:budget': 'electronics,gadget',
  'tech:fail': 'cables,computer',
  'tech:zukunft': 'robot,futuristic',
  // Gaming
  'gaming:clip': 'videogame,gaming',
  'gaming:review': 'console,videogame',
  'gaming:setup': 'gamingsetup,rgb',
  'gaming:speedrun': 'arcade,gaming',
  'gaming:indie': 'pixelart,videogame',
  'gaming:rant': 'controller,gaming',
  'gaming:nostalgie': 'retrogaming,arcade',
  'gaming:tipps': 'gamer,controller',
  // Musik
  'music:studio': 'recordingstudio,mixer',
  'music:live': 'concert,livemusic',
  'music:cover': 'singer,microphone',
  'music:beat': 'synthesizer,producer',
  'music:release': 'vinyl,album',
  'music:vinyl': 'vinyl,records',
  'music:story': 'guitar,songwriter',
  'music:jam': 'band,rehearsal',
  // Tiere
  'pets:alltag': 'dog,pet',
  'pets:trick': 'dogtraining,dog',
  'pets:welpe': 'puppy,kitten',
  'pets:fail': 'dog,mess',
  'pets:tierarzt': 'veterinarian,dog',
  'pets:adoption': 'shelterdog,rescuedog',
  'pets:schlaf': 'sleepingcat,sleepingdog',
  'pets:tipps': 'dog,leash',
  // Beauty
  'beauty:routine': 'skincare,cosmetics',
  'beauty:tutorial': 'makeup,beauty',
  'beauty:drogerie': 'cosmetics,products',
  'beauty:haare': 'hairstyle,hairdresser',
  'beauty:nomakeup': 'portrait,face',
  'beauty:fails': 'makeup,mirror',
  'beauty:nails': 'nails,manicure',
  'beauty:inci': 'serum,skincare',
  // Lifestyle
  'lifestyle:morgen': 'morning,breakfast',
  'lifestyle:wohnung': 'interior,livingroom',
  'lifestyle:produktiv': 'notebook,planner',
  'lifestyle:minimal': 'minimalism,interior',
  'lifestyle:mentalhealth': 'calm,window',
  'lifestyle:geld': 'savings,coins',
  'lifestyle:sonntag': 'candle,blanket',
  'lifestyle:buch': 'book,reading',
  // Autos
  'cars:build': 'carrepair,garage',
  'cars:youngtimer': 'classiccar,oldtimer',
  'cars:detail': 'cardetail,wheel',
  'cars:roadtrip': 'mountainroad,car',
  'cars:werkstatt': 'garage,mechanic',
  'cars:ev': 'electriccar,charging',
  'cars:kosten': 'car,engine',
  'cars:treffen': 'carmeet,cars',
  // Natur
  'nature:wandern': 'hiking,trail',
  'nature:tiere': 'wildlife,deer',
  'nature:jahreszeit': 'autumn,forest',
  'nature:camping': 'camping,tent',
  'nature:umwelt': 'nature,forest',
  'nature:pflanzen': 'plants,flowers',
  'nature:nebel': 'fog,forest',
  'nature:route': 'mountains,hiking',
  // Comedy
  'comedy:alltag': 'friends,laughing',
  'comedy:sketch': 'people,funny',
  'comedy:meme': 'funny,people',
  'comedy:eltern': 'family,children',
  'comedy:buero': 'office,meeting',
  'comedy:dialekt': 'people,talking',
  'comedy:selbstironie': 'portrait,funny',
  'comedy:reaction': 'laughing,person',
  // Tanz
  'dance:choreo': 'dancer,dancing',
  'dance:tutorial': 'dance,studio',
  'dance:freestyle': 'hiphopdance,dancer',
  'dance:battle': 'breakdance,dancer',
  'dance:probe': 'dancestudio,rehearsal',
  'dance:duo': 'dancing,couple',
  'dance:ballett': 'ballet,dancer',
  'dance:fail': 'dancer,stage',
};

/** Rueckfall, wenn ein Motiv nicht in der Liste steht. */
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
 * werden: erst genau zum Motiv, dann zur Nische, dann irgendein Foto - und
 * wenn alles scheitert, zeichnet die App das Bild selbst.
 */
export function stockPhotoUrls(seed: number, niche: NicheId, size = 600, topicId?: string): string[] {
  const lock = Math.abs(seed) % 100000;
  const urls: string[] = [];
  const topicTags = topicId ? TOPIC_KEYWORDS[`${niche}:${topicId}`] : undefined;
  if (topicTags) {
    // "/all" verlangt, dass alle Begriffe zutreffen - das trifft das Motiv.
    urls.push(`https://loremflickr.com/${size}/${size}/${encodeURIComponent(topicTags)}/all?lock=${lock}`);
    urls.push(`https://loremflickr.com/${size}/${size}/${encodeURIComponent(topicTags.split(',')[0])}?lock=${lock}`);
  }
  urls.push(`https://loremflickr.com/${size}/${size}/${encodeURIComponent(KEYWORDS[niche])}?lock=${lock}`);
  urls.push(`https://picsum.photos/seed/fg${lock}/${size}/${size}`);
  return urls;
}

/**
 * Profilbild eines KI-Accounts: ein echtes Portraitfoto statt des
 * gezeichneten Monogramms.
 */
export function portraitUrl(accountId: string, female: boolean, size = 128): string {
  let hash = 0;
  for (let i = 0; i < accountId.length; i++) hash = (hash * 31 + accountId.charCodeAt(i)) >>> 0;
  const index = hash % 100;
  const folder = female ? 'women' : 'men';
  const variant = size <= 128 ? 'med' : 'large';
  return `https://randomuser.me/api/portraits/${variant}/${folder}/${index}.jpg`;
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
    if (p?.videoId) used.add(p.videoId);
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
