import { generateComment, formatShort } from './content';
import { NICHES, getTopic } from './niches';
import { chance, clamp, gauss, makeRng, mixSeed, pick, randInt, rngFrom, seedOf, stochasticRound, type Rng } from './rng';
import { createAiPost } from './posts';
import { processDms } from './dms';
import { followerCount } from './scoring';
import type { Account, AppNotification, NicheId, Post, World } from './types';

/** Durchschnittliche Like-Rate der Plattform - Referenzwert des Algorithmus. */
export const PLATFORM_ER = 0.05;
/** Wie lange ein Post ueberhaupt noch ausgespielt wird (Minuten). */
export const ACTIVE_WINDOW = 72 * 60;
/** Zeitkonstante der Follower-Auslieferung (Minuten). */
const FOLLOWER_TAU = 330;
/** Zeitkonstante, mit der der Algorithmus das Interesse an einem Post verliert. */
const EXPLORE_TAU = 15 * 60;
/**
 * Basis-Reproduktionszahl der Verbreitung: wie oft sich die Explore-Auslieferung
 * pro Stunde selbst reproduziert, wenn ein Post genau durchschnittlich laeuft.
 * Unter 1 versandet ein Post, ueber 1 geht er viral.
 */
const SPREAD_R0 = 0.72;
/** Taegliche natuerliche Abwanderung - jeder Account verliert staendig Follower. */
const BASE_CHURN_PER_DAY = 0.0019;
/**
 * Wie viel Luft die Szene ueber ihrem Startzustand hat, bevor der
 * Verdraengungswettbewerb greift. 2.2 heisst: die Szene darf sich gut
 * verdoppeln, danach geht Wachstum nur noch auf Kosten anderer.
 */
export const ATTENTION_HEADROOM = 1.7;

export interface TickOptions {
  /** Konkrete Likes/Kommentare/Follower erzeugen (fuer Anzeige). Aus bei Massen-Nachholung. */
  sample?: boolean;
  /** Benachrichtigungen fuer den Nutzer erzeugen. */
  notify?: boolean;
  /**
   * Groesse der internen Rechenschritte in Minuten. Kleiner ist genauer,
   * groesser ist schneller - fuer die Vorgeschichte reicht grob.
   */
  maxStep?: number;
}

/**
 * Haupt-Tick der Welt. dt ist die vergangene Simulationszeit in Minuten.
 * Wird intern in Schritte von maximal 30 Minuten zerlegt, damit die
 * Kaskadenrechnung stabil bleibt.
 */
export function tick(world: World, dt: number, opts: TickOptions = {}) {
  const sample = opts.sample !== false;
  const notify = opts.notify !== false;
  const maxStep = opts.maxStep ?? 30;
  let remaining = Math.max(0, dt);
  while (remaining > 0) {
    const step = Math.min(maxStep, remaining);
    stepWorld(world, step, sample, notify);
    remaining -= step;
  }
}

function stepWorld(world: World, dt: number, sample: boolean, notify: boolean) {
  world.time += dt;
  updateTrends(world, dt);

  // 1. Neue Posts der KI-Accounts
  for (const id of Object.keys(world.accounts)) {
    const acc = world.accounts[id];
    if (acc.isUser) continue;
    if (world.time >= acc.nextPostAt) {
      if (isAwake(acc, world.time)) {
        createAiPost(world, acc);
      } else {
        acc.nextPostAt = world.time + randInt(rngFrom(acc.id, world.time), 40, 180);
      }
    }
  }

  // 2. Reichweite und Engagement der Beitraege, die noch ausgespielt werden
  let write = 0;
  for (let i = 0; i < world.active.length; i++) {
    const postId = world.active[i];
    const post = world.posts[postId];
    if (!post) continue;
    const age = world.time - post.createdAt;
    if (age > ACTIVE_WINDOW || post.done) continue; // faellt aus der Liste
    if (age >= 0) advancePost(world, post, dt, sample, notify);
    world.active[write++] = postId;
  }
  world.active.length = write;

  // 3. Beziehungen, Abwanderung, Meilensteine
  socialStep(world, dt, notify);
  if (notify) processDms(world, dt, notify);

  // 4. Aufmerksamkeitsmarkt ausgleichen: Nachfrage gegen verfuegbare Ansichten.
  const perDay = world.attention.demand / (dt / 1440);
  world.attention.rate = world.attention.rate <= 0 ? perDay : world.attention.rate + (perDay - world.attention.rate) * 0.25;
  const capacity = world.settings.attentionCapacity;
  if (capacity > 0 && Number.isFinite(capacity)) {
    const target = clamp(capacity / Math.max(1, world.attention.rate), 0.15, 1);
    world.attention.factor = world.attention.factor + (target - world.attention.factor) * 0.3;
  } else {
    world.attention.factor = 1;
  }
  world.attention.demand = 0;

  prune(world);
}

