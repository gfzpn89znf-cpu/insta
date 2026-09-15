import { NICHES, getTopic, styleFit } from './niches';
import { clamp, smoothstep } from './rng';
import type { Account, NicheId, PostFormat, QualityBreakdown, StyleId, World } from './types';

export interface Draft {
  niche: NicheId;
  topicId: string;
  style: StyleId;
  caption: string;
  hashtags: string[];
  collabId?: string;
  /** Optionaler Bild-Seed, damit Vorschau und Veroeffentlichung identisch sind. */
  imageSeed?: number;
  /** Eigenes Foto statt eines gezeichneten Motivs. */
  photoId?: string;
  /** Bild oder Reel. */
  format?: PostFormat;
  /** Eigenes Video fuer ein Reel. */
  videoId?: string;
}

const SPAM_TAGS = ['followme', 'follow4follow', 'f4f', 'likeforlike', 'l4l', 'followback', 'gainpost', 'spam'];
const CTA_PATTERNS = [/\?/, /speicher/i, /markier/i, /kommentier/i, /was denkt/i, /wer kennt/i, /schreib/i, /teilt/i, /verrat/i];
const STORY_PATTERNS = [/ich /i, /mein/i, /damals/i, /frueher/i, /gelernt/i, /ehrlich/i, /gedauert/i, /gescheitert/i];
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;

/** Bewertet den Caption-Text nach den Mustern, die auf echten Plattformen funktionieren. */
export function scoreCaption(caption: string): { score: number; hints: string[] } {
  const hints: string[] = [];
  const text = caption.trim();
  const len = text.length;
  if (len === 0) return { score: 0.12, hints: ['Ohne Text bleibt Reichweite liegen - erzaehl etwas zum Bild.'] };

  // Laenge: zu kurz wirkt lieblos, zu lang wird weggescrollt.
  let lengthScore: number;
  if (len < 15) {
    lengthScore = 0.25;
    hints.push('Die Caption ist sehr kurz. 40-220 Zeichen holen deutlich mehr raus.');
  } else if (len < 40) {
    lengthScore = 0.55;
  } else if (len <= 220) {
    lengthScore = 1;
  } else if (len <= 600) {
    lengthScore = 0.82;
  } else {
    lengthScore = 0.5;
    hints.push('Sehr langer Text - die meisten lesen nur die ersten zwei Zeilen.');
  }

  const firstLine = text.split('\n')[0];
  const hookScore = firstLine.length >= 12 && firstLine.length <= 90 ? 1 : 0.6;
  if (hookScore < 1) hints.push('Der erste Satz ist dein Hook. Halte ihn kurz und konkret.');

  const hasCta = CTA_PATTERNS.some((r) => r.test(text));
  if (!hasCta) hints.push('Eine Frage oder ein Aufruf am Ende bringt spuerbar mehr Kommentare.');

  const hasStory = STORY_PATTERNS.some((r) => r.test(text));
  if (!hasStory) hints.push('Persoenliche Details ("Ich habe...") wirken authentischer als Werbesprache.');

  const hasEmoji = EMOJI_RE.test(text);
  const upper = text.replace(/[^A-Za-zÄÖÜäöüß]/g, '');
  const caps = upper.length > 12 ? (text.match(/[A-ZÄÖÜ]/g) ?? []).length / upper.length : 0;
  const bangs = (text.match(/!/g) ?? []).length;

  let penalty = 0;
  if (caps > 0.5) {
    penalty += 0.2;
    hints.push('Durchgehende Grossbuchstaben wirken wie Spam.');
  }
  if (bangs > 3) {
    penalty += 0.12;
    hints.push('Weniger Ausrufezeichen wirkt souveraener.');
  }
  if (/folgt? mir|follow ?me|abonnier/i.test(text)) {
    penalty += 0.18;
    hints.push('Direkte Follower-Bettelei senkt die Bewertung durch den Algorithmus.');
  }

  const score = clamp(
    lengthScore * 0.4 + hookScore * 0.16 + (hasCta ? 0.19 : 0.04) + (hasStory ? 0.15 : 0.03) + (hasEmoji ? 0.1 : 0.04) - penalty,
    0.05,
    1,
  );
  return { score, hints };
}

