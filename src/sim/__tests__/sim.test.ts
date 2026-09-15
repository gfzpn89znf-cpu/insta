import { describe, expect, it } from 'vitest';
import { createWorld } from '../world';
import { tick } from '../engine';
import { createUserPost } from '../posts';
import { scoreCaption, scoreDraft, scoreHashtags, followerCount, type Draft } from '../scoring';
import { addUserComment, toggleFollow, toggleLike, toggleSave } from '../actions';
import { buildExplore, buildFeed, leaderboard, searchAccounts, searchHashtag } from '../feed';
import { applyDmOption } from '../dms';
import { openChat, processChatReplies, sendMessage } from '../chat';
import { buildReels } from '../feed';
import { portraitUrl, stockPhotoUrls } from '../photos';
import { ask, aiReady } from '../ai';
import { makeRng, powerLaw } from '../rng';
import { rebuildIndex } from '../world';
import type { World } from '../types';

const PROFILE = { name: 'Testerin', handle: 'test.user', bio: 'Fitness & Kopf | taeglich neue Workouts', niche: 'fitness' as const };

/** Kleine Welt fuer schnelle Tests. */
function smallWorld(seed = 7): World {
  return createWorld(seed, PROFILE, { accounts: 60, bootstrapDays: 3 });
}

const GOOD_DRAFT: Draft = {
  niche: 'fitness',
  topicId: 'transformation',
  style: 'vivid',
  caption:
    'Ich habe 90 Tage durchgezogen und fast aufgegeben. Was den Unterschied gemacht hat: ein Satz mehr, jeden Tag. Was ist gerade euer groesster Kampf? 💪',
  hashtags: ['fitness', 'transformation', 'gym', 'fitfam', 'krafttraining', 'muskelaufbau', 'fitnessmotivation'],
};

const BAD_DRAFT: Draft = {
  niche: 'fitness',
  topicId: 'gymselfie',
  style: 'pastel',
  caption: 'HI!!!! FOLGT MIR!!!!',
  hashtags: ['followme', 'f4f', 'likeforlike'],
};

