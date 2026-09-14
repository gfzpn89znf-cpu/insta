import { tick, follow, ATTENTION_HEADROOM } from './engine';
import { initialsOf, makeBio, makeHandle, makeName } from './names';
import { NICHES, NICHE_IDS } from './niches';
import { chance, clamp, gauss, gaussClamped, makeRng, pick, powerLaw, randInt, type Rng } from './rng';
import { followerCount } from './scoring';
import type { Account, NicheId, World } from './types';

export const WORLD_VERSION = 1;
/** Startzeitpunkt der Simulation in Minuten (entspricht Tag 60). */
const START_TIME = 60 * 24 * 60;
/** Tage Vorgeschichte, die beim Erstellen der Welt durchgerechnet werden. */
const BOOTSTRAP_DAYS = 7;
/** Simulationszeit pro Rechenhaeppchen (Minuten). */
const CHUNK_MINUTES = 6 * 60;
export const DEFAULT_POPULATION = 12_000_000;

export interface UserProfile {
  name: string;
  handle: string;
  bio: string;
  niche: NicheId;
  avatarHue?: number;
}

export interface WorldOptions {
  accounts?: number;
  bootstrapDays?: number;
}

/**
 * Schrittweiser Weltaufbau. Die Vorgeschichte wird in Haeppchen gerechnet,
 * damit die Oberflaeche zwischendurch zeichnen kann und der Browser nicht
 * minutenlang blockiert wirkt.
 */
export interface WorldBuild {
  world: World;
  /** Fortschritt 0..1. */
  progress: number;
  done: boolean;
  /** Rechnet das naechste Haeppchen. */
  step(): void;
}

export function beginWorld(seed: number, profile: UserProfile, options: WorldOptions = {}): WorldBuild {
  const rng = makeRng(seed);
  const accountCount = options.accounts ?? 220;
  const bootstrapDays = options.bootstrapDays ?? BOOTSTRAP_DAYS;

  const world: World = {
    version: WORLD_VERSION,
    seed,
    time: START_TIME - bootstrapDays * 1440,
    realTime: Date.now(),
    accounts: {},
    posts: {},
    order: [],
    active: [],
    notifications: [],
    threads: {},
    threadOrder: [],
    trends: [],
    user: {
      accountId: 'u0',
      money: 0,
      reputation: 0.1,
      savedPosts: [],
      likedPosts: [],
      commentedPosts: [],
      seenStories: [],
      deals: [],
      bestStreak: 0,
    },
    settings: { speed: 20, paused: false, population: DEFAULT_POPULATION, attentionCapacity: Infinity },
    attention: { demand: 0, rate: 0, factor: 1 },
    counter: 1,
    log: [],
  };

  const taken = new Set<string>([profile.handle.toLowerCase()]);

  // --- KI-Accounts erzeugen ---
  for (let i = 0; i < accountCount; i++) {
    const acc = makeAiAccount(world, rng, i, taken);
    world.accounts[acc.id] = acc;
  }

  // --- Nutzeraccount ---
  const user = makeUserAccount(world, rng, profile);
  world.accounts[user.id] = user;
  world.user.accountId = user.id;

  rebuildIndex(world);
  seedFollowGraph(world, rng);

  for (let i = 0; i < 4; i++) {
    world.trends.push({
      tag: pick(rng, NICHES[pick(rng, NICHE_IDS)].hashtags),
      niche: pick(rng, NICHE_IDS),
      heat: 0.3 + rng() * 0.6,
      startedAt: world.time - randInt(rng, 0, 20) * 60,
      duration: randInt(rng, 20, 90) * 60,
      posts: randInt(rng, 500, 80000),
    });
  }

  const totalMinutes = bootstrapDays * 1440;
  // Die letzten zwei Tage mit Details (namentliche Likes und Kommentare).
  const detailedFrom = totalMinutes - Math.min(2, bootstrapDays) * 1440;
  let elapsed = 0;

  const build: WorldBuild = {
    world,
    progress: totalMinutes > 0 ? 0 : 1,
    done: totalMinutes === 0,
    step() {
      if (build.done) return;
      const chunk = Math.min(CHUNK_MINUTES, totalMinutes - elapsed);
      const detailed = elapsed >= detailedFrom;
      // Die frueheren Tage werden grob gerechnet, die letzten zwei genau.
      tick(world, chunk, { sample: detailed, notify: false, maxStep: detailed ? 30 : 60 });
      elapsed += chunk;
      build.progress = elapsed / totalMinutes;
      if (elapsed >= totalMinutes) build.done = true;
      if (build.done) finishWorld(world);
    },
  };

  if (build.done) finishWorld(world);
  return build;
}