/** Bewertet das Hashtag-Set: Menge, Relevanz, Trendnutzung, Spam. */
export function scoreHashtags(
  hashtags: string[],
  niche: NicheId,
  trendTags: Set<string>,
): { score: number; hints: string[] } {
  const hints: string[] = [];
  const tags = [...new Set(hashtags.map((t) => t.toLowerCase().replace(/^#/, '')))].filter(Boolean);
  if (tags.length === 0) {
    return { score: 0.2, hints: ['Ganz ohne Hashtags findet dich kaum jemand ueber Explore.'] };
  }

  // Menge: 5-12 ist der Bereich, in dem Reichweite und Serioesitaet zusammenpassen.
  let countScore: number;
  if (tags.length < 3) {
    countScore = 0.45;
    hints.push('3-12 Hashtags sind der Sweetspot, du nutzt zu wenige.');
  } else if (tags.length <= 12) {
    countScore = 1;
  } else if (tags.length <= 20) {
    countScore = 0.7;
    hints.push('Ueber 12 Hashtags bringen kaum noch Reichweite.');
  } else {
    countScore = 0.35;
    hints.push('Hashtag-Spam wird vom Algorithmus abgestraft.');
  }

  const nicheTags = new Set(NICHES[niche].hashtags);
  const relevant = tags.filter((t) => nicheTags.has(t)).length;
  const relevance = clamp(relevant / Math.max(3, Math.min(tags.length, 8)), 0, 1);
  if (relevance < 0.5) hints.push('Nutze mehr Hashtags aus deiner Nische - sie liefern die passende Zielgruppe.');

  const trendHits = tags.filter((t) => trendTags.has(t)).length;
  const trendBonus = clamp(trendHits * 0.18, 0, 0.3);
  if (trendHits === 0 && trendTags.size > 0) hints.push('Ein aktueller Trend-Hashtag kann die Reichweite vervielfachen.');

  const spam = tags.filter((t) => SPAM_TAGS.includes(t)).length;
  const spamPenalty = spam * 0.25;
  if (spam > 0) hints.push('Tags wie #followme markieren dich als Spam-Account.');

  return { score: clamp(countScore * 0.45 + relevance * 0.45 + trendBonus - spamPenalty, 0.05, 1), hints };
}

/** Wie gut passt die Uhrzeit zur Zielgruppe? */
export function scoreTiming(world: World, account: Account): { score: number; hint?: string } {
  const hour = Math.floor((world.time / 60) % 24);
  // Zwei Peaks: morgens vor der Arbeit und abends auf dem Sofa.
  const morning = Math.exp(-Math.pow(hour - 8, 2) / 6) * 0.75;
  const evening = Math.exp(-Math.pow(hour - 20, 2) / 8);
  const lunch = Math.exp(-Math.pow(hour - 12.5, 2) / 3) * 0.6;
  const audienceHour = Math.exp(-Math.pow(hour - account.peakHour, 2) / 10) * 0.55;
  const score = clamp(0.3 + Math.max(morning, evening, lunch, audienceHour) * 0.75, 0.2, 1);
  const hint = score < 0.6 ? `Um ${hour} Uhr ist wenig los. Abends zwischen 19 und 21 Uhr ist deine Zielgruppe online.` : undefined;
  return { score, hint };
}

/** Regelmaessigkeit: Streak und Abstand zum letzten Post. */
export function scoreConsistency(world: World, account: Account): { score: number; hint?: string } {
  const days = (world.time - account.lastPostAt) / 1440;
  let gap: number;
  if (account.postIds.length === 0) gap = 0.6;
  else if (days < 0.15) gap = 0.55; // zu schnell hintereinander kannibalisiert sich
  else if (days <= 2.5) gap = 1;
  else if (days <= 6) gap = 0.72;
  else if (days <= 14) gap = 0.45;
  else gap = 0.25;

  const streakScore = clamp(account.streak / 14, 0, 1);
  const score = clamp(gap * 0.65 + streakScore * 0.35, 0.05, 1);
  let hint: string | undefined;
  if (days > 6 && account.postIds.length > 0) hint = 'Lange Pause - der Algorithmus testet dich wieder bei weniger Followern.';
  else if (days < 0.15 && account.postIds.length > 0) hint = 'Zwei Posts kurz hintereinander nehmen sich gegenseitig Reichweite.';
  return { score, hint };
}

/** Wie konsequent bleibt der Account bei einem Thema? */
export function scoreNicheCoherence(world: World, account: Account, niche: NicheId): { score: number; hint?: string } {
  const recent = account.postIds.slice(-10).map((id) => world.posts[id]).filter(Boolean);
  if (recent.length === 0) return { score: 0.7 };
  const same = recent.filter((p) => p.niche === niche).length;
  const share = same / recent.length;
  const audienceShare = account.audience[niche] ?? 0;
  const score = clamp(share * 0.55 + audienceShare * 0.45 + 0.1, 0.1, 1);
  const hint =
    share < 0.5
      ? `Dein Publikum folgt dir wegen ${NICHES[account.niche].label}. Themenwechsel kosten erst einmal Reichweite.`
      : undefined;
  return { score, hint };
}

/** Gesamtbewertung eines Nutzer-Entwurfs. */
export function scoreDraft(world: World, account: Account, draft: Draft): QualityBreakdown {
  const topic = getTopic(draft.niche, draft.topicId);
  const hints: string[] = [];

  const motiv = clamp(topic.core * 0.45 + topic.broad * 0.55, 0, 1);
  if (topic.broad < 0.55) hints.push(`"${topic.label}" spricht vor allem deine Stammleser an, kaum neue Leute.`);

  // Ein echtes Foto wirkt fast immer glaubwuerdiger als ein Filter-Look.
  const stil = draft.photoId ? 0.92 : styleFit(draft.niche, draft.style);
  if (stil < 0.7) hints.push(`Der Stil passt optisch nicht optimal zu ${NICHES[draft.niche].label}.`);

  const cap = scoreCaption(draft.caption);
  hints.push(...cap.hints);

  const trendTags = new Set(world.trends.map((t) => t.tag));
  const tags = scoreHashtags(draft.hashtags, draft.niche, trendTags);
  hints.push(...tags.hints);

  const timing = scoreTiming(world, account);
  if (timing.hint) hints.push(timing.hint);

  const konsistenz = scoreConsistency(world, account);
  if (konsistenz.hint) hints.push(konsistenz.hint);

  const nische = scoreNicheCoherence(world, account, draft.niche);
  if (nische.hint) hints.push(nische.hint);

  let kollab = 0;
  if (draft.collabId) {
    const partner = world.accounts[draft.collabId];
    if (partner) {
      const mine = followerCount(account);
      const theirs = followerCount(partner);
      // Groessere Partner bringen mehr, aehnliche Nische bringt qualifizierte Follower.
      const sizeBoost = smoothstep(0, 1, Math.log10(Math.max(theirs, 10) / Math.max(mine, 10)) / 2 + 0.3);
      const nicheBoost = partner.niche === draft.niche ? 1 : 0.55;
      kollab = clamp(sizeBoost * nicheBoost, 0, 1);
    }
  }

  const total = clamp(
    motiv * 0.22 + cap.score * 0.16 + tags.score * 0.12 + stil * 0.1 + timing.score * 0.1 + konsistenz.score * 0.12 + nische.score * 0.13 + kollab * 0.05,
    0.02,
    1,
  );

  return {
    motiv,
    stil,
    caption: cap.score,
    hashtags: tags.score,
    timing: timing.score,
    konsistenz: konsistenz.score,
    nische: nische.score,
    kollab,
    total,
    hints: hints.slice(0, 5),
  };
}

export function followerCount(a: Account): number {
  return a.realFollowers.length + a.crowdFollowers;
}