/** Circadianer Rhythmus - nachts wird selten gepostet. */
function isAwake(acc: Account, time: number): boolean {
  const hour = (time / 60) % 24;
  if (hour >= 1 && hour < 6) return chance(makeRng(mixSeed(seedOf(acc.id), Math.floor(time / 60))), 0.06);
  return true;
}

/** Aktuelle Hitze der genutzten Hashtags (0..1). */
function trendHeat(world: World, post: Post): number {
  let heat = 0;
  for (const t of world.trends) {
    if (post.hashtags.includes(t.tag)) heat = Math.max(heat, t.heat);
  }
  return heat;
}

/**
 * Wie attraktiv das Profil auf Besucher wirkt - entscheidet, ob aus
 * Reichweite auch Follower werden.
 */
export function profileAppeal(world: World, acc: Account): number {
  const recent = acc.postIds.slice(-9).map((id) => world.posts[id]).filter(Boolean);
  const coherence = recent.length
    ? recent.filter((p) => p.niche === acc.niche).length / recent.length
    : 0.5;
  const avgQuality = recent.length ? recent.reduce((s, p) => s + p.quality, 0) / recent.length : 0.4;
  const bioScore = clamp(acc.bio.length / 60, 0.2, 1);
  const volume = clamp(Math.log10(acc.postsTotal + 1) / 1.7, 0.15, 1);
  const social = clamp(Math.log10(followerCount(acc) + 10) / 6.5, 0, 1);
  return clamp(coherence * 0.3 + avgQuality * 0.3 + bioScore * 0.1 + volume * 0.15 + social * 0.15, 0.05, 1);
}

/**
 * Rechnet einen Post um dt Minuten weiter: Auslieferung, Engagement,
 * Verstaerkung durch den Algorithmus, neue Follower.
 */
