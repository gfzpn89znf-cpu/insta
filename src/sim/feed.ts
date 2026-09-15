import { ACTIVE_WINDOW } from './engine';
import { clamp } from './rng';
import type { Account, Post, World } from './types';

export interface FeedOptions {
  limit?: number;
  /** Anteil algorithmischer Empfehlungen im Feed (0..1). */
  discovery?: number;
}

/**
 * Der Feed mischt - wie echte Plattformen - Beitraege abonnierter Accounts
 * mit Empfehlungen. Gewichtet wird nach Aktualitaet, Qualitaet, Naehe zur
 * eigenen Nische und der Beziehung zum Autor.
 */
export function buildFeed(world: World, options: FeedOptions = {}): Post[] {
  const limit = options.limit ?? 40;
  const discovery = options.discovery ?? 0.35;
  const user = world.accounts[world.user.accountId];
  const following = new Set(user.following);

  const scored: { post: Post; score: number; followed: boolean }[] = [];
  for (const id of world.order) {
    const post = world.posts[id];
    if (!post) continue;
    const age = world.time - post.createdAt;
    if (age > ACTIVE_WINDOW * 4) break;
    if (post.authorId === user.id) continue;
    const followed = following.has(post.authorId);
    const author = world.accounts[post.authorId];
    if (!author) continue;

    const recency = Math.exp(-age / (14 * 60));
    const affinity = user.audience[post.niche] ?? 0.05;
    const popularity = clamp(Math.log10(post.metrics.likes + 10) / 6, 0, 1);
    const base = recency * 0.5 + post.quality * 0.2 + popularity * 0.15 + affinity * 0.15;
    const score = followed ? base * 1.9 : base * discovery * (0.6 + affinity * 2.2);
    scored.push({ post, score, followed });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.post);
}

/**
 * Explore-Raster: was gerade gut laeuft, gewichtet nach deinen Interessen -
 * aber bewusst durchmischt. Ein Entdecken-Bereich, der nur ein Thema zeigt,
 * waere langweilig und wuerde niemanden Neues finden lassen.
 */
export function buildExplore(world: World, limit = 36, nicheFilter?: string): Post[] {
  const user = world.accounts[world.user.accountId];
  const scored: { post: Post; score: number }[] = [];
  for (const id of world.order) {
    const post = world.posts[id];
    if (!post) continue;
    const age = world.time - post.createdAt;
    if (age > 5 * 24 * 60) break;
    if (post.authorId === user.id) continue;
    if (nicheFilter && post.niche !== nicheFilter) continue;
    const affinity = user.audience[post.niche] ?? 0.05;
    const heat = clamp(Math.log10(post.metrics.impressions + 10) / 6.5, 0, 1);
    const er = post.metrics.likes / Math.max(1, post.metrics.impressions);
    const score = heat * 0.55 + er * 3 + affinity * 0.45 + Math.exp(-age / (36 * 60)) * 0.4;
    scored.push({ post, score });
  }
  scored.sort((a, b) => b.score - a.score);

  // Vielfalt erzwingen: pro Autor hoechstens zwei, pro Nische hoechstens ein Viertel.
  const out: Post[] = [];
  const perAuthor = new Map<string, number>();
  const perNiche = new Map<string, number>();
  const nicheCap = nicheFilter ? limit : Math.max(3, Math.ceil(limit * 0.26));
  for (const pass of [0, 1]) {
    for (const entry of scored) {
      if (out.length >= limit) break;
      const p = entry.post;
      if (out.includes(p)) continue;
      const a = perAuthor.get(p.authorId) ?? 0;
      const n = perNiche.get(p.niche) ?? 0;
      // Im zweiten Durchlauf werden die Grenzen gelockert, damit das Raster voll wird.
      if (pass === 0 && (a >= 2 || n >= nicheCap)) continue;
      out.push(p);
      perAuthor.set(p.authorId, a + 1);
      perNiche.set(p.niche, n + 1);
    }
  }
  return out;
}

/**
 * Reels-Bereich: senkrechte Folge von Videos. Frische und Resonanz zaehlen,
 * eigene Interessen ebenfalls - aber bewusst gemischt, damit man Neues sieht.
 */
