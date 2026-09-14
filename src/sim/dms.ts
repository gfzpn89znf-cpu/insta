import { BRANDS, formatShort } from './content';
import { NICHES } from './niches';
import { chance, clamp, pick, randInt, rngFrom, type Rng } from './rng';
import { followerCount } from './scoring';
import { pushNotification, addLog } from './engine';
import type { Account, DmKind, DmOption, DmThread, World } from './types';

/**
 * Nachrichten entstehen abhaengig von der Reichweite des Nutzers:
 * erst Fans, dann Marken, dann Agenturen - und irgendwann auch Hater.
 */
export function processDms(world: World, dt: number, notify: boolean) {
  const user = world.accounts[world.user.accountId];
  const followers = followerCount(user);
  if (followers < 120) return;

  const rng = rngFrom(world.seed, 'dm', Math.floor(world.time / 30));
  const perDay = dt / 1440;

  const kinds: { kind: DmKind; min: number; rate: number }[] = [
    { kind: 'fan', min: 200, rate: 0.5 },
    { kind: 'brand', min: 1800, rate: 0.35 },
    { kind: 'collab', min: 4000, rate: 0.3 },
    { kind: 'hater', min: 25000, rate: 0.25 },
    { kind: 'agency', min: 150000, rate: 0.12 },
  ];

  for (const k of kinds) {
    if (followers < k.min) continue;
    // Groessere Reichweite zieht mehr Anfragen an, aber mit abnehmendem Zuwachs.
    const scale = clamp(Math.log10(followers / k.min + 1) * 1.4, 0.2, 3);
    if (chance(rng, k.rate * scale * perDay)) {
      createThread(world, user, k.kind, rng, notify);
    }
  }
}

function createThread(world: World, user: Account, kind: DmKind, rng: Rng, notify: boolean) {
  const followers = followerCount(user);
  const pool = world.nicheIndex?.[user.niche] ?? Object.keys(world.accounts);
  const partnerId = pick(rng, pool);
  const partner = world.accounts[partnerId];
  if (!partner || partner.isUser) return;

  const id = `t${world.counter++}`;
  let text = '';
  let options: DmOption[] | undefined;

  switch (kind) {
    case 'fan': {
      text = pick(rng, [
        `Hey! Ich verfolge deinen Account seit ${formatShort(Math.max(50, followers * 0.4))} Followern. Danke fuer den Content ❤️`,
        'Dein letzter Post hat mir echt geholfen. Danke dafuer!',
        'Ich zeige deine Posts staendig meinen Freunden. Mach weiter so!',
      ]);
      options = [
        { id: 'a', label: 'Herzlich antworten', effect: 'accept', reply: 'Vielen Dank, das bedeutet mir wirklich viel!', reputation: 0.01, followers: randInt(rng, 1, 12) },
        { id: 'b', label: 'Kurz danken', effect: 'neutral', reply: 'Danke dir! 🙏' },
      ];
      break;
    }
    case 'brand': {
      const brand = pick(rng, BRANDS);
      // Marken zahlen grob pro tausend Follower - Ruf und Nische beeinflussen den Preis.
      const cpm = 12 + world.user.reputation * 20 + NICHES[user.niche].competition * 8;
      const amount = Math.round((followers / 1000) * cpm * (0.6 + rng() * 0.9));
      text = `Hallo ${user.name}, hier ist ${brand}. Wir moechten eine Kooperation: ein Feed-Post mit unserem Produkt. Unser Angebot: ${amount} Euro.`;
      options = [
        {
          id: 'accept',
          label: `Annehmen (${amount} €)`,
          effect: 'accept',
          reply: 'Klingt gut, ich mache das!',
          money: amount,
          // Werbung kostet Glaubwuerdigkeit und ein paar Follower.
          followers: -Math.round(followers * (0.004 + rng() * 0.01)),
          reputation: 0.03,
        },
        {
          id: 'negotiate',
          label: 'Nachverhandeln',
          effect: 'neutral',
          reply: 'Danke fuer die Anfrage. Bei meiner Reichweite liegt mein Satz hoeher.',
          money: chance(rng, 0.45 + world.user.reputation * 0.3) ? Math.round(amount * 1.6) : 0,
          followers: -Math.round(followers * 0.003),
          reputation: 0.01,
        },
        { id: 'decline', label: 'Ablehnen', effect: 'decline', reply: 'Danke, aber das passt nicht zu meinem Account.', reputation: 0.02, followers: randInt(rng, 0, 30) },
      ];
      break;
    }
    case 'collab': {
      text = `Hi! Ich bin ${partner.name} (${formatShort(followerCount(partner))} Follower). Wollen wir zusammen etwas zu ${NICHES[partner.niche].label} machen?`;
      options = [
        {
          id: 'accept',
          label: 'Kollaboration zusagen',
          effect: 'accept',
          reply: 'Sehr gerne! Lass uns das planen.',
          followers: Math.round(followerCount(partner) * (0.004 + rng() * 0.012)),
          reputation: 0.02,
        },
        { id: 'decline', label: 'Freundlich absagen', effect: 'decline', reply: 'Danke fuer die Anfrage, aktuell schaffe ich das zeitlich nicht.' },
      ];
      break;
    }
    case 'hater': {
      text = pick(rng, [
        'Dein Content ist doch nur abgeschrieben. Jeder sieht das.',
        'Reichweite gekauft, oder? Anders kann ich mir das nicht erklaeren.',
        'Frueher warst du ehrlich. Jetzt ist es nur noch Werbung.',
      ]);
      options = [
        { id: 'ignore', label: 'Ignorieren & blockieren', effect: 'neutral', reply: '', reputation: 0.005 },
        { id: 'answer', label: 'Sachlich antworten', effect: 'neutral', reply: 'Schade, dass du das so siehst. Alles hier ist selbst gemacht.', reputation: 0.01, followers: randInt(rng, -5, 20) },
        { id: 'fight', label: 'Zurueckschiessen', effect: 'decline', reply: 'Dann folg mir doch einfach nicht mehr.', reputation: -0.05, followers: -randInt(rng, 5, 80) },
      ];
      break;
    }
    case 'agency': {
      const retainer = Math.round((followers / 1000) * 35);
      text = `Guten Tag, wir sind eine Creator-Agentur und wuerden Sie gerne vertreten. Wir garantieren Anfragen ab ${formatShort(retainer)} Euro pro Monat.`;
      options = [
        { id: 'accept', label: 'Vertrag unterschreiben', effect: 'accept', reply: 'Einverstanden, schicken Sie mir die Unterlagen.', money: retainer * 3, reputation: 0.05 },
        { id: 'decline', label: 'Unabhaengig bleiben', effect: 'decline', reply: 'Danke, ich mache das weiter selbst.', reputation: 0.03, followers: randInt(rng, 10, 200) },
      ];
      break;
    }
    default:
      text = 'Hallo!';
  }

  const thread: DmThread = {
    id,
    accountId: partner.id,
    kind,
    unread: true,
    lastAt: world.time,
    messages: [{ id: `m${world.counter++}`, fromId: partner.id, text, at: world.time, fromUser: false, options }],
  };
  world.threads[id] = thread;
  world.threadOrder.unshift(id);
  if (world.threadOrder.length > 60) {
    const removed = world.threadOrder.pop();
    if (removed) delete world.threads[removed];
  }
  if (notify) {
    pushNotification(world, { kind: 'system', actorId: partner.id, text: 'hat dir eine Nachricht geschickt.' });
  }
}