export function advancePost(world: World, post: Post, dt: number, sample = true, notify = true) {
  const author = world.accounts[post.authorId];
  if (!author) return;
  const rng = makeRng(mixSeed(post.seedNum, Math.floor(world.time)));
  const ageNow = world.time - post.createdAt;
  const agePrev = Math.max(0, ageNow - dt);
  const followers = followerCount(author);
  const topic = getTopic(post.niche, post.topic);
  const niche = NICHES[post.niche];
  const heat = trendHeat(world, post);

  // --- Auslieferung an die eigenen Follower (saettigende Kurve) ---
  const penetration = clamp(
    0.16 + post.algoScore * 0.2 + author.traits.consistency * 0.12 + heat * 0.05,
    0.07,
    0.75,
  );
  const deliveredFrac = Math.exp(-agePrev / FOLLOWER_TAU) - Math.exp(-ageNow / FOLLOWER_TAU);
  let imprFollowers = Math.max(0, followers * penetration * deliveredFrac);

  // --- Kaltstart: jeder Post wird an einer kleinen Testgruppe geprueft ---
  // Kleine Accounts bekommen relativ gesehen die groesste Testgruppe - genau
  // dadurch kann ein unbekannter Account ueberhaupt durchbrechen.
  const seedTotal = 40 + post.quality * post.quality * 450 + Math.sqrt(followers) * 1.2;
  const seedFrac = Math.exp(-agePrev / 150) - Math.exp(-ageNow / 150);
  const seed = Math.max(0, seedTotal * seedFrac);

  // --- Verbreitung als Verzweigungsprozess ---
  // R sagt, wie stark sich die Ausspielung pro Stunde selbst verstaerkt.
  // Gemessen wird an der tatsaechlichen Like-Rate - genau wie bei echten Feeds.
  const measured = post.metrics.impressions > 120;
  const observedEr = measured ? post.metrics.likes / Math.max(1, post.metrics.impressions) : 0;
  const erRatio = measured ? observedEr / PLATFORM_ER : 0.45 + post.quality * 0.9;
  const audienceCap = world.settings.population * niche.reach * (0.015 + post.quality * topic.broad * 0.35);
  const saturation = clamp(1 - post.metrics.reachExplore / Math.max(1, audienceCap), 0, 1);
  const decay = Math.exp(-ageNow / EXPLORE_TAU);
  const R = clamp(
    SPREAD_R0 *
      Math.pow(Math.max(erRatio, 0.05), 1.45) *
      (1 + heat * 0.55) *
      (0.75 + author.traits.luck * 0.5) *
      (post.luck ?? 1) *
      decay *
      saturation,
    0,
    4.5,
  );

  // Follower, die den Post teilen oder speichern, speisen die Verbreitung an.
  // Follower, die teilen und speichern, tragen den Post nach draussen.
  const pickup = imprFollowers * (0.03 + 0.12 * post.quality * topic.broad);
  const hours = Math.max(dt / 60, 1e-6);
  const prevRate = post.spreadRate ?? 0;
  const growth = Math.pow(R, hours);
  const newRate = prevRate * growth;
  let imprExplore = ((prevRate + newRate) / 2) * hours + seed + pickup;

  // Saettigung: eine Nische hat nur so viele interessierte Menschen.
  const exploreRoom = Math.max(0, audienceCap - post.metrics.reachExplore);
  imprExplore = Math.min(imprExplore, exploreRoom, world.settings.population * 0.05);

  // Konkurrenz um Aufmerksamkeit: alle Posts teilen sich dieselben Augen.
  const market = world.attention.factor;
  world.attention.demand += imprFollowers + imprExplore;
  imprFollowers *= market;
  imprExplore *= market;
  post.spreadRate = Math.max(0, imprExplore / hours);

  if (imprFollowers + imprExplore < 0.3) {
    post.lastTick = world.time;
    // Der Algorithmus hat das Thema durch: nichts kommt mehr nach, also
    // muss dieser Beitrag auch nicht weiter berechnet werden.
    if (ageNow > 6 * 60) post.done = true;
    return;
  }

  // --- Engagement ---
  // Grosse Accounts haben strukturell niedrigere Interaktionsraten.
  const sizePenalty = clamp(1 - Math.log10(Math.max(followers, 100) / 800) * 0.11, 0.38, 1.15);
  const erF = clamp((0.022 + post.quality * 0.095 + author.traits.authenticity * 0.012 + heat * 0.008) * sizePenalty, 0.004, 0.22);
    // Nur wirklich breit anschlussfaehige Inhalte schlagen den Plattformschnitt -
  // erst dann traegt die Kaskade sich selbst und ein Post geht viral.
  const erE = clamp(0.004 + post.quality * topic.broad * 0.075 + heat * 0.01, 0.0015, 0.12);
  const noise = 1 + gauss(rng, 0, 0.1);
  const newLikes = Math.max(0, (imprFollowers * erF + imprExplore * erE) * noise);

  const commentRatio = clamp(0.02 + topic.core * 0.05 + post.quality * 0.04, 0.008, 0.11);
  const saveRatio = clamp(0.04 + topic.core * 0.22, 0.02, 0.3);
  const shareRatio = clamp(0.02 + topic.broad * 0.16 * post.quality, 0.005, 0.22);

  const newComments = newLikes * commentRatio;
  const newSaves = newLikes * saveRatio;
  const newShares = newLikes * shareRatio;

  // --- Neue Follower: nur kalte Reichweite kann neue Leute bringen ---
  const appeal = profileAppeal(world, author);
  const followRate = clamp(0.0025 + post.quality * appeal * 0.03 + topic.core * 0.003, 0.0004, 0.055);
  // Eine Nische hat nur begrenzt viele Interessierte - ganz oben wird es zaeh.
  const nicheCap = world.settings.population * niche.reach * 0.5;
  const headroom = clamp(1 - followers / nicheCap, 0, 1);
  const newFollowers = imprExplore * followRate * headroom;

  // --- Entfolgen: Themenwechsel und Reizueberflutung kosten Publikum ---
  const mismatch = 1 - (author.audience[post.niche] ?? 0.1);
  const unfollowRate = clamp(0.0022 * mismatch * (1.35 - author.traits.authenticity), 0, 0.02);
  const unfollows = Math.min(imprFollowers * unfollowRate, followers * 0.02);

  // --- Werte schreiben ---
  const m = post.metrics;
  m.reachFollowers += imprFollowers;
  m.reachExplore += imprExplore;
  m.impressions += imprFollowers + imprExplore;
  m.likes += newLikes;
  m.comments += newComments;
  m.saves += newSaves;
  m.shares += newShares;
  m.newFollowers += newFollowers;
  m.unfollows += unfollows;

  author.totalLikes += newLikes;
  author.totalImpressions += imprFollowers + imprExplore;

  applyFollowerDelta(world, author, newFollowers - unfollows);

  // Kollaborationen bringen zusaetzliche, qualifizierte Reichweite.
  if (post.collabId && world.accounts[post.collabId] && ageNow < 720) {
    const partner = world.accounts[post.collabId];
    const spill = followerCount(partner) * 0.02 * (dt / 720) * post.quality;
    m.reachExplore += spill;
    m.impressions += spill;
    applyFollowerDelta(world, author, spill * followRate * 1.6);
  }

  // --- Algorithmus-Bewertung aktualisieren ---
  if (measured) {
    post.algoScore = clamp(0.25 + Math.pow(Math.max(erRatio, 0.05), 0.9) * 0.7 + post.quality * 0.3, 0.15, 2.2);
  }
  post.energy *= Math.exp(-dt / (30 * 60));
  post.lastTick = world.time;

  if (sample) {
    sampleEngagement(world, post, newLikes, newFollowers, rng, notify);
  }
  if (notify && post.byUser) {
    checkViral(world, post);
  }
}