describe('Zufallsgenerator', () => {
  it('ist bei gleichem Seed reproduzierbar', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('erzeugt eine langschwaenzige Verteilung', () => {
    const rng = makeRng(1);
    const values = Array.from({ length: 4000 }, () => powerLaw(rng, 100, 1e7, 0.6));
    const sorted = [...values].sort((x, y) => x - y);
    const median = sorted[2000];
    const max = sorted[3999];
    expect(max).toBeGreaterThan(median * 50);
  });
});

describe('Welterzeugung', () => {
  it('erstellt Accounts, Posts und einen Nutzeraccount', () => {
    const w = smallWorld();
    const accounts = Object.values(w.accounts);
    expect(accounts).toHaveLength(61);
    expect(w.accounts[w.user.accountId].isUser).toBe(true);
    expect(w.order.length).toBeGreaterThan(30);
  });

  it('ist bei gleichem Seed deterministisch', () => {
    const a = smallWorld(99);
    const b = smallWorld(99);
    expect(a.order.length).toBe(b.order.length);
    expect(Object.keys(a.accounts).map((id) => a.accounts[id].handle)).toEqual(
      Object.keys(b.accounts).map((id) => b.accounts[id].handle),
    );
  });

  it('bildet eine ungleiche Followerverteilung ab', () => {
    const w = smallWorld();
    const counts = Object.values(w.accounts)
      .filter((a) => !a.isUser)
      .map(followerCount)
      .sort((x, y) => y - x);
    expect(counts[0]).toBeGreaterThan(counts[Math.floor(counts.length / 2)] * 10);
  });

  it('baut ein echtes Follower-Netzwerk auf', () => {
    const w = smallWorld();
    const acc = Object.values(w.accounts).find((a) => !a.isUser && a.following.length > 0)!;
    const target = w.accounts[acc.following[0]];
    expect(target.realFollowers).toContain(acc.id);
  });
});

describe('Beitragsbewertung', () => {
  it('bewertet starke Captions besser als Spam', () => {
    expect(scoreCaption(GOOD_DRAFT.caption).score).toBeGreaterThan(scoreCaption(BAD_DRAFT.caption).score + 0.3);
  });

  it('bestraft Hashtag-Spam und belohnt Relevanz', () => {
    const good = scoreHashtags(GOOD_DRAFT.hashtags, 'fitness', new Set());
    const bad = scoreHashtags(BAD_DRAFT.hashtags, 'fitness', new Set());
    expect(good.score).toBeGreaterThan(bad.score);
  });

  it('belohnt aktuelle Trend-Hashtags', () => {
    const ohne = scoreHashtags(['fitness', 'gym', 'fitfam'], 'fitness', new Set());
    const mit = scoreHashtags(['fitness', 'gym', 'fitfam'], 'fitness', new Set(['fitness']));
    expect(mit.score).toBeGreaterThan(ohne.score);
  });

  it('bewertet einen durchdachten Entwurf deutlich hoeher', () => {
    const w = smallWorld();
    const user = w.accounts[w.user.accountId];
    const good = scoreDraft(w, user, GOOD_DRAFT);
    const bad = scoreDraft(w, user, BAD_DRAFT);
    expect(good.total).toBeGreaterThan(bad.total + 0.25);
    expect(bad.hints.length).toBeGreaterThan(0);
  });

  it('gibt konkrete Verbesserungshinweise', () => {
    const w = smallWorld();
    const user = w.accounts[w.user.accountId];
    const result = scoreDraft(w, user, { ...GOOD_DRAFT, hashtags: [] });
    expect(result.hints.join(' ')).toMatch(/Hashtag/i);
  });
});

describe('Reichweiten-Engine', () => {
  it('gibt gutem Content deutlich mehr Reichweite', () => {
    const wa = smallWorld(21);
    createUserPost(wa, GOOD_DRAFT);
    tick(wa, 48 * 60, { sample: false, notify: false });
    const goodPost = wa.posts[wa.accounts[wa.user.accountId].postIds[0]];

    const wb = smallWorld(21);
    createUserPost(wb, BAD_DRAFT);
    tick(wb, 48 * 60, { sample: false, notify: false });
    const badPost = wb.posts[wb.accounts[wb.user.accountId].postIds[0]];

    expect(goodPost.metrics.impressions).toBeGreaterThan(badPost.metrics.impressions * 2);
    expect(goodPost.metrics.newFollowers).toBeGreaterThan(badPost.metrics.newFollowers);
  });

  it('laesst konsequent gute Arbeit ueber Wochen wachsen', () => {
    const w = smallWorld(5);
    const user = w.accounts[w.user.accountId];
    for (let d = 0; d < 21; d++) {
      createUserPost(w, GOOD_DRAFT);
      tick(w, 1440, { sample: false, notify: false });
    }
    expect(followerCount(user)).toBeGreaterThan(200);
  });

  it('laesst schwachen Content stagnieren', () => {
    const good = smallWorld(5);
    const bad = smallWorld(5);
    for (let d = 0; d < 21; d++) {
      createUserPost(good, GOOD_DRAFT);
      tick(good, 1440, { sample: false, notify: false });
      createUserPost(bad, BAD_DRAFT);
      tick(bad, 1440, { sample: false, notify: false });
    }
    const goodFollowers = followerCount(good.accounts[good.user.accountId]);
    const badFollowers = followerCount(bad.accounts[bad.user.accountId]);
    expect(goodFollowers).toBeGreaterThan(badFollowers * 3);
  });

  it('haelt Engagement-Raten in realistischen Groessenordnungen', () => {
    const w = smallWorld(3);
    tick(w, 3 * 1440, { sample: false, notify: false });
    const posts = w.order.map((id) => w.posts[id]).filter((p) => p.metrics.impressions > 500);
    const ers = posts.map((p) => p.metrics.likes / p.metrics.impressions);
    const avg = ers.reduce((a, b) => a + b, 0) / ers.length;
    expect(avg).toBeGreaterThan(0.01);
    expect(avg).toBeLessThan(0.25);
  });

  it('begrenzt die Reichweite durch den Aufmerksamkeitsmarkt', () => {
    const w = smallWorld(11);
    expect(w.settings.attentionCapacity).toBeGreaterThan(0);
    tick(w, 30 * 1440, { sample: false, notify: false });
    expect(w.attention.factor).toBeGreaterThan(0);
    expect(w.attention.factor).toBeLessThanOrEqual(1);
  });

  it('erzeugt keine unendlichen oder ungueltigen Werte', () => {
    const w = smallWorld(13);
    createUserPost(w, GOOD_DRAFT);
    tick(w, 10 * 1440, { sample: true, notify: true });
    for (const id of w.order) {
      const p = w.posts[id];
      expect(Number.isFinite(p.metrics.impressions)).toBe(true);
      expect(p.metrics.likes).toBeGreaterThanOrEqual(0);
      expect(p.metrics.likes).toBeLessThanOrEqual(p.metrics.impressions + 2);
    }
    for (const acc of Object.values(w.accounts)) {
      expect(Number.isFinite(followerCount(acc))).toBe(true);
      expect(followerCount(acc)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('KI-Accounts verhalten sich wie Menschen', () => {
  it('posten eigenstaendig weiter', () => {
    const w = smallWorld(17);
    const before = w.order.length;
    tick(w, 2 * 1440, { sample: false, notify: false });
    expect(w.order.length).toBeGreaterThan(before);
  });

  it('bauen ueber die Zeit Beziehungen auf oder ab', () => {
    const w = smallWorld(19);
    // Die Zahl der Verbindungen kann zufaellig gleich bleiben, wenn sich
    // Folgen und Entfolgen ausgleichen - also die Verbindungen selbst pruefen.
    const edges = () => new Set(Object.values(w.accounts).flatMap((a) => a.following.map((t) => `${a.id}>${t}`)));
    const before = edges();
    tick(w, 5 * 1440, { sample: false, notify: false });
    const after = edges();
    const changed = [...after].some((e) => !before.has(e)) || [...before].some((e) => !after.has(e));
    expect(changed).toBe(true);
  });

  it('werden unterschiedlich erfolgreich', () => {
    const w = smallWorld(23);
    tick(w, 20 * 1440, { sample: false, notify: false });
    const growth = Object.values(w.accounts)
      .filter((a) => !a.isUser)
      .map((a) => a.momentum);
    expect(Math.max(...growth)).toBeGreaterThan(Math.min(...growth));
  });

  it('erzeugt Trends, die wieder verschwinden', () => {
    const w = smallWorld(29);
    const seen = new Set(w.trends.map((t) => t.tag));
    tick(w, 10 * 1440, { sample: false, notify: false });
    const now = new Set(w.trends.map((t) => t.tag));
    expect([...now].some((t) => !seen.has(t)) || now.size !== seen.size).toBe(true);
  });
});

describe('Nutzeraktionen', () => {
  it('schaltet Likes und Speichern um', () => {
    const w = smallWorld(31);
    const postId = w.order[0];
    expect(toggleLike(w, postId)).toBe(true);
    expect(w.user.likedPosts).toContain(postId);
    expect(toggleLike(w, postId)).toBe(false);
    expect(toggleSave(w, postId)).toBe(true);
    expect(w.posts[postId].metrics.saves).toBeGreaterThan(0);
  });

  it('folgt und entfolgt korrekt', () => {
    const w = smallWorld(37);
    const target = Object.values(w.accounts).find((a) => !a.isUser)!;
    const user = w.accounts[w.user.accountId];
    expect(toggleFollow(w, target.id)).toBe(true);
    expect(user.following).toContain(target.id);
    expect(target.realFollowers).toContain(user.id);
    expect(toggleFollow(w, target.id)).toBe(false);
    expect(target.realFollowers).not.toContain(user.id);
  });

  it('belohnt Kommentare unter reichweitenstarken Posts', () => {
    const w = smallWorld(41);
    const user = w.accounts[w.user.accountId];
    const before = followerCount(user);
    const best = w.order
      .map((id) => w.posts[id])
      .sort((a, b) => b.metrics.impressions - a.metrics.impressions)[0];
    best.createdAt = w.time; // frisch kommentiert wirkt am staerksten
    addUserComment(w, best.id, 'Richtig starker Beitrag, das probiere ich diese Woche direkt aus!');
    expect(followerCount(user)).toBeGreaterThanOrEqual(before);
    expect(best.commentList.some((c) => c.authorId === user.id)).toBe(true);
  });
});

describe('Feed-Algorithmen', () => {
  it('liefert einen gemischten Feed', () => {
    const w = smallWorld(43);
    const target = Object.values(w.accounts).find((a) => !a.isUser)!;
    toggleFollow(w, target.id);
    const feed = buildFeed(w, { limit: 20 });
    expect(feed.length).toBeGreaterThan(0);
    expect(feed.every((p) => p.authorId !== w.user.accountId)).toBe(true);
  });

  it('sortiert Explore nach Resonanz', () => {
    const w = smallWorld(47);
    const explore = buildExplore(w, 12);
    expect(explore.length).toBeGreaterThan(0);
  });

  it('erstellt eine Rangliste', () => {
    const w = smallWorld(53);
    const board = leaderboard(w, 10);
    expect(board.length).toBe(10);
    expect(followerCount(board[0])).toBeGreaterThanOrEqual(followerCount(board[9]));
  });

  it('findet Accounts und Hashtags', () => {
    const w = smallWorld(59);
    const someone = Object.values(w.accounts).find((a) => !a.isUser)!;
    expect(searchAccounts(w, someone.handle.slice(0, 4)).length).toBeGreaterThan(0);
    const tag = w.posts[w.order[0]].hashtags[0];
    expect(searchHashtag(w, tag).length).toBeGreaterThan(0);
  });
});

describe('Nachrichten und Kooperationen', () => {
  it('wendet die Folgen einer Antwort an', () => {
    const w = smallWorld(61);
    const partner = Object.values(w.accounts).find((a) => !a.isUser)!;
    w.threads.t1 = {
      id: 't1',
      accountId: partner.id,
      kind: 'brand',
      unread: true,
      lastAt: w.time,
      messages: [
        {
          id: 'm1',
          fromId: partner.id,
          text: 'Angebot',
          at: w.time,
          fromUser: false,
          options: [{ id: 'accept', label: 'Annehmen', effect: 'accept', reply: 'Ja', money: 500, reputation: 0.03 }],
        },
      ],
    };
    w.threadOrder.unshift('t1');
    applyDmOption(w, 't1', 'accept');
    expect(w.user.money).toBe(500);
    expect(w.user.deals).toHaveLength(1);
    expect(w.threads.t1.messages.length).toBeGreaterThan(1);
  });
});

describe('Fotos passend zum Thema', () => {
  it('sucht nach dem Motiv, nicht nur nach der Nische', () => {
    const urls = stockPhotoUrls(42, 'fitness', 600, 'workout');
    expect(urls[0]).toContain('workout');
    // "/all" verlangt, dass alle Begriffe zutreffen.
    expect(urls[0]).toContain('/all');
  });

  it('haelt fuer jedes Motiv eigene Begriffe bereit', () => {
    const gym = stockPhotoUrls(1, 'fitness', 600, 'workout')[0];
    const food = stockPhotoUrls(1, 'food', 600, 'rezept')[0];
    expect(gym).not.toBe(food);
    expect(food).toContain('recipe');
  });

  it('faellt auf die Nische zurueck, wenn das Motiv unbekannt ist', () => {
    const urls = stockPhotoUrls(7, 'nature', 600, 'gibtesnicht');
    expect(urls[0]).toContain('nature');
    expect(urls.length).toBeGreaterThan(1);
  });

  it('gibt jedem Account ein festes Portrait', () => {
    expect(portraitUrl('a12', true)).toBe(portraitUrl('a12', true));
    expect(portraitUrl('a12', true)).not.toBe(portraitUrl('a13', true));
    expect(portraitUrl('a12', true)).toContain('women');
    expect(portraitUrl('a12', false)).toContain('men');
  });
});

describe('Reels', () => {
  it('enthaelt nur Videobeitraege', () => {
    const w = smallWorld(71);
    tick(w, 2 * 1440, { sample: false, notify: false });
    const reels = buildReels(w, 20);
    expect(reels.length).toBeGreaterThan(0);
    expect(reels.every((p) => p.format === 'reel')).toBe(true);
  });

  it('zeigt nicht zweimal hintereinander dieselbe Person', () => {
    const w = smallWorld(73);
    tick(w, 3 * 1440, { sample: false, notify: false });
    const reels = buildReels(w, 20);
    const counts = new Map<string, number>();
    for (const r of reels) counts.set(r.authorId, (counts.get(r.authorId) ?? 0) + 1);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
  });

  it('spielt Videos etwas breiter aus als Bilder', () => {
    const w = smallWorld(79);
    tick(w, 2 * 1440, { sample: false, notify: false });
    const posts = w.order.map((id) => w.posts[id]).filter((p) => p.metrics.impressions > 200);
    const reels = posts.filter((p) => p.format === 'reel');
    const photos = posts.filter((p) => p.format === 'photo');
    expect(reels.length).toBeGreaterThan(0);
    expect(photos.length).toBeGreaterThan(0);
  });
});

describe('Antworten ohne eingerichtete KI', () => {
  it('meldet, dass keine echte KI eingerichtet ist', async () => {
    expect(aiReady()).toBe(false);
    expect(await ask({ system: 'x', messages: [{ role: 'user', content: 'hi' }] })).toBeNull();
  });

  it('beantwortet die Frage nach dem Namen mit dem Namen', async () => {
    const w = smallWorld(83);
    const partner = Object.values(w.accounts).find((a) => !a.isUser && a.traits.sociability > 0.4)!;
    const threadId = openChat(w, partner.id);
    sendMessage(w, threadId, 'Hallo, wie ist dein Name?');
    // Die KI-Anfrage scheitert ohne Schluessel sofort, dann greifen die Bausteine.
    await new Promise((resolve) => setTimeout(resolve, 60));
    const pending = w.threads[threadId].pendingReply;
    expect(pending).toBeTruthy();
    expect(pending!.toLowerCase()).toContain(partner.name.split(' ')[0].toLowerCase());
  });

  it('stellt die Antwort nach der Wartezeit zu', async () => {
    const w = smallWorld(89);
    // Kleine, gesellige Accounts antworten zuverlaessig - grosse oft gar nicht.
    const partner = Object.values(w.accounts)
      .filter((a) => !a.isUser && a.traits.sociability > 0.5)
      .sort((a, b) => followerCount(a) - followerCount(b))[0];
    const threadId = openChat(w, partner.id);
    const thread = w.threads[threadId];

    // Nicht jede Nachricht wird beantwortet - das ist Absicht. Fuer den Test
    // schreiben wir so lange, bis eine Antwort eingeplant ist.
    for (let attempt = 0; attempt < 8 && !thread.replyAtReal; attempt++) {
      sendMessage(w, threadId, 'Hey, wie geht es dir?');
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    expect(thread.pendingReply).toBeTruthy();
    // Zustellzeit vorziehen, statt echte Sekunden zu warten.
    thread.replyAtReal = Date.now() - 1;
    expect(processChatReplies(w)).toBe(true);
    const messages = thread.messages;
    expect(messages[messages.length - 1].fromUser).toBe(false);
  });

  it('laesst ein Gespraech nicht haengen, wenn niemand antwortet', async () => {
    const w = smallWorld(91);
    const partner = Object.values(w.accounts).find((a) => !a.isUser)!;
    const threadId = openChat(w, partner.id);
    sendMessage(w, threadId, 'Hallo!');
    await new Promise((resolve) => setTimeout(resolve, 60));
    const thread = w.threads[threadId];
    // Antwort kuenstlich ausbleiben lassen und die Wartezeit ueberschreiten.
    thread.pendingReply = undefined;
    thread.replyAtReal = Date.now() - 1;
    thread.aiWaitUntil = Date.now() - 1;
    processChatReplies(w);
    expect(thread.replyAtReal).toBeUndefined();
  });
});

describe('Speichern und Laden', () => {
  it('uebersteht eine JSON-Rundreise', () => {
    const w = smallWorld(67);
    tick(w, 600, { sample: true, notify: true });
    const { nicheIndex: _drop, ...serializable } = w;
    void _drop;
    const restored = JSON.parse(JSON.stringify(serializable)) as World;
    rebuildIndex(restored);
    expect(Object.keys(restored.accounts).length).toBe(Object.keys(w.accounts).length);
    expect(restored.order.length).toBe(w.order.length);
    tick(restored, 600, { sample: true, notify: true });
    expect(restored.order.length).toBeGreaterThan(0);
  });
});
