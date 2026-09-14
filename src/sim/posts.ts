import { generateCaption, generateHashtags } from './content';
import { NICHES, getTopic, styleFit } from './niches';
import { chance, clamp, gauss, pick, rngFrom, randInt, type Rng } from './rng';
import { followerCount, scoreDraft, type Draft } from './scoring';
import type { Account, NicheId, Post, StyleId, World } from './types';

export function nextId(world: World, prefix: string): string {
  world.counter += 1;
  return `${prefix}${world.counter.toString(36)}`;
}

/** Waehlt ein Thema - trendbewusste Accounts greifen nach breiter Anziehungskraft. */
function chooseTopic(rng: Rng, account: Account, niche: NicheId) {
  const topics = NICHES[niche].topics;
  const weights = topics.map((t) => {
    const broadPull = 0.4 + account.traits.ambition * 0.9;
    const corePull = 0.5 + account.traits.authenticity * 0.8;
    return Math.pow(t.broad, broadPull) * Math.pow(t.core, corePull) + 0.05;
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  let r = rng() * sum;
  for (let i = 0; i < topics.length; i++) {
    r -= weights[i];
    if (r <= 0) return topics[i];
  }
  return topics[topics.length - 1];
}

/** Ein KI-Account produziert einen Post im Rahmen seiner Faehigkeiten. */
export function createAiPost(world: World, account: Account): Post {
  const rng = rngFrom(world.seed, account.id, account.postIds.length, Math.floor(world.time));
  // Gelegentlich ein Ausflug in die Zweitnische - so wie echte Menschen auch.
  const niche = chance(rng, 0.12) ? account.secondNiche : account.niche;
  const topic = chooseTopic(rng, account, niche);
  const style = pick(rng, NICHES[niche].styles) as StyleId;

  const inspiration = gauss(rng, 0, 0.14);
  const quality = clamp(
    account.traits.charisma * 0.52 +
      (topic.core * 0.4 + topic.broad * 0.6) * 0.24 +
      styleFit(niche, style) * 0.12 +
      account.traits.consistency * 0.08 +
      inspiration,
    0.05,
    0.995,
  );

  const post: Post = {
    id: nextId(world, 'p'),
    authorId: account.id,
    createdAt: world.time,
    niche,
    topic: topic.id,
    style,
    caption: generateCaption(rng, niche, topic),
    hashtags: generateHashtags(rng, niche, world.trends, account.traits.trendChasing),
    imageSeed: randInt(rng, 1, 2 ** 30),
    quality,
    algoScore: initialAlgoScore(account, quality),
    metrics: emptyMetrics(),
    likedBy: [],
    commentList: [],
    energy: 1,
    luck: postLuck(rng),
    lastTick: world.time,
    byUser: false,
  };

  registerPost(world, account, post);
  return post;
}

/** Der Nutzer veroeffentlicht - hier zaehlt jede Entscheidung aus dem Composer. */
export function createUserPost(world: World, draft: Draft): Post {
  const account = world.accounts[world.user.accountId];
  const breakdown = scoreDraft(world, account, draft);
  const rng = rngFrom(world.seed, 'user', account.postIds.length, Math.floor(world.time));

  const post: Post = {
    id: nextId(world, 'p'),
    authorId: account.id,
    createdAt: world.time,
    niche: draft.niche,
    topic: draft.topicId,
    style: draft.style,
    caption: draft.caption,
    hashtags: draft.hashtags.map((t) => t.toLowerCase().replace(/^#/, '')).filter(Boolean),
    imageSeed: randInt(rng, 1, 2 ** 30),
    // Etwas Glueck bleibt immer im Spiel - aber Qualitaet dominiert.
    quality: clamp(breakdown.total * 0.92 + gauss(rng, 0.04, 0.05), 0.03, 0.995),
    algoScore: initialAlgoScore(account, breakdown.total),
    metrics: emptyMetrics(),
    likedBy: [],
    commentList: [],
    collabId: draft.collabId,
    energy: 1,
    luck: postLuck(rng),
    lastTick: world.time,
    byUser: true,
    breakdown,
  };

  registerPost(world, account, post);
  return post;
}

function registerPost(world: World, account: Account, post: Post) {
  world.posts[post.id] = post;
  world.order.unshift(post.id);
  account.postIds.push(post.id);
  account.postsTotal += 1;

  // Streak: an aufeinanderfolgenden Tagen posten haelt den Account "warm".
  const daysSinceLast = (world.time - account.lastPostAt) / 1440;
  if (account.postIds.length === 1) account.streak = 1;
  else if (daysSinceLast <= 1.6) account.streak += 1;
  else if (daysSinceLast > 2.5) account.streak = 1;

  account.lastPostAt = world.time;
  account.nextPostAt = world.time + postInterval(account);
  if (account.isUser) {
    world.user.bestStreak = Math.max(world.user.bestStreak, account.streak);
  }
}

/** Abstand bis zum naechsten Post eines KI-Accounts (in Minuten). */
export function postInterval(account: Account): number {
  const perDay = Math.max(0.12, account.traits.activity);
  const base = 1440 / perDay;
  // Unregelmaessige Accounts schwanken stark, konsistente posten wie ein Uhrwerk.
  const jitter = 1 + (1 - account.traits.consistency) * 1.6;
  const rng = rngFrom(account.id, account.postIds.length, 'interval');
  return base * (0.55 + rng() * jitter);
}

function initialAlgoScore(account: Account, quality: number): number {
  // Etablierte Accounts starten mit Vertrauensvorschuss.
  const authority = clamp(Math.log10(followerCount(account) + 10) / 6, 0, 1);
  return clamp(0.35 + quality * 0.75 + authority * 0.35 + account.traits.luck * 0.1, 0.2, 1.8);
}

/**
 * Das Glueck eines einzelnen Posts. Meistens nahe 1, selten ein Ausreisser -
 * so entstehen die ueberraschenden Durchbrueche, die es real auch gibt.
 */
function postLuck(rng: Rng): number {
  return clamp(Math.exp(gauss(rng, 0, 0.35)), 0.45, 2.6);
}

export function emptyMetrics() {
  return {
    impressions: 0,
    reachFollowers: 0,
    reachExplore: 0,
    likes: 0,
    comments: 0,
    saves: 0,
    shares: 0,
    newFollowers: 0,
    unfollows: 0,
  };
}

export function topicLabel(post: Post): string {
  return getTopic(post.niche, post.topic).label;
}