/** Followerzahl veraendern - echte Accounts bleiben erhalten, die Masse skaliert. */
function applyFollowerDelta(world: World, acc: Account, delta: number) {
  if (delta === 0) return;
  const rng = makeRng(mixSeed(seedOf(acc.id), Math.floor(world.time)));
  const whole = stochasticRound(rng, Math.abs(delta));
  if (whole === 0) return;
  if (delta > 0) {
    acc.crowdFollowers += whole;
  } else {
    acc.crowdFollowers = Math.max(0, acc.crowdFollowers - whole);
  }
}

/**
 * Erzeugt konkrete Akteure zu den statistischen Zahlen: namentliche Likes,
 * echte Kommentare und neue Follower mit Profil.
 */
function sampleEngagement(
  world: World,
  post: Post,
  newLikes: number,
  newFollowers: number,
  rng: Rng,
  notify: boolean,
) {
  const author = world.accounts[post.authorId];
  const isUserPost = post.byUser;
  // Fuer fremde Posts reicht eine kleine Stichprobe, Nutzer-Posts bekommen mehr Details.
  const likeSlots = isUserPost ? 6 : 1;
  const maxLikers = isUserPost ? 40 : 6;
  const maxComments = isUserPost ? 30 : 5;

  if (newLikes >= 1 && post.likedBy.length < maxLikers) {
    const n = Math.min(likeSlots, Math.ceil(Math.min(newLikes, 6)));
    for (let i = 0; i < n; i++) {
      const actor = pickEngager(world, post, rng);
      if (!actor || actor.id === post.authorId || post.likedBy.includes(actor.id)) continue;
      post.likedBy.push(actor.id);
      if (isUserPost && notify) {
        pushNotification(world, {
          kind: 'like',
          actorId: actor.id,
          postId: post.id,
          text: 'hat dein Foto geliked.',
        });
      }
    }
  }

  const expectedComments = Math.floor(post.metrics.comments);
  if (expectedComments > post.commentList.length && post.commentList.length < maxComments) {
    const want = Math.min(isUserPost ? 3 : 1, expectedComments - post.commentList.length);
    for (let i = 0; i < want; i++) {
      const actor = pickEngager(world, post, rng);
      if (!actor || actor.id === post.authorId) continue;
      const followers = followerCount(author);
      let mood: 'normal' | 'fan' | 'hater' | 'niche' = 'normal';
      const r = rng();
      // Ab einer gewissen Groesse kommen Fans - und Hater.
      if (followers > 20000 && r < 0.08) mood = 'hater';
      else if (followers > 800 && r < 0.26) mood = 'fan';
      else if (actor.niche === post.niche && r < 0.6) mood = 'niche';
      post.commentList.push({
        id: `c${world.counter++}`,
        authorId: actor.id,
        text: generateComment(rng, post.niche, mood, Math.max(50, followers * 0.3)),
        at: world.time,
        likes: Math.floor(Math.max(0, gauss(rng, post.metrics.likes * 0.004, 3))),
      });
      if (isUserPost && notify) {
        pushNotification(world, {
          kind: 'comment',
          actorId: actor.id,
          postId: post.id,
          text: `hat kommentiert: "${post.commentList[post.commentList.length - 1].text.slice(0, 40)}"`,
        });
      }
    }
  }

  // Neue Follower mit Gesicht - nur fuer den Nutzer interessant.
  if (isUserPost && newFollowers >= 1) {
    const n = Math.min(3, Math.ceil(Math.min(newFollowers, 3)));
    for (let i = 0; i < n; i++) {
      const actor = pickEngager(world, post, rng);
      if (!actor || actor.isUser) continue;
      if (actor.following.includes(author.id)) continue;
      follow(actor, author);
      if (notify) {
        pushNotification(world, { kind: 'follow', actorId: actor.id, text: 'folgt dir jetzt.' });
      }
    }
  }
}