export function buildReels(world: World, limit = 30): Post[] {
  const user = world.accounts[world.user.accountId];
  const following = new Set(user.following);
  const scored: { post: Post; score: number }[] = [];

  for (const id of world.order) {
    const post = world.posts[id];
    if (!post || post.format !== 'reel') continue;
    const age = world.time - post.createdAt;
    if (age > 10 * 24 * 60) break;
    const affinity = user.audience[post.niche] ?? 0.05;
    const heat = clamp(Math.log10(post.metrics.impressions + 10) / 6.5, 0, 1);
    const er = post.metrics.likes / Math.max(1, post.metrics.impressions);
    const known = following.has(post.authorId) ? 0.35 : 0;
    const mine = post.authorId === user.id ? 0.5 : 0;
    scored.push({
      post,
      score: heat * 0.45 + er * 3 + affinity * 0.5 + known + mine + Math.exp(-age / (48 * 60)) * 0.5,
    });
  }

  scored.sort((a, b) => b.score - a.score);

  // Nicht zweimal dieselbe Person hintereinander.
  const out: Post[] = [];
  const perAuthor = new Map<string, number>();
  for (const entry of scored) {
    if (out.length >= limit) break;
    const count = perAuthor.get(entry.post.authorId) ?? 0;
    if (count >= 2) continue;
    perAuthor.set(entry.post.authorId, count + 1);
    out.push(entry.post);
  }
  return out;
}

/** Accounts mit den meisten Followern - die Rangliste der Szene. */
export function leaderboard(world: World, limit = 25): Account[] {
  return Object.values(world.accounts)
    .sort((a, b) => b.realFollowers.length + b.crowdFollowers - (a.realFollowers.length + a.crowdFollowers))
    .slice(0, limit);
}

/** Accounts, die gerade am schnellsten wachsen. */
export function risingStars(world: World, limit = 8): Account[] {
  return Object.values(world.accounts)
    .filter((a) => a.momentum > 0)
    .sort((a, b) => b.momentum - a.momentum)
    .slice(0, limit);
}

/** Vorschlaege: passende Nische, aktive Accounts, denen man noch nicht folgt. */
export function suggestions(world: World, limit = 6): Account[] {
  const user = world.accounts[world.user.accountId];
  const following = new Set(user.following);
  return Object.values(world.accounts)
    .filter((a) => !a.isUser && !following.has(a.id))
    .map((a) => {
      const affinity = (user.audience[a.niche] ?? 0) * 2;
      const active = world.time - a.lastPostAt < 3 * 1440 ? 0.4 : 0;
      const reachable = 1 - clamp(Math.log10(a.realFollowers.length + a.crowdFollowers + 10) / 7, 0, 1);
      return { a, score: affinity + active + reachable * 0.6 + a.traits.charisma * 0.3 };
    })
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map((x) => x.a);
}

/** Accounts mit aktiver Story (letzte 24 Stunden). */
export function activeStories(world: World): Account[] {
  const user = world.accounts[world.user.accountId];
  const following = new Set(user.following);
  return Object.values(world.accounts)
    .filter((a) => !a.isUser && world.time - a.storyAt < 1440)
    .sort((a, b) => {
      const fa = following.has(a.id) ? 1 : 0;
      const fb = following.has(b.id) ? 1 : 0;
      if (fa !== fb) return fb - fa;
      return b.storyAt - a.storyAt;
    })
    .slice(0, 20);
}

export function searchAccounts(world: World, query: string, limit = 20): Account[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return Object.values(world.accounts)
    .filter((a) => a.handle.includes(q) || a.name.toLowerCase().includes(q))
    .sort((a, b) => b.crowdFollowers - a.crowdFollowers)
    .slice(0, limit);
}

export function searchHashtag(world: World, tag: string, limit = 30): Post[] {
  const q = tag.trim().toLowerCase().replace(/^#/, '');
  if (!q) return [];
  const out: Post[] = [];
  for (const id of world.order) {
    const post = world.posts[id];
    if (post?.hashtags.includes(q)) out.push(post);
    if (out.length >= limit) break;
  }
  return out;
}