/** Wendet die Antwort des Nutzers an - mit allen Konsequenzen. */
export function applyDmOption(world: World, threadId: string, optionId: string) {
  const thread = world.threads[threadId];
  if (!thread) return;
  const last = thread.messages[thread.messages.length - 1];
  const option = last?.options?.find((o) => o.id === optionId);
  if (!option || last.optionTaken) return;

  last.optionTaken = optionId;
  const user = world.accounts[world.user.accountId];

  if (option.reply) {
    thread.messages.push({
      id: `m${world.counter++}`,
      fromId: user.id,
      text: option.reply,
      at: world.time,
      fromUser: true,
    });
  }

  if (option.money) {
    world.user.money += option.money;
    world.user.deals.push({
      id: `d${world.counter++}`,
      brand: world.accounts[thread.accountId]?.name ?? 'Marke',
      amount: option.money,
      at: world.time,
      accepted: true,
    });
    addLog(world, 'social', `Kooperation abgeschlossen: +${option.money} Euro.`);
  }
  if (option.reputation) {
    world.user.reputation = clamp(world.user.reputation + option.reputation, 0, 1);
  }
  if (option.followers) {
    if (option.followers > 0) user.crowdFollowers += option.followers;
    else user.crowdFollowers = Math.max(0, user.crowdFollowers + option.followers);
  }

  // Gegenreaktion des Absenders.
  const answer = followUpText(thread.kind, option);
  if (answer) {
    thread.messages.push({
      id: `m${world.counter++}`,
      fromId: thread.accountId,
      text: answer,
      at: world.time + 5,
      fromUser: false,
    });
  }
  thread.lastAt = world.time;
  thread.unread = false;
}

function followUpText(kind: DmKind, option: DmOption): string {
  if (kind === 'brand') {
    if (option.id === 'accept') return 'Perfekt! Wir schicken dir das Produkt und den Briefing-Link.';
    if (option.id === 'negotiate') return option.money ? 'Okay, wir gehen mit. Deal!' : 'Das sprengt leider unser Budget. Vielleicht beim naechsten Mal.';
    return 'Schade, aber wir respektieren das. Melden uns spaeter nochmal.';
  }
  if (kind === 'collab') {
    return option.effect === 'accept' ? 'Mega! Ich schreibe dir wegen der Termine.' : 'Alles gut, melde dich, wenn du Zeit hast.';
  }
  if (kind === 'agency') {
    return option.effect === 'accept' ? 'Willkommen an Bord. Erste Anfragen kommen diese Woche.' : 'Verstehe. Die Tuer bleibt offen.';
  }
  if (kind === 'hater') {
    return option.id === 'fight' ? 'Genau das mache ich. Viel Spass mit deinen gekauften Fans.' : '';
  }
  return 'Danke fuer die Antwort! ❤️';
}