/** Waehlt einen plausiblen Interagierenden: eigene Follower oder Nischen-Publikum. */
function pickEngager(world: World, post: Post, rng: Rng): Account | undefined {
  const author = world.accounts[post.authorId];
  if (chance(rng, 0.55) && author.realFollowers.length > 0) {
    const id = pick(rng, author.realFollowers);
    const acc = world.accounts[id];
    if (acc && !acc.isUser) return acc;
  }
  const pool = world.nicheIndex?.[post.niche];
  if (pool && pool.length > 0) {
    const acc = world.accounts[pick(rng, pool)];
    if (acc && !acc.isUser) return acc;
  }
  const ids = Object.keys(world.accounts);
  const acc = world.accounts[pick(rng, ids)];
  return acc && !acc.isUser ? acc : undefined;
}

/** Baut eine echte Follow-Beziehung zwischen zwei Accounts auf. */
export function follow(from: Account, to: Account) {
  if (from.id === to.id) return;
  if (from.following.includes(to.id)) return;
  from.following.push(to.id);
  to.realFollowers.push(from.id);
  // Bei sehr grossen Accounts wird nur ein Ausschnitt namentlich gefuehrt.
  if (to.realFollowers.length > 1200) {
    to.crowdFollowers += 1;
    to.realFollowers.shift();
  }
}

export function unfollow(from: Account, to: Account) {
  const i = from.following.indexOf(to.id);
  if (i >= 0) from.following.splice(i, 1);
  const j = to.realFollowers.indexOf(from.id);
  if (j >= 0) to.realFollowers.splice(j, 1);
}

export function pushNotification(world: World, n: Omit<AppNotification, 'id' | 'at' | 'read'>) {
  world.notifications.unshift({
    id: `n${world.counter++}`,
    at: world.time,
    read: false,
    ...n,
  });
  if (world.notifications.length > 400) world.notifications.length = 400;
}

export function addLog(world: World, kind: 'post' | 'growth' | 'social' | 'world', text: string) {
  world.log.unshift({ id: `l${world.counter++}`, at: world.time, text, kind });
  if (world.log.length > 120) world.log.length = 120;
}

const MILESTONES = [100, 500, 1000, 5000, 10000, 50000, 100000, 500000, 1000000, 5000000];

