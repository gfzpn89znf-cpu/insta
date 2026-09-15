import { NICHES } from './niches';
import { chance, clamp, pick, randInt, rngFrom, type Rng } from './rng';
import { followerCount } from './scoring';
import { addLog, follow, pushNotification } from './engine';
import { formatShort } from './content';
import type { Account, DmThread, World } from './types';

/**
 * Unterhaltungen mit den KI-Accounts.
 *
 * Die Antworten entstehen aus der Persoenlichkeit des Gegenuebers, aus dem,
 * was der Nutzer geschrieben hat, und aus der bisherigen Naehe. Sie kommen
 * mit Verzoegerung - niemand antwortet in Nullzeit.
 */

export function closenessOf(world: World, accountId: string): number {
  return world.user.closeness[accountId] ?? 0;
}

export function raiseCloseness(world: World, accountId: string, amount: number) {
  const next = clamp(closenessOf(world, accountId) + amount, 0, 1);
  world.user.closeness[accountId] = next;

  // Wer dich mag, folgt dir irgendwann auch.
  const account = world.accounts[accountId];
  const user = world.accounts[world.user.accountId];
  if (account && next > 0.35 && !account.following.includes(user.id)) {
    const rng = rngFrom(accountId, Math.floor(world.time), 'close');
    if (chance(rng, next * 0.5)) {
      follow(account, user);
      pushNotification(world, { kind: 'follow', actorId: account.id, text: 'folgt dir jetzt.' });
    }
  }
}

/** Sucht die Unterhaltung mit einem Account oder legt sie an. */
export function openChat(world: World, accountId: string): string {
  const existing = world.threadOrder.find((id) => world.threads[id]?.accountId === accountId);
  if (existing) return existing;

  const id = `t${world.counter++}`;
  const thread: DmThread = {
    id,
    accountId,
    kind: 'friend',
    unread: false,
    lastAt: world.time,
    messages: [],
  };
  world.threads[id] = thread;
  world.threadOrder.unshift(id);
  return id;
}

/** Nachricht des Nutzers senden und eine Antwort vorbereiten. */
export function sendMessage(world: World, threadId: string, text: string) {
  const thread = world.threads[threadId];
  const clean = text.trim().slice(0, 500);
  if (!thread || !clean) return;
  const user = world.accounts[world.user.accountId];

  thread.messages.push({
    id: `m${world.counter++}`,
    fromId: user.id,
    text: clean,
    at: world.time,
    fromUser: true,
  });
  thread.lastAt = world.time;
  thread.unread = false;
  if (thread.messages.length > 200) thread.messages.splice(0, thread.messages.length - 200);

  const partner = world.accounts[thread.accountId];
  if (!partner || partner.isUser) return;

  raiseCloseness(world, partner.id, 0.04);

  const rng = rngFrom(world.seed, thread.id, thread.messages.length);
  // Grosse Accounts antworten seltener und spaeter.
  const reach = clamp(Math.log10(followerCount(partner) + 10) / 6.5, 0, 1);
  const willAnswer = chance(rng, clamp(0.95 - reach * 0.55 + closenessOf(world, partner.id) * 0.4, 0.15, 0.98));
  if (!willAnswer) return;

  thread.pendingReply = replyTo(rng, world, partner, clean);
  // Zwischen zwei und zehn Sekunden - lang genug, um echt zu wirken.
  thread.replyAtReal = Date.now() + randInt(rng, 2000, 9000) + Math.round(reach * 6000);
}

/**
 * Faellige Antworten zustellen. Laeuft ueber die echte Uhr, damit ein
 * Gespraech auch bei pausierter Simulation weitergeht.
 */
export function processChatReplies(world: World): boolean {
  const now = Date.now();
  let changed = false;
  for (const id of world.threadOrder) {
    const thread = world.threads[id];
    if (!thread?.replyAtReal || !thread.pendingReply) continue;
    if (now < thread.replyAtReal) continue;

    thread.messages.push({
      id: `m${world.counter++}`,
      fromId: thread.accountId,
      text: thread.pendingReply,
      at: world.time,
      fromUser: false,
    });
    thread.lastAt = world.time;
    thread.unread = true;
    thread.replyAtReal = undefined;
    thread.pendingReply = undefined;
    changed = true;
  }
  return changed;
}

/** Schreibt das Gegenueber gerade? */
export function isTyping(thread: DmThread | undefined): boolean {
  if (!thread?.replyAtReal) return false;
  // Die letzten drei Sekunden vor der Antwort gelten als "tippt".
  return Date.now() > thread.replyAtReal - 3000;
}

/* ------------------------------------------------------------------ */
/* Antworten                                                           */
/* ------------------------------------------------------------------ */

const GREETING = /\b(hi|hallo|hey|moin|servus|guten (morgen|tag|abend)|na\b)/i;
const QUESTION = /\?/;
const COMPLIMENT = /\b(toll|super|stark|mega|schoen|schön|liebe|gut|klasse|geil|inspir|fan\b)/i;
const COLLAB = /\b(kollab|zusammen|gemeinsam|kooperation|projekt|feature|shooting|drehen)\b/i;
const MEET = /\b(treffen|kaffee|date|vorbei|besuch|sehen)\b/i;
const HELP = /\b(tipp|rat|hilf|wie machst du|anfang|start)\b/i;
const NEGATIVE = /\b(dumm|blöd|bloed|hass|schlecht|langweilig|fake)\b/i;