/** Letzte Schritte, wenn die Vorgeschichte durchgerechnet ist. */
function finishWorld(world: World) {
  // Aufmerksamkeitsmarkt am fertigen Startzustand kalibrieren, damit jede
  // Welt mit fairen Bedingungen beginnt.
  world.settings.attentionCapacity = Math.max(1, world.attention.rate) * ATTENTION_HEADROOM;
  world.notifications = [];
  world.log = [];
  world.time = START_TIME;
  world.realTime = Date.now();
}

/** Erzeugt eine komplette, bereits belebte Welt in einem Rutsch. */
export function createWorld(seed: number, profile: UserProfile, options: WorldOptions = {}): World {
  const build = beginWorld(seed, profile, options);
  while (!build.done) build.step();
  return build.world;
}

function makeAiAccount(world: World, rng: Rng, index: number, taken: Set<string>): Account {
  // Nischen mit grosser Zielgruppe ziehen mehr Creator an.
  const niche = weightedNiche(rng);
  let secondNiche = pick(rng, NICHE_IDS);
  if (secondNiche === niche) secondNiche = NICHE_IDS[(NICHE_IDS.indexOf(niche) + 3) % NICHE_IDS.length];

  const { first, last, display } = makeName(rng);
  const handle = makeHandle(rng, first, last, niche, taken);

  // Followerzahlen folgen einem Potenzgesetz: viele klein, wenige riesig.
  const target = Math.round(powerLaw(rng, 260, 6_500_000, 0.58));
  const fame = clamp(Math.log10(target) / 6.8, 0, 1);

  const traits = {
    charisma: gaussClamped(rng, 0.34 + fame * 0.45, 0.13, 0.05, 0.99),
    consistency: gaussClamped(rng, 0.4 + fame * 0.4, 0.18, 0.05, 0.99),
    activity: clamp(gauss(rng, 0.75 + fame * 0.9, 0.55), 0.12, 4.2),
    sociability: gaussClamped(rng, 0.55 - fame * 0.25, 0.2, 0.02, 0.99),
    followBack: gaussClamped(rng, 0.6 - fame * 0.5, 0.2, 0.01, 0.99),
    trendChasing: gaussClamped(rng, 0.5, 0.24, 0.02, 0.99),
    authenticity: gaussClamped(rng, 0.6, 0.19, 0.05, 0.99),
    ambition: gaussClamped(rng, 0.5 + fame * 0.2, 0.2, 0.05, 0.99),
    luck: gaussClamped(rng, 0.5, 0.17, 0.05, 0.99),
  };

  const audience: Partial<Record<NicheId, number>> = {};
  const primaryShare = 0.5 + rng() * 0.28;
  audience[niche] = primaryShare;
  audience[secondNiche] = (1 - primaryShare) * (0.3 + rng() * 0.3);
  // Der Rest der Zielgruppe verteilt sich gleichmaessig auf alle anderen Themen.
  const rest = 1 - (audience[niche] ?? 0) - (audience[secondNiche] ?? 0);
  const others = NICHE_IDS.filter((n) => n !== niche && n !== secondNiche);
  for (const n of others) audience[n] = rest / others.length;

  const palette = NICHES[niche].palette;
  const id = `a${index}`;
  return {
    id,
    handle,
    name: display,
    bio: makeBio(rng, niche, secondNiche),
    niche,
    secondNiche,
    avatar: {
      seed: randInt(rng, 1, 2 ** 30),
      hue: hueOf(palette[0]),
      hue2: hueOf(palette[1]),
      shape: randInt(rng, 0, 5),
      initials: initialsOf(display),
    },
    isUser: false,
    verified: target > 120000,
    createdAt: world.time - randInt(rng, 200, 1400) * 1440,
    traits,
    realFollowers: [],
    crowdFollowers: target,
    following: [],
    crowdFollowing: Math.round(clamp(target * 0.02, 20, 3000) * (0.5 + rng())),
    postIds: [],
    // Ein bestehender Account hat schon eine Historie - auch wenn nur die
    // juengsten Beitraege tatsaechlich vorgehalten werden.
    postsTotal: randInt(rng, 12, 400),
    totalLikes: Math.round(target * (2 + rng() * 18)),
    totalImpressions: Math.round(target * (10 + rng() * 60)),
    history: [{ t: world.time, followers: target }],
    lastPostAt: world.time - randInt(rng, 60, 3000),
    nextPostAt: world.time + randInt(rng, 5, 1440),
    streak: randInt(rng, 0, 40),
    momentum: 0,
    audience,
    peakHour: randInt(rng, 7, 22),
    storyAt: chance(rng, 0.4) ? world.time - randInt(rng, 0, 900) : -1e9,
    storySeed: randInt(rng, 1, 1e9),
    milestones: [],
  };
}

