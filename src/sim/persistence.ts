import { getActiveKey } from './crypto';
import { dbClearWorld, dbGetWorld, dbPutWorld } from './db';
import { rebuildIndex, WORLD_VERSION } from './world';
import type { World } from './types';

const LEGACY_KEY = 'fotogram.world.v1';

/** Meldet sich, wenn der Speicher des Browsers nicht mehr ausreicht. */
export type SaveListener = (ok: boolean, message?: string) => void;
let listener: SaveListener | undefined;

export function onSaveProblem(fn: SaveListener | undefined) {
  listener = fn;
}

/** Entfernt alles, was nicht gespeichert werden muss oder darf. */
function toStorable(world: World): World {
  const { nicheIndex: _index, ...rest } = world;
  void _index;
  return { ...rest, realTime: Date.now() } as World;
}

/**
 * Speichert den Spielstand. Bevorzugt IndexedDB - dort gibt es genug Platz
 * fuer Fotos und grosse Welten. Wenn das nicht geht, bleibt localStorage als
 * Rueckfallebene, notfalls mit verkleinertem Stand.
 */
export async function saveWorld(world: World): Promise<boolean> {
  const payload = toStorable(world);
  if (await dbPutWorld(payload)) return true;

  // Mit gesetzter PIN gibt es keinen Klartext-Rueckfall: lieber kein
  // Speicherstand als ein offen lesbarer.
  if (getActiveKey()) {
    listener?.(false, 'Der Spielstand konnte nicht verschluesselt gespeichert werden.');
    return false;
  }

  try {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(payload));
    return true;
  } catch {
    try {
      localStorage.setItem(LEGACY_KEY, JSON.stringify(slimDown(payload)));
      listener?.(true, 'Spielstand wurde verkleinert gespeichert.');
      return true;
    } catch (err) {
      console.warn('Speichern fehlgeschlagen', err);
      listener?.(false, 'Der Speicher ist voll - der Spielstand konnte nicht gesichert werden.');
      return false;
    }
  }
}

export async function loadWorld(): Promise<World | null> {
  let world = await dbGetWorld<World>();

  // Aeltere Staende lagen in localStorage - einmalig uebernehmen.
  if (!world) {
    try {
      const raw = localStorage.getItem(LEGACY_KEY);
      if (raw) {
        world = JSON.parse(raw) as World;
        if (world && world.version === WORLD_VERSION && (await dbPutWorld(toStorable(world)))) {
          localStorage.removeItem(LEGACY_KEY);
        }
      }
    } catch (err) {
      console.warn('Laden fehlgeschlagen', err);
      return null;
    }
  }

  if (!world || world.version !== WORLD_VERSION || !world.accounts) return null;

  // Fehlende Felder aelterer Staende ergaenzen.
  world.attention ??= { demand: 0, rate: 0, factor: 1 };
  world.log ??= [];
  world.threadOrder ??= [];
  world.threads ??= {};
  world.active ??= [];
  rebuildActive(world);
  rebuildIndex(world);
  return world;
}

/** Stellt die Liste der noch ausgespielten Beitraege wieder her. */
function rebuildActive(world: World) {
  const ACTIVE_WINDOW = 72 * 60;
  world.active = world.order.filter((id) => {
    const p = world.posts[id];
    return p && !p.done && world.time - p.createdAt <= ACTIVE_WINDOW;
  });
}

export async function clearWorld(): Promise<void> {
  await dbClearWorld();
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignorieren */
  }
}

export async function hasSave(): Promise<boolean> {
  if (await dbGetWorld<World>()) return true;
  try {
    return localStorage.getItem(LEGACY_KEY) !== null;
  } catch {
    return false;
  }
}

/** Erzeugt eine platzsparende Kopie der Welt fuer den Notfall. */
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
      : {
          ...acc,
          history: acc.history.slice(-40),
          realFollowers: acc.realFollowers.slice(-300),
          postIds: acc.postIds.filter((pid) => posts[pid]),
        };
  }
  return { ...world, posts, order, accounts, notifications: world.notifications.slice(0, 120) };
}