/** Baut eine Antwort, die zum Gegenueber und zur Nachricht passt. */
function replyTo(rng: Rng, world: World, partner: Account, text: string): string {
  const niche = NICHES[partner.niche];
  const warm = partner.traits.sociability > 0.5;
  const close = closenessOf(world, partner.id);
  const user = world.accounts[world.user.accountId];
  const followers = followerCount(user);

  if (NEGATIVE.test(text)) {
    return pick(rng, [
      'Okay, das sitzt. Ich lasse das mal so stehen.',
      'Schade, dass du das so siehst.',
      'Muss ich nicht verstehen, ist aber dein gutes Recht.',
    ]);
  }

  if (COLLAB.test(text)) {
    const mine = followerCount(partner);
    if (mine > followers * 12 && close < 0.5) {
      return pick(rng, [
        'Klingt spannend, aber mein Kalender ist gerade dicht. Frag mich in ein paar Wochen nochmal?',
        'Aktuell schaffe ich keine neuen Projekte. Bleib trotzdem dran!',
      ]);
    }
    return pick(rng, [
      `Sehr gerne! ${niche.label} zusammen waere stark. Was schwebt dir vor?`,
      'Ich bin dabei. Sag mir einfach Termin und Ort.',
      'Ja! Lass uns das machen, bevor wir es wieder aufschieben.',
    ]);
  }

  if (MEET.test(text)) {
    return warm
      ? pick(rng, ['Kaffee geht immer. Diese Woche noch?', 'Sehr gerne - ich schicke dir zwei Termine.', 'Ja, lass uns das machen!'])
      : pick(rng, ['Vielleicht, ich melde mich, wenn es ruhiger wird.', 'Puh, gerade schwierig. Aber danke fuer die Einladung!']);
  }

  if (HELP.test(text)) {
    const topic = pick(rng, niche.topics);
    return pick(rng, [
      `Mein ehrlicher Tipp: bleib bei einem Thema. Bei mir war es "${topic.label}", bis es lief.`,
      'Poste regelmaessig und antworte auf jeden Kommentar. Das klingt banal, ist aber der ganze Trick.',
      `Schau dir an, welcher deiner Beitraege am meisten gespeichert wurde, und mach mehr davon. ${niche.emoji}`,
    ]);
  }

  if (COMPLIMENT.test(text)) {
    return pick(rng, [
      'Das freut mich wirklich, danke dir! ❤️',
      'Sehr lieb von dir. Deine Sachen mag ich auch.',
      `Danke! Ich schaue mir gleich deinen Feed an - ${formatShort(followers)} Follower, Respekt.`,
    ]);
  }

  if (QUESTION.test(text)) {
    return pick(rng, [
      'Gute Frage. Kurz gesagt: ausprobieren, was dir liegt, und dann dabei bleiben.',
      `Bei mir ist es ${pick(rng, niche.topics).label} - das laeuft am besten.`,
      'Kommt drauf an, ehrlich gesagt. Was genau meinst du?',
      'Ich mache das seit Jahren so und wuerde es nicht mehr anders machen.',
    ]);
  }

  if (GREETING.test(text)) {
    return close > 0.4
      ? pick(rng, ['Hey du! Wie laeuft es?', 'Hallo! Schoen, von dir zu hoeren.', `Hi! ${niche.emoji} Alles gut bei dir?`])
      : pick(rng, ['Hi! Danke fuer die Nachricht.', 'Hallo! Schreib gern, was du brauchst.', 'Hey!']);
  }

  // Allgemeine Antwort, die zum Charakter passt.
  const general = warm
    ? [
        'Verstehe ich total. Bei mir war das aehnlich.',
        `Das passt gut zu dem, was ich gerade ueber ${niche.label} mache.`,
        'Schoen, dass du schreibst - erzaehl mehr!',
        'Ha, den Punkt kenne ich zu gut.',
      ]
    : [
        'Alles klar.',
        'Okay, notiert.',
        'Verstehe.',
        'Danke fuer die Nachricht.',
      ];
  return pick(rng, general);
}

/** Notiz ueber ein gefuehrtes oder verpasstes Gespraech. */
export function logCall(world: World, accountId: string, seconds: number, missed: boolean, video: boolean) {
  const threadId = openChat(world, accountId);
  const thread = world.threads[threadId];
  if (!thread) return;
  thread.messages.push({
    id: `m${world.counter++}`,
    fromId: accountId,
    text: missed ? 'Verpasster Anruf' : `Anruf beendet · ${formatDuration(seconds)}`,
    at: world.time,
    fromUser: false,
    call: { seconds, missed, video },
  });
  thread.lastAt = world.time;
  if (!missed && seconds > 20) {
    raiseCloseness(world, accountId, 0.12);
    addLog(world, 'social', `Telefonat mit @${world.accounts[accountId]?.handle ?? '?'} (${formatDuration(seconds)}).`);
  }
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
