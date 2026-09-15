import { aiReady, ask, parseJsonArray } from './ai';
import { describeCharacter } from './persona';
import { NICHES, getTopic } from './niches';
import { followerCount } from './scoring';
import { formatShort } from './content';
import type { Comment, Post, World } from './types';

/**
 * Laesst die echte KI Bildunterschriften und Kommentare schreiben.
 *
 * Alles laeuft gebuendelt und erst dann, wenn ein Beitrag tatsaechlich
 * angezeigt wird - sonst wuerden fuer hunderte nie gesehene Beitraege
 * Anfragen anfallen. Bis die Antwort da ist, steht der eingebaute Text;
 * danach wird er ersetzt und dauerhaft gespeichert.
 */

/** Wie viele Beitraege pro Anfrage. */
const CAPTION_BATCH = 6;
const COMMENT_BATCH = 5;

const busyCaptions = new Set<string>();
const busyComments = new Set<string>();

type Notify = () => void;

/** Bildunterschriften fuer die gerade sichtbaren Beitraege nachziehen. */
export function ensureCaptions(world: World, posts: Post[], notify: Notify) {
  if (!aiReady()) return;

  const targets = posts
    .filter((p) => !p.byUser && !p.captionAi && !busyCaptions.has(p.id))
    .slice(0, CAPTION_BATCH);
  if (targets.length === 0) return;

  for (const post of targets) busyCaptions.add(post.id);

  const entries = targets.map((post, index) => {
    const author = world.accounts[post.authorId];
    const topic = getTopic(post.niche, post.topic);
    return [
      `${index + 1}. ${author?.name ?? 'Jemand'} (@${author?.handle ?? '?'}), ${NICHES[post.niche].label}, ${formatShort(followerCount(author ?? ({} as never)) || 0)} Follower`,
      `   Profil: "${author?.bio ?? ''}"`,
      `   Wesen: ${author ? describeCharacter(author) : 'normal'}`,
      `   Motiv des Fotos: ${topic.label}`,
      post.mediaTitle ? `   Auf dem Bild zu sehen: ${post.mediaTitle}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  });

  const system = [
    'Du schreibst Bildunterschriften fuer verschiedene Menschen in einer Foto-App.',
    'Jede Unterschrift muss klingen, als haette genau diese Person sie geschrieben - anderer Ton, andere Laenge, andere Eigenheiten.',
    'Deutsch, 1 bis 3 Saetze, hoechstens 200 Zeichen, keine Hashtags, keine Anfuehrungszeichen.',
    'Konkrete kleine Alltagsdetails statt Werbesprache. Manche stellen eine Frage, manche nicht. Emojis nur sparsam und nur, wenn es zur Person passt.',
    `Antworte ausschliesslich mit einem JSON-Array aus genau ${targets.length} Zeichenketten, in derselben Reihenfolge.`,
  ].join('\n');

  void ask({
    system,
    messages: [{ role: 'user', content: `Schreib je eine Bildunterschrift fuer:\n\n${entries.join('\n\n')}` }],
    maxTokens: 700,
    effort: 'low',
  })
    .then((answer) => {
      const list = parseJsonArray(answer);
      if (!list) return;
      let changed = false;
      targets.forEach((post, index) => {
        const value = list[index];
        if (typeof value === 'string' && value.trim()) {
          post.caption = value.trim().slice(0, 300);
          post.captionAi = true;
          changed = true;
        }
      });
      if (changed) notify();
    })
    .finally(() => {
      for (const post of targets) busyCaptions.delete(post.id);
    });
}

/** Kommentare unter einem Beitrag von der KI schreiben lassen. */
export function ensureComments(world: World, post: Post, notify: Notify) {
  if (!aiReady()) return;

  const targets = post.commentList
    .filter((c) => !c.ai && !busyComments.has(c.id) && c.authorId !== world.user.accountId)
    .slice(-COMMENT_BATCH);
  if (targets.length === 0) return;

  for (const comment of targets) busyComments.add(comment.id);

  const author = world.accounts[post.authorId];
  const topic = getTopic(post.niche, post.topic);
  const people = targets.map((comment, index) => {
    const account = world.accounts[comment.authorId];
    return `${index + 1}. ${account?.name ?? 'Jemand'} (@${account?.handle ?? '?'}), ${account ? NICHES[account.niche].label : ''}, Wesen: ${
      account ? describeCharacter(account) : 'normal'
    }`;
  });

  const system = [
    'Du schreibst Kommentare unter einen Beitrag in einer Foto-App.',
    'Jeder Kommentar stammt von einer anderen Person und muss auch so klingen: unterschiedliche Laenge, Rechtschreibung, Begeisterung.',
    'Geh auf das ein, was tatsaechlich zu sehen ist - nicht allgemein, sondern konkret zum Bild.',
    'Deutsch, meist 3 bis 12 Woerter. Manche stellen eine Frage, manche loben knapp, manche sind gleichgueltig oder kritisch.',
    'Kein Kommentar darf wie Werbung klingen. Keine Anfuehrungszeichen.',
    `Antworte ausschliesslich mit einem JSON-Array aus genau ${targets.length} Zeichenketten, in derselben Reihenfolge der Personen.`,
  ].join('\n');

  const context = [
    `Beitrag von ${author?.name ?? 'jemandem'} (@${author?.handle ?? '?'})`,
    `Thema: ${NICHES[post.niche].label}, Motiv: ${topic.label}`,
    post.mediaTitle ? `Auf dem Bild zu sehen: ${post.mediaTitle}` : '',
    post.caption ? `Bildunterschrift: "${post.caption}"` : '',
    '',
    'Diese Personen kommentieren:',
    ...people,
  ]
    .filter(Boolean)
    .join('\n');

  void ask({ system, messages: [{ role: 'user', content: context }], maxTokens: 400, effort: 'low' })
    .then((answer) => {
      const list = parseJsonArray(answer);
      if (!list) return;
      let changed = false;
      targets.forEach((comment, index) => {
        const value = list[index];
        if (typeof value === 'string' && value.trim()) {
          comment.text = value.trim().slice(0, 200);
          comment.ai = true;
          changed = true;
        }
      });
      if (changed) notify();
    })
    .finally(() => {
      for (const comment of targets) busyComments.delete(comment.id);
    });
}

/** Antwort eines Accounts auf einen Kommentar des Nutzers. */
export async function replyToUserComment(world: World, post: Post, userText: string): Promise<string | null> {
  if (!aiReady()) return null;
  const author = world.accounts[post.authorId];
  if (!author || author.isUser) return null;
  const topic = getTopic(post.niche, post.topic);

  return ask({
    system: [
      `Du bist ${author.name} (@${author.handle}) und hast gerade einen Beitrag ueber ${NICHES[post.niche].label} gepostet (Motiv: ${topic.label}).`,
      post.mediaTitle ? `Auf deinem Bild ist zu sehen: ${post.mediaTitle}.` : '',
      `Dein Wesen: ${describeCharacter(author)}.`,
      'Jemand hat deinen Beitrag kommentiert. Antworte kurz und persoenlich auf Deutsch, hoechstens zwei Saetze, ohne Anfuehrungszeichen.',
    ]
      .filter(Boolean)
      .join('\n'),
    messages: [{ role: 'user', content: userText }],
    maxTokens: 150,
  });
}

/** Merkt vor, dass ein Kommentar schon von der KI stammt (fuer Tests/Import). */
export function markAiComment(comment: Comment) {
  comment.ai = true;
}
