import { GENERIC_COMMENTS, HATER_COMMENTS, FAN_COMMENTS, NICHES, type Topic } from './niches';
import { chance, pick, pickMany, randInt, type Rng } from './rng';
import type { NicheId, Trend } from './types';

const EMOJI: Record<NicheId, string[]> = {
  fitness: ['💪', '🔥', '🏋️', '⚡'],
  food: ['🍝', '😋', '🔥', '🥑'],
  travel: ['✈️', '🌍', '🏔️', '🌅'],
  fashion: ['👗', '✨', '🧥', '👠'],
  art: ['🎨', '✏️', '🖌️', '✨'],
  photo: ['📷', '🎞️', '🌆', '✨'],
  tech: ['💻', '⚙️', '🤖', '⚡'],
  gaming: ['🎮', '🕹️', '🔥', '👾'],
  music: ['🎧', '🎸', '🎶', '🔊'],
  pets: ['🐕', '🐾', '❤️', '🐈'],
  beauty: ['💄', '✨', '🧴', '💅'],
  lifestyle: ['🌿', '☕', '🕯️', '📓'],
  cars: ['🚗', '🔧', '🏁', '💨'],
  nature: ['🌲', '🏕️', '🍂', '🌄'],
  comedy: ['😂', '🤣', '💀', '🙃'],
  dance: ['💃', '🕺', '🎶', '🔥'],
};

/** Ersetzt Platzhalter in einer Caption-Vorlage. */
export function generateCaption(rng: Rng, niche: NicheId, topic: Topic): string {
  const template = pick(rng, NICHES[niche].captions);
  return template
    .replace(/\{topic\}/g, topic.label)
    .replace(/\{emoji\}/g, pick(rng, EMOJI[niche]))
    .replace(/\{n2\}/g, String(randInt(rng, 30, 365)))
    .replace(/\{n\}/g, String(randInt(rng, 3, 90)));
}

/**
 * Hashtag-Auswahl. Trendige Accounts greifen aktuelle Tags auf, alle anderen
 * bleiben bei ihren Nischen-Tags.
 */
export function generateHashtags(rng: Rng, niche: NicheId, trends: Trend[], trendChasing: number): string[] {
  const count = randInt(rng, 3, 11);
  const base = pickMany(rng, NICHES[niche].hashtags, count);
  const hot = trends.filter((t) => t.niche === niche || chance(rng, 0.25));
  if (hot.length > 0 && chance(rng, 0.25 + trendChasing * 0.65)) {
    const trend = pick(rng, hot);
    if (!base.includes(trend.tag)) base.unshift(trend.tag);
  }
  return base;
}

export type CommentMood = 'normal' | 'fan' | 'hater' | 'niche';

export function generateComment(rng: Rng, niche: NicheId, mood: CommentMood, followerHint = 100): string {
  switch (mood) {
    case 'hater':
      return pick(rng, HATER_COMMENTS);
    case 'fan':
      return pick(rng, FAN_COMMENTS).replace('{n}', formatShort(followerHint));
    case 'niche':
      return pick(rng, NICHES[niche].comments);
    default:
      return chance(rng, 0.45) ? pick(rng, NICHES[niche].comments) : pick(rng, GENERIC_COMMENTS);
  }
}

export function pickEmoji(rng: Rng, niche: NicheId): string {
  return pick(rng, EMOJI[niche]);
}

/** Kurzform grosser Zahlen: 12400 -> "12,4 Tsd." */
export function formatShort(n: number): string {
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) {
    const v = n / 1000;
    return `${v < 10 ? v.toFixed(1).replace('.', ',') : Math.round(v)} Tsd.`;
  }
  const v = n / 1_000_000;
  return `${v < 10 ? v.toFixed(1).replace('.', ',') : Math.round(v)} Mio.`;
}

/** Zahl mit deutschen Tausenderpunkten. */
export function formatFull(n: number): string {
  return Math.round(n).toLocaleString('de-DE');
}

const STORY_TEXTS = [
  'Guten Morgen ☀️',
  'Heute wird gearbeitet',
  'Kurzes Update',
  'Danke fuer 🔥',
  'Neuer Post ist online',
  'Frag mich was',
  'Hinter den Kulissen',
  'Unterwegs',
  'Kaffee Nr. 3',
  'Abstimmung: links oder rechts?',
];

export function generateStoryText(rng: Rng): string {
  return pick(rng, STORY_TEXTS);
}

/** Markennamen fuer Kooperationsanfragen. */
export const BRANDS = [
  'NordFit', 'Hausmarke', 'Brewhaus Kaffee', 'Lumen Optics', 'Tagwerk Studio',
  'Kraftstoff Nutrition', 'Waldkind Outdoor', 'Pixelwerk', 'Silberdistel Cosmetics',
  'Rollpark Mobility', 'Tonlabor Audio', 'Gruenzeug Bio', 'Faden & Form', 'Nachtschicht Energy',
];