/** Beziehungspflege der KI-Welt: folgen, entfolgen, Stories, Meilensteine. */
function socialStep(world: World, dt: number, notify: boolean) {
  const rng = rngFrom(world.seed, 'social', Math.floor(world.time));
  const ids = Object.keys(world.accounts);
  const perTick = Math.max(1, Math.round((ids.length * dt) / 240));

  for (let i = 0; i < perTick; i++) {
    const acc = world.accounts[pick(rng, ids)];
    if (!acc || acc.isUser) continue;

    // Entdeckt neue Accounts und folgt ihnen. Meistens aus der eigenen
    // Nische, manchmal aber auch quer dazu - so wie Menschen eben auch.
    if (chance(rng, acc.traits.sociability * 0.55)) {
      const nichePool = world.nicheIndex?.[acc.niche];
      const pool = nichePool && nichePool.length > 0 && chance(rng, 0.7) ? nichePool : ids;
      const target = world.accounts[pick(rng, pool)];
      if (target && target.id !== acc.id && !acc.following.includes(target.id)) {
        const attraction = profileAppeal(world, target) * (0.5 + acc.traits.ambition * 0.5);
        if (chance(rng, attraction * 0.5)) {
          follow(acc, target);
          if (target.isUser && notify) {
            pushNotification(world, { kind: 'follow', actorId: acc.id, text: 'folgt dir jetzt.' });
          }
        }
      }
    }

    // Entfolgt inaktiven oder langweiligen Accounts.
    if (acc.following.length > 12 && chance(rng, 0.25)) {
      const targetId = pick(rng, acc.following);
      const target = world.accounts[targetId];
      if (target && !target.isUser) {
        const silent = world.time - target.lastPostAt > 10 * 1440;
        if (silent || chance(rng, 0.12 * (1 - target.traits.authenticity))) {
          unfollow(acc, target);
        }
      }
    }

    // Stories halten das Profil sichtbar.
    if (world.time - acc.storyAt > 1440 && chance(rng, acc.traits.activity * 0.2)) {
      acc.storyAt = world.time;
      acc.storySeed = randInt(rng, 1, 1e9);
    }
  }

  // Natuerliche Abwanderung und Momentum-Berechnung fuer alle Accounts.
  for (const id of ids) {
    const acc = world.accounts[id];
    const followers = followerCount(acc);
    const daysSincePost = (world.time - acc.lastPostAt) / 1440;
    // Grundrauschen: Menschen raeumen ihre Abos auf, Accounts werden inaktiv.
    if (followers > 30) {
      // Grosse Accounts verlieren anteilig mehr: Karteileichen und Abo-Aufraeumen.
      const sizeChurn = BASE_CHURN_PER_DAY * (1 + clamp(Math.log10(followers / 1000) / 3, 0, 1) * 1.6);
      const lost = stochasticRound(
        makeRng(mixSeed(seedOf(acc.id), Math.floor(world.time) + 7)),
        followers * sizeChurn * (dt / 1440),
      );
      acc.crowdFollowers = Math.max(0, acc.crowdFollowers - lost);
    }
    if (daysSincePost > 3 && followers > 50) {
      // Wer nicht postet, verliert langsam an Bindung.
      const churn = stochasticRound(
        makeRng(mixSeed(seedOf(acc.id), Math.floor(world.time) + 13)),
        followers * 0.0012 * (dt / 1440) * Math.min(4, daysSincePost - 2),
      );
      acc.crowdFollowers = Math.max(0, acc.crowdFollowers - churn);
    }
    if (world.time - (acc.history[acc.history.length - 1]?.t ?? -1e9) >= 360) {
      const prev = acc.history[acc.history.length - 1];
      acc.history.push({ t: world.time, followers });
      if (acc.history.length > 180) acc.history.shift();
      if (prev) acc.momentum = ((followers - prev.followers) / Math.max(1, (world.time - prev.t) / 1440)) * 1;
    }

    if (acc.isUser) checkMilestones(world, acc, notify);
    else if (!acc.verified && followers > 120000) acc.verified = true;
  }
}

