import { NICHES } from './niches';
import { chance, clamp, pick, pickMany, randInt, rngFrom } from './rng';
import { followerCount } from './scoring';
import { closenessOf } from './chat';
import type { World } from './types';

/**
 * Sprach- und Videoanrufe mit den KI-Accounts.
 *
 * Ob jemand abnimmt, haengt davon ab, wie gut ihr euch kennt, wie
 * gesellig die Person ist, wie gross ihr Account ist - und ob gerade
 * mitten in der Nacht ist.
 */

export interface CallPlan {
  /** Nimmt das Gegenueber ab? */
  answers: boolean;
  /** Wie lange es klingelt (ms). */
  ringMs: number;
  /** Begruessung beim Abheben. */
  greeting: string;
  /** Weitere Saetze im Gespraechsverlauf. */
  lines: string[];
  /** Grund, falls niemand abnimmt. */
  reason?: string;
}

export function planCall(world: World, accountId: string, video: boolean): CallPlan {
  const partner = world.accounts[accountId];
  const rng = rngFrom(world.seed, accountId, Math.floor(world.time), video ? 'video' : 'audio');
  const hour = (world.time / 60) % 24;
  const closeness = closenessOf(world, accountId);

  if (!partner) {
    return { answers: false, ringMs: 4000, greeting: '', lines: [], reason: 'Der Account ist nicht erreichbar.' };
  }

  const reach = clamp(Math.log10(followerCount(partner) + 10) / 6.5, 0, 1);
  const night = hour < 7 || hour >= 23;
  const followsYou = partner.following.includes(world.user.accountId);

  // Die meisten Menschen gehen ran. Schwierig wird es bei sehr grossen
  // Accounts und nachts - vorher ging praktisch nie jemand ran.
  let p = 0.95 - reach * 0.6 + closeness * 0.2 + partner.traits.sociability * 0.1;
  if (reach > 0.8) p -= 0.25; // Stars haben selten Zeit fuer Unbekannte
  if (followsYou) p += 0.1;
  if (night) p -= 0.3;
  if (video) p -= 0.08; // Videoanrufe nimmt man seltener spontan an
  const answers = chance(rng, clamp(p, 0.05, 0.97));

  const niche = NICHES[partner.niche];
  const first = partner.name.split(' ')[0];

  if (!answers) {
    return {
      answers: false,
      ringMs: randInt(rng, 5000, 8000),
      greeting: '',
      lines: [],
      reason: night
        ? `${first} schlaeft vermutlich - es ist mitten in der Nacht.`
        : reach > 0.7
          ? `${first} bekommt sehr viele Anrufe. Schreib lieber eine Nachricht.`
          : `${first} konnte gerade nicht rangehen.`,
    };
  }

  const greeting = pick(rng, [
    `Hey! Schoen, dass du anrufst.`,
    `Hallo! Ich habe dich gerade auf dem Schirm gehabt.`,
    `Hi! Warte, ich gehe kurz raus... so, jetzt.`,
    `${video ? 'Siehst du mich?' : 'Hoerst du mich?'} Ja? Super.`,
  ]);

  const topic = pick(rng, niche.topics);
  const pool = [
    `Ich bin gerade bei ${topic.label}, das frisst mehr Zeit als gedacht.`,
    `Wie laeuft es bei dir mit den Beitraegen? Ich sehe dich oefter im Feed.`,
    `Ehrlich? Reichweite ist ein Auf und Ab. Letzte Woche lief gar nichts.`,
    `Wir sollten mal was zusammen machen. ${niche.emoji}`,
    `Sag mal, wie kommst du eigentlich auf deine Ideen?`,
    `Ich habe deinen letzten Beitrag gesehen - richtig gut geworden.`,
    `Bei mir ist gerade viel los, aber im guten Sinne.`,
    `Kennst du das, wenn man den ganzen Tag plant und dann doch nichts postet?`,
    `Ich muss gleich weiter, aber das war schoen, von dir zu hoeren.`,
  ];

  return {
    answers: true,
    ringMs: randInt(rng, 2000, 4500),
    greeting,
    lines: pickMany(rng, pool, randInt(rng, 4, 7)),
  };
}

/**
 * Ruft jemand von sich aus an? Passiert selten und nur bei Leuten,
 * mit denen der Nutzer schon zu tun hatte.
 */
export function pickIncomingCaller(world: World): string | null {
  const candidates = Object.entries(world.user.closeness)
    .filter(([id, value]) => value > 0.35 && world.accounts[id] && !world.accounts[id].isUser)
    .map(([id]) => id);
  if (candidates.length === 0) return null;

  const hour = (world.time / 60) % 24;
  if (hour < 8 || hour >= 23) return null;

  const rng = rngFrom(world.seed, 'incoming', Math.floor(world.time / 30));
  if (!chance(rng, 0.08)) return null;
  return pick(rng, candidates);
}
