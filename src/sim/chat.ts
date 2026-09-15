import { ask } from './ai';
import { chatSystemPrompt } from './persona';
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

  // Zwischen zwei und zehn Sekunden - lang genug, um echt zu wirken.
  thread.replyAtReal = Date.now() + randInt(rng, 2000, 9000) + Math.round(reach * 6000);
  thread.pendingReply = undefined;
  thread.aiWaitUntil = Date.now() + 30000;

  // Zuerst die echte KI fragen. Klappt das nicht, schreiben die Bausteine.
  const fallback = () => replyTo(rng, world, partner, clean);
  void askPartner(world, thread.id, partner.id).then((answer) => {
    const current = world.threads[thread.id];
    if (!current || current.pendingReply) return;
    current.pendingReply = answer ?? fallback();
  });
}

/** Fragt die echte KI nach einer Antwort in der Rolle des Accounts. */
async function askPartner(world: World, threadId: string, accountId: string): Promise<string | null> {
  const thread = world.threads[threadId];
  const partner = world.accounts[accountId];
  if (!thread || !partner) return null;

  const history = thread.messages
    .filter((m) => !m.call)
    .slice(-12)
    .map((m) => ({ role: (m.fromUser ? 'user' : 'assistant') as 'user' | 'assistant', content: m.text }));
  if (history.length === 0 || history[0].role !== 'user') {
    history.unshift({ role: 'user', content: 'Hey!' });
  }

  const answer = await ask({
    system: chatSystemPrompt(world, partner),
    messages: history,
    maxTokens: 300,
  });
  return answer ? answer.replace(/^["„]|["“]$/g, '').trim().slice(0, 500) : null;
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
    if (!thread?.replyAtReal) continue;
    if (now < thread.replyAtReal) continue;
    if (!thread.pendingReply) {
      // Die KI antwortet nicht mehr - Gespraech nicht haengen lassen.
      if (thread.aiWaitUntil && now > thread.aiWaitUntil) {
        thread.replyAtReal = undefined;
        thread.aiWaitUntil = undefined;
        changed = true;
      }
      continue;
    }

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
    thread.aiWaitUntil = undefined;
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
const NAME_Q = /\b(wie heisst du|wie heißt du|dein name|wer bist du|name\?)/i;
const AGE_Q = /\b(wie alt|dein alter|geburtstag)\b/i;
const PLACE_Q = /\b(woher|wo wohnst|wo lebst|welche stadt|wo bist du)\b/i;
const JOB_Q = /\b(was machst du|beruf|arbeitest du|job|studierst)\b/i;
const MOOD_Q = /\b(wie geht|alles gut|wie laeuft|wie läuft)\b/i;
const NEGATIVE = /\b(dumm|blöd|bloed|hass|schlecht|langweilig|fake)\b/i;

/** Baut eine Antwort, die zum Gegenueber und zur Nachricht passt. */
function replyTo(rng: Rng, world: World, partner: Account, text: string): string {
  const niche = NICHES[partner.niche];
  const warm = partner.traits.sociability > 0.5;
  const close = closenessOf(world, partner.id);
  const user = world.accounts[world.user.accountId];
  const followers = followerCount(user);

  // Direkte Fragen zur Person zuerst - hier fiel frueher die Antwort daneben.
  if (NAME_Q.test(text)) {
    const first = partner.name.split(' ')[0];
    return pick(rng, [
      `Ich bin ${partner.name}. Und du?`,
      `${first} - aber die meisten kennen mich nur als @${partner.handle}.`,
      `${partner.name}. Freut mich!`,
    ]);
  }
  if (AGE_Q.test(text)) {
    const age = 19 + (Math.abs(partner.avatar.seed) % 22);
    return pick(rng, [`Ich bin ${age}. Wieso, wie alt haettest du geschaetzt?`, `${age} - fuehlt sich manchmal aelter an 😄`]);
  }
  if (PLACE_Q.test(text)) {
    const city = pick(rng, ['Berlin', 'Hamburg', 'Koeln', 'Leipzig', 'Muenchen', 'Wien', 'Zuerich', 'Stuttgart', 'Bremen']);
    return pick(rng, [`Ich wohne in ${city}. Und du?`, `${city}, seit ein paar Jahren schon.`]);
  }
  if (JOB_Q.test(text)) {
    return pick(rng, [
      `Hauptsaechlich ${niche.label} - das frisst inzwischen den ganzen Tag.`,
      `Nebenbei arbeite ich noch, aber ${niche.label} ist das, was mich wirklich interessiert.`,
    ]);
  }
  if (MOOD_Q.test(text)) {
    return pick(rng, ['Ganz gut soweit! Bei dir?', 'Viel zu tun, aber im guten Sinne. Und bei dir?', 'Heute eher durchwachsen, ehrlich gesagt.']);
  }

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

/**
 * Antwort waehrend eines Telefonats. Nutzt dieselbe Rolle wie der Chat,
 * aber im Ton eines gesprochenen Gespraechs.
 */
export async function askCallReply(
  world: World,
  accountId: string,
  history: { role: 'user' | 'assistant'; content: string }[],
): Promise<string | null> {
  const partner = world.accounts[accountId];
  if (!partner) return null;
  const messages = history.slice(-10);
  if (messages.length === 0 || messages[0].role !== 'user') {
    messages.unshift({ role: 'user', content: '(nimmt den Anruf an)' });
  }
  const answer = await ask({
    system: chatSystemPrompt(world, partner, true),
    messages,
    maxTokens: 200,
  });
  return answer ? answer.replace(/^["„]|["“]$/g, '').trim() : null;
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
