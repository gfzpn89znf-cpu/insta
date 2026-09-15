import { aiReady, askVision, parseJsonObject } from './ai';
import { getPrivacy } from './flags';
import { NICHES, NICHE_IDS } from './niches';
import type { NicheId } from './types';

/**
 * Erkennt, was auf einem hochgeladenen Foto oder Video zu sehen ist.
 *
 * Bei Videos wird ein Einzelbild aus der Mitte herausgegriffen - ein Bild
 * reicht, um das Thema zu erkennen, und spart Datenmenge.
 *
 * Wichtig: dafuer verlaesst eine verkleinerte Fassung der Aufnahme das
 * Geraet. Das passiert nur, wenn es in den Einstellungen ausdruecklich
 * erlaubt wurde - die Vorgabe ist "aus".
 */

export interface MediaInsight {
  /** Ein Satz: was ist zu sehen. */
  description: string;
  /** Passende Hashtags ohne Rautezeichen. */
  hashtags: string[];
  /** Am besten passende Nische, falls erkennbar. */
  niche?: NicheId;
  /** Vorschlag fuer eine Bildunterschrift. */
  caption?: string;
}

/** Verkleinert eine Aufnahme auf ein handliches Mass fuer die Analyse. */
async function toBase64Jpeg(source: CanvasImageSource, width: number, height: number): Promise<string | null> {
  const max = 640;
  const scale = Math.min(1, max / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
  const comma = dataUrl.indexOf(',');
  return comma > 0 ? dataUrl.slice(comma + 1) : null;
}

/** Holt ein Einzelbild aus einem Video. */
function grabVideoFrame(file: File): Promise<{ data: string; width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.src = url;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
    };

    const fail = () => {
      cleanup();
      resolve(null);
    };

    video.onerror = fail;
    video.onloadedmetadata = () => {
      // Aus der Mitte greifen: der Anfang ist oft schwarz.
      const target = Math.min(Math.max(video.duration / 2, 0.2), 8);
      video.currentTime = Number.isFinite(target) ? target : 0.2;
    };
    video.onseeked = () => {
      void toBase64Jpeg(video, video.videoWidth, video.videoHeight).then((data) => {
        cleanup();
        resolve(data ? { data, width: video.videoWidth, height: video.videoHeight } : null);
      });
    };
    window.setTimeout(fail, 12000);
  });
}

/** Holt ein Einzelbild aus einer Bilddatei. */
function loadImageFrame(file: File): Promise<{ data: string; width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      void toBase64Jpeg(img, img.naturalWidth, img.naturalHeight).then((data) => {
        URL.revokeObjectURL(url);
        resolve(data ? { data, width: img.naturalWidth, height: img.naturalHeight } : null);
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

const SYSTEM = [
  'Du schaust dir ein Foto oder ein Einzelbild aus einem Video an, das jemand in einer Foto-App posten will.',
  'Beschreibe knapp und konkret, was darauf zu sehen ist - erkennbare Sportart, Ort, Taetigkeit, Gegenstaende.',
  'Wenn du eine bekannte Person, einen Sportler oder eine Veranstaltung erkennst, benenne sie.',
  '',
  'Antworte ausschliesslich mit einem JSON-Objekt in dieser Form:',
  '{"beschreibung": "...", "thema": "...", "hashtags": ["...", "..."], "unterschrift": "..."}',
  '- "beschreibung": ein deutscher Satz, was zu sehen ist.',
  `- "thema": genau eines von: ${NICHE_IDS.join(', ')} - das am besten passende.`,
  '- "hashtags": 4 bis 8 passende Hashtags auf Deutsch, ohne Rautezeichen, klein geschrieben.',
  '- "unterschrift": ein Vorschlag fuer die Bildunterschrift, hoechstens 200 Zeichen, persoenlich formuliert.',
].join('\n');

/**
 * Analysiert eine hochgeladene Datei. Gibt null zurueck, wenn die
 * Bilderkennung nicht erlaubt oder keine KI eingerichtet ist.
 */
export async function describeUpload(file: File): Promise<MediaInsight | null> {
  // Ohne ausdrueckliche Erlaubnis sieht die Bilderkennung nichts.
  if (!getPrivacy().shareImages) return null;
  if (!aiReady()) return null;

  const frame = file.type.startsWith('video/') ? await grabVideoFrame(file) : await loadImageFrame(file);
  if (!frame) return null;

  const answer = await askVision(
    SYSTEM,
    file.type.startsWith('video/')
      ? 'Das ist ein Einzelbild aus einem Video. Worum geht es?'
      : 'Worum geht es auf diesem Foto?',
    { data: frame.data, mediaType: 'image/jpeg' },
  );

  const parsed = parseJsonObject(answer);
  if (!parsed) return null;

  const description = typeof parsed.beschreibung === 'string' ? parsed.beschreibung.trim() : '';
  if (!description) return null;

  const rawTags = Array.isArray(parsed.hashtags) ? parsed.hashtags : [];
  const hashtags = rawTags
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.toLowerCase().replace(/^#/, '').replace(/[^a-z0-9äöüß_]/g, ''))
    .filter(Boolean)
    .slice(0, 8);

  const theme = typeof parsed.thema === 'string' ? (parsed.thema.trim() as NicheId) : undefined;
  const niche = theme && NICHES[theme] ? theme : undefined;
  const caption = typeof parsed.unterschrift === 'string' ? parsed.unterschrift.trim().slice(0, 280) : undefined;

  return { description, hashtags, niche, caption };
}
