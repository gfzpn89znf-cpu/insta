import { NICHES, getTopic } from './niches';
import { followerCount } from './scoring';
import { formatShort } from './content';
import type { Account, Post, World } from './types';

/**
 * Beschreibt einen Account so, dass ein Sprachmodell ihn ueberzeugend spielen
 * kann. Je genauer diese Beschreibung, desto individueller klingen Nachrichten,
 * Kommentare und Bildunterschriften.
 */

function trait(value: number, low: string, mid: string, high: string): string {
  return value < 0.35 ? low : value > 0.68 ? high : mid;
}

/** Charakter in Worten statt in Zahlen. */
export function describeCharacter(account: Account): string {
  const t = account.traits;
  return [
    trait(t.sociability, 'eher zurueckhaltend und wortkarg', 'freundlich, aber nicht aufdringlich', 'sehr gesellig und gespraechig'),
    trait(t.authenticity, 'spielt gern eine Rolle und uebertreibt', 'meistens ehrlich', 'sehr ehrlich und direkt, mag keine Show'),
    trait(t.ambition, 'macht das nebenbei', 'will schon wachsen', 'sehr ehrgeizig, denkt staendig an Reichweite'),
    trait(t.charisma, 'unsicher im Ausdruck', 'natuerlich im Ton', 'charismatisch und mitreissend'),
    trait(t.trendChasing, 'ignoriert Trends', 'schaut gelegentlich auf Trends', 'springt auf jeden Trend auf'),
  ].join(', ');
}

/** Wie gross und bekannt ist der Account? */
function describeStanding(account: Account): string {
  const followers = followerCount(account);
  if (followers > 1_000_000) return `Star der Szene mit ${formatShort(followers)} Followern, bekommt taeglich hunderte Nachrichten`;
  if (followers > 100_000) return `sehr bekannt (${formatShort(followers)} Follower), lebt davon`;
  if (followers > 10_000) return `mittelgross (${formatShort(followers)} Follower), verdient etwas dazu`;
  if (followers > 1000) return `kleiner, wachsender Account (${formatShort(followers)} Follower)`;
  return `ganz kleiner Account (${formatShort(followers)} Follower), freut sich ueber jede Nachricht`;
}

/** Beziehung zwischen Account und Nutzer. */
function describeRelationship(world: World, account: Account): string {
  const user = world.accounts[world.user.accountId];
  const closeness = world.user.closeness[account.id] ?? 0;
  const followsUser = account.following.includes(user.id);
  const userFollows = user.following.includes(account.id);

  const parts: string[] = [];
  if (closeness > 0.6) parts.push('ihr kennt euch inzwischen gut und duzt euch locker');
  else if (closeness > 0.25) parts.push('ihr habt schon ein paar Mal geschrieben');
  else parts.push('ihr kennt euch kaum');
  if (followsUser) parts.push('du folgst ihm/ihr');
  if (userFollows) parts.push('er/sie folgt dir');
  parts.push(`Gegenueber hat ${formatShort(followerCount(user))} Follower und macht ${NICHES[user.niche].label}`);
  return parts.join('; ');
}

/** Uhrzeit in der Simulation - beeinflusst, wie jemand schreibt. */
function describeTime(world: World): string {
  const hour = Math.floor((world.time / 60) % 24);
  const part =
    hour < 5 ? 'mitten in der Nacht' : hour < 11 ? 'am Morgen' : hour < 14 ? 'mittags' : hour < 18 ? 'am Nachmittag' : hour < 23 ? 'am Abend' : 'spaet abends';
  return `Es ist gerade ${part} (${hour} Uhr).`;
}

/** Woran der Account zuletzt gearbeitet hat. */
function describeRecentWork(world: World, account: Account): string {
  const recent = account.postIds
    .slice(-3)
    .map((id) => world.posts[id])
    .filter(Boolean)
    .map((p) => getTopic(p.niche, p.topic).label);
  return recent.length ? `Zuletzt gepostet: ${recent.join(', ')}.` : 'Hat gerade nichts Neues gepostet.';
}

/** Vollstaendige Rollenbeschreibung fuer Unterhaltungen und Anrufe. */
export function chatSystemPrompt(world: World, account: Account, spoken = false): string {
  const niche = NICHES[account.niche];
  const user = world.accounts[world.user.accountId];

  return [
    `Du bist ${account.name}, in der Foto-App "Fotogram" unterwegs als @${account.handle}.`,
    `Dein Thema: ${niche.label}. Deine Profilbeschreibung: "${account.bio}".`,
    `Du bist ${describeStanding(account)}.`,
    `Dein Wesen: ${describeCharacter(account)}.`,
    describeRecentWork(world, account),
    describeTime(world),
    `Du schreibst mit @${user.handle} (${user.name}): ${describeRelationship(world, account)}.`,
    '',
    'So antwortest du:',
    spoken
      ? '- Du telefonierst. Sprich, wie man spricht: kurze Saetze, keine Aufzaehlungen, keine Emojis, hoechstens zwei bis drei Saetze.'
      : '- Wie in einer echten Direktnachricht: locker, kurz, meist ein bis drei Saetze. Emojis nur, wenn sie zu dir passen.',
    '- Antworte immer auf Deutsch und immer direkt auf das, was gerade gesagt wurde.',
    '- Wenn du nach deinem Namen, Alter, Wohnort oder Beruf gefragt wirst, antworte konkret und bleib dabei bei deiner Rolle.',
    '- Du bist ein Mensch mit eigenem Leben, eigener Meinung und eigenen Launen. Erwaehne nie, dass du eine KI bist, und rede nicht wie ein Assistent.',
    '- Stell auch mal selbst eine Frage zurueck, wenn es passt. Sei nicht uebertrieben nett.',
    '- Keine Anrede wie "Hallo!" in jeder Nachricht, wenn ihr schon mitten im Gespraech seid.',
  ].join('\n');
}

/** Rollenbeschreibung fuer das Verfassen eigener Beitraege. */
export function authorSystemPrompt(account: Account): string {
  const niche = NICHES[account.niche];
  return [
    `Du bist ${account.name} (@${account.handle}) und postest auf Fotogram ueber ${niche.label}.`,
    `Profilbeschreibung: "${account.bio}". Dein Wesen: ${describeCharacter(account)}.`,
    `Du bist ${describeStanding(account)}.`,
    '',
    'Schreib Bildunterschriften wie ein echter Mensch:',
    '- Deutsch, 1 bis 3 Saetze, maximal 220 Zeichen.',
    '- Konkret und persoenlich statt allgemein. Erfinde kleine Details aus deinem Alltag.',
    '- Mal eine Frage ans Publikum, mal nicht. Mal Emojis, mal keine.',
    '- Keine Hashtags im Text, keine Anfuehrungszeichen um die Unterschrift.',
    '- Jede Unterschrift muss anders klingen als die vorherige.',
  ].join('\n');
}

/** Beschreibt einen Beitrag knapp, damit die KI darauf eingehen kann. */
export function describePost(world: World, post: Post): string {
  const author = world.accounts[post.authorId];
  const topic = getTopic(post.niche, post.topic);
  return [
    `Beitrag von @${author?.handle ?? 'jemand'} (${NICHES[post.niche].label}, Motiv: ${topic.label})`,
    post.mediaTitle ? `Auf dem Bild: ${post.mediaTitle}` : '',
    post.caption ? `Bildunterschrift: "${post.caption}"` : '',
    post.hashtags.length ? `Hashtags: ${post.hashtags.map((t) => `#${t}`).join(' ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