function checkMilestones(world: World, acc: Account, notify: boolean) {
  const followers = followerCount(acc);
  for (const m of MILESTONES) {
    if (followers >= m && !acc.milestones.includes(m)) {
      acc.milestones.push(m);
      if (m >= 100000 && !acc.verified) {
        acc.verified = true;
        if (notify) {
          pushNotification(world, {
            kind: 'system',
            text: 'Dein Account wurde verifiziert. Das blaue Haekchen ist jetzt aktiv.',
          });
        }
      }
      if (notify) {
        pushNotification(world, {
          kind: 'milestone',
          text: `Meilenstein erreicht: ${formatShort(m)} Follower!`,
        });
        addLog(world, 'growth', `Du hast ${formatShort(m)} Follower erreicht.`);
      }
      world.user.reputation = clamp(world.user.reputation + 0.05, 0, 1);
    }
  }
}

function checkViral(world: World, post: Post) {
  if (post.metrics.impressions > 250000 && !post.viralNotified) {
    post.viralNotified = true;
    pushNotification(world, {
      kind: 'viral',
      postId: post.id,
      text: `Dein Post geht viral: ${formatShort(post.metrics.impressions)} Aufrufe.`,
    });
    addLog(world, 'growth', `Dein Post "${getTopic(post.niche, post.topic).label}" ist viral gegangen.`);
  }
}

/** Trends entstehen, brennen und verglühen. */
function updateTrends(world: World, dt: number) {
  const rng = rngFrom(world.seed, 'trends', Math.floor(world.time / 60));
  for (const t of world.trends) {
    const age = world.time - t.startedAt;
    const phase = age / t.duration;
    // Anstieg, Plateau, Abfall
    t.heat = clamp(phase < 0.25 ? phase / 0.25 : 1 - Math.pow((phase - 0.25) / 0.75, 1.4), 0, 1);
  }
  world.trends = world.trends.filter((t) => world.time - t.startedAt < t.duration);

  const maxTrends = 5;
  if (world.trends.length < maxTrends && chance(rng, (dt / 60) * 0.18)) {
    const trend = makeTrend(world, rng);
    if (trend) world.trends.push(trend);
  }
}

export function makeTrend(world: World, rng: Rng) {
  const nicheIds = Object.keys(NICHES) as NicheId[];
  const active = new Set(world.trends.map((t) => t.tag));
  let niche = pick(rng, nicheIds);
  let tag = pick(rng, NICHES[niche].hashtags);
  // Ein Hashtag kann nicht zweimal gleichzeitig im Trend sein.
  for (let i = 0; i < 12 && active.has(tag); i++) {
    niche = pick(rng, nicheIds);
    tag = pick(rng, NICHES[niche].hashtags);
  }
  if (active.has(tag)) return null;
  return {
    tag,
    niche,
    heat: 0.1,
    startedAt: world.time,
    duration: randInt(rng, 18, 96) * 60,
    posts: randInt(rng, 400, 90000),
  };
}

/**
 * Haelt die Welt schlank: alte Beitraege fremder Accounts werden entsorgt.
 * Ohne das waechst ein Spielstand ueber das Speicherlimit des Browsers hinaus.
 */
function prune(world: World) {
  const MAX_POSTS = 1500;
  if (world.order.length <= MAX_POSTS) return;
  const keep: string[] = [];
  for (const id of world.order) {
    const post = world.posts[id];
    if (!post) continue;
    if (keep.length < MAX_POSTS || post.byUser) {
      keep.push(id);
    } else {
      const author = world.accounts[post.authorId];
      if (author) {
        const i = author.postIds.indexOf(id);
        if (i >= 0) author.postIds.splice(i, 1);
      }
      delete world.posts[id];
    }
  }
  world.order = keep;

  // Verweise des Nutzers auf geloeschte Beitraege mit aufraeumen.
  const alive = new Set(keep);
  world.active = world.active.filter((id) => alive.has(id));
  world.user.savedPosts = world.user.savedPosts.filter((id) => alive.has(id));
  world.user.likedPosts = world.user.likedPosts.filter((id) => alive.has(id));
  world.user.commentedPosts = world.user.commentedPosts.filter((id) => alive.has(id));
}