function makeUserAccount(world: World, rng: Rng, profile: UserProfile): Account {
  const niche = profile.niche;
  let secondNiche = pick(rng, NICHE_IDS);
  if (secondNiche === niche) secondNiche = NICHE_IDS[(NICHE_IDS.indexOf(niche) + 5) % NICHE_IDS.length];
  const audience: Partial<Record<NicheId, number>> = {};
  audience[niche] = 0.55;
  for (const n of NICHE_IDS) if (n !== niche) audience[n] = 0.45 / (NICHE_IDS.length - 1);

  const palette = NICHES[niche].palette;
  return {
    id: 'u0',
    handle: profile.handle,
    name: profile.name,
    bio: profile.bio,
    niche,
    secondNiche,
    avatar: {
      seed: randInt(rng, 1, 2 ** 30),
      hue: profile.avatarHue ?? hueOf(palette[0]),
      hue2: hueOf(palette[1]),
      shape: randInt(rng, 0, 5),
      initials: initialsOf(profile.name),
    },
    isUser: true,
    verified: false,
    createdAt: world.time,
    traits: {
      charisma: 0.5,
      consistency: 0.5,
      activity: 1,
      sociability: 0.6,
      followBack: 0.5,
      trendChasing: 0.5,
      authenticity: 0.75,
      ambition: 0.8,
      luck: 0.5,
    },
    realFollowers: [],
    crowdFollowers: 0,
    following: [],
    crowdFollowing: 0,
    postIds: [],
    postsTotal: 0,
    totalLikes: 0,
    totalImpressions: 0,
    history: [{ t: world.time, followers: 0 }],
    lastPostAt: world.time - 1440,
    nextPostAt: Infinity,
    streak: 0,
    momentum: 0,
    audience,
    peakHour: 20,
    storyAt: -1e9,
    storySeed: 1,
    milestones: [],
  };
}

/** Nischenwahl gewichtet nach Zielgruppengroesse. */
function weightedNiche(rng: Rng): NicheId {
  const total = NICHE_IDS.reduce((s, n) => s + NICHES[n].reach, 0);
  let r = rng() * total;
  for (const n of NICHE_IDS) {
    r -= NICHES[n].reach;
    if (r <= 0) return n;
  }
  return NICHE_IDS[0];
}

/**
 * Baut das Startnetzwerk: Accounts folgen bevorzugt Groessen der eigenen
 * Nische (praeferenzielle Bindung, wie in echten Netzwerken).
 */
function seedFollowGraph(world: World, rng: Rng) {
  const ids = Object.keys(world.accounts).filter((id) => !world.accounts[id].isUser);
  const byFollowers = [...ids].sort((a, b) => followerCount(world.accounts[b]) - followerCount(world.accounts[a]));
  const top = byFollowers.slice(0, Math.ceil(ids.length * 0.25));

  for (const id of ids) {
    const acc = world.accounts[id];
    const count = Math.round(clamp(gauss(rng, 45 + acc.traits.sociability * 90, 30), 8, 220));
    const pool = world.nicheIndex?.[acc.niche] ?? ids;
    for (let i = 0; i < count; i++) {
      // 55% aus der eigenen Nische, 25% Top-Accounts, Rest zufaellig.
      const r = rng();
      const targetId = r < 0.55 ? pick(rng, pool) : r < 0.8 ? pick(rng, top) : pick(rng, ids);
      const target = world.accounts[targetId];
      if (!target || target.id === acc.id) continue;
      follow(acc, target);
    }
  }

  // Die anonyme Masse fuellt die Differenz zur Zielgroesse auf.
  for (const id of ids) {
    const acc = world.accounts[id];
    acc.crowdFollowers = Math.max(0, acc.crowdFollowers - acc.realFollowers.length);
    acc.crowdFollowing = Math.max(0, acc.crowdFollowing - acc.following.length);
    acc.history = [{ t: world.time, followers: followerCount(acc) }];
  }
}

/** Index Nische -> Accounts, fuer schnelle Zielgruppen-Auswahl. */
export function rebuildIndex(world: World) {
  const index: Partial<Record<NicheId, string[]>> = {};
  for (const n of NICHE_IDS) index[n] = [];
  for (const id of Object.keys(world.accounts)) {
    const acc = world.accounts[id];
    index[acc.niche]?.push(id);
    if (acc.secondNiche !== acc.niche) index[acc.secondNiche]?.push(id);
  }
  world.nicheIndex = index;
}

function hueOf(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return Math.round(((h * 60) + 360) % 360);
}
