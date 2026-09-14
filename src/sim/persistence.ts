import { rebuildIndex, WORLD_VERSION } from './world';
import type { World } from './types';

const KEY = 'fotogram.world.v1';

/** Meldet sich, wenn der Speicher des Browsers nicht mehr ausreicht. */
export type SaveListener = (ok: boolean, message?: string) => void;
let listener: SaveListener | undefined;

export function onSaveProblem(fn: SaveListener | undefined) {
  listener = fn;
}

/**
 * Speichert die Welt im Browser. Der Laufzeit-Index wird nicht mitgespeichert.
 * Reicht der Platz nicht, wird ein verkleinerter Stand geschrieben, statt den
 * Spielstand ganz zu verlieren.
 */
export function saveWorld(world: World): boolean {
  const { nicheIndex: _index, ...rest } = world;
  void _index;
  const payload = { ...rest, realTime: Date.now() };
  try {
    localStorage.setItem(KEY, JSON.stringify(payload));
    return true;
  } catch {
    // Zweiter Versuch mit reduziertem Umfang: fremde Beitraege aelter als
    // zwei Tage fliegen raus, eigene bleiben vollstaendig erhalten.
    try {
        const slim = slimDown(payload as World);
      localStorage.setItem(KEY, JSON.stringify(slim));
      listener?.(true, 'Spielstand wurde verkleinert gespeichert.');
      return true;
    } catch (err) {
      console.warn('Speichern fehlgeschlagen', err);
      listener?.(false, 'Der Browser-Speicher ist voll - der Spielstand konnte nicht gesichert werden.');
      return false;
    }
  }
}

/** Erzeugt eine platzsparende Kopie der Welt. */
function slimDown(world: World): World {
  const cutoff = world.time - 2 * 1440;
  const posts: World['posts'] = {};
  const order: string[] = [];
  for (const id of world.order) {
    const p = world.posts[id];
    if (!p) continue;
    if (!p.byUser && p.createdAt < cutoff) continue;
    posts[id] = p.byUser ? p : { ...p, likedBy: p.likedBy.slice(0, 3), commentList: p.commentList.slice(-3) };
    order.push(id);
  }
  const accounts: World['accounts'] = {};
  for (const [id, acc] of Object.entries(world.accounts)) {
    accounts[id] = acc.isUser
      ? acc
      : { ...acc, history: acc.history.slice(-40), realFollowers: acc.realFollowers.slice(-300), postIds: acc.postIds.filter((pid) => posts[pid]) };
  }
  return { ...world, posts, order, accounts, notifications: world.notifications.slice(0, 120) };
}

export function loadWorld(): World | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const world = JSON.parse(raw) as World;
    if (!world || world.version !== WORLD_VERSION || !world.accounts) return null;
    // Aeltere Staende koennen Felder fehlen - defensiv auffuellen.
    world.attention ??= { demand: 0, rate: 0, factor: 1 };
    world.log ??= [];
    world.threadOrder ??= [];
    world.threads ??= {};
    rebuildActive(world);
    rebuildIndex(world);
    return world;
  } catch (err) {
    console.warn('Laden fehlgeschlagen', err);
    return null;
  }
}

/** Stellt die Liste der noch ausgespielten Beitraege wieder her. */
function rebuildActive(world: World) {
  const ACTIVE_WINDOW = 72 * 60;
  world.active = world.order.filter((id) => {
    const p = world.posts[id];
    return p && !p.done && world.time - p.createdAt <= ACTIVE_WINDOW;
  });
}

export function clearWorld() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignorieren */
  }
}

export function hasSave(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}
