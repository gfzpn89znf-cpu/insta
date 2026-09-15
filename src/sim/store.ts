import { useSyncExternalStore } from 'react';
import { tick } from './engine';
import { processChatReplies } from './chat';
import { clearWorld, loadWorld, onSaveProblem, saveWorld, type SaveListener } from './persistence';
import { beginWorld, type UserProfile } from './world';
import type { World } from './types';

/** Echtzeit-Intervall der Simulationsschleife. */
const LOOP_MS = 1000;
/** Maximale Simulationszeit, die nach einer Pause nachgeholt wird (Minuten). */
const MAX_CATCHUP = 3 * 24 * 60;
const SAVE_EVERY_MS = 15000;

let world: World | null = null;
let version = 0;
let timer: number | undefined;
let lastSave = 0;
const listeners = new Set<() => void>();

function emit() {
  version += 1;
  for (const l of listeners) l();
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getVersion() {
  return version;
}

export function getWorld(): World | null {
  return world;
}

/** Aenderungen an der Welt immer hierueber - so erfaehrt die Oberflaeche davon. */
export function dispatch<T>(fn: (w: World) => T): T | undefined {
  if (!world) return undefined;
  const result = fn(world);
  emit();
  return result;
}

export type Progress = (value: number) => void;

/** Laesst den Browser zwischen zwei Rechenhaeppchen zeichnen. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

/**
 * Baut eine neue Welt auf. Die Vorgeschichte wird in Haeppchen gerechnet,
 * damit die Fortschrittsanzeige laeuft und die Seite bedienbar bleibt.
 */
export async function startNewWorld(
  profile: UserProfile,
  seed = Math.floor(Math.random() * 1e9),
  onProgress?: Progress,
): Promise<World> {
  const build = beginWorld(seed, profile);
  onProgress?.(0);
  while (!build.done) {
    build.step();
    onProgress?.(build.progress);
    await nextFrame();
  }
  world = build.world;
  void saveWorld(world);
  emit();
  startLoop();
  return world;
}

/** Laedt einen gespeicherten Stand und holt die verstrichene Zeit nach. */
export async function resumeWorld(onProgress?: Progress): Promise<World | null> {
  const loaded = await loadWorld();
  if (!loaded) return null;
  world = loaded;
  const elapsedRealMs = Math.max(0, Date.now() - (loaded.realTime ?? Date.now()));
  const simMinutes = Math.min(MAX_CATCHUP, (elapsedRealMs / 1000) * loaded.settings.speed);

  // Waehrend der Abwesenheit lief die Welt weiter - auch das in Haeppchen,
  // damit das Laden eines alten Spielstands nicht haengt.
  if (simMinutes > 1 && !loaded.settings.paused) {
    const chunk = 6 * 60;
    let done = 0;
    while (done < simMinutes) {
      const step = Math.min(chunk, simMinutes - done);
      tick(world, step, { sample: true, notify: true });
      done += step;
      onProgress?.(done / simMinutes);
      if (done < simMinutes) await nextFrame();
    }
  }
  onProgress?.(1);
  world.realTime = Date.now();
  emit();
  startLoop();
  return world;
}

export async function resetWorld() {
  stopLoop();
  await clearWorld();
  world = null;
  emit();
}

export function startLoop() {
  if (timer !== undefined) return;
  timer = window.setInterval(() => {
    if (!world) return;

    // Antworten in Unterhaltungen haengen an der echten Uhr - ein Gespraech
    // laeuft also auch weiter, wenn die Simulation pausiert ist.
    let changed = processChatReplies(world);

    if (!world.settings.paused) {
      const minutes = (world.settings.speed * LOOP_MS) / 1000;
      tick(world, minutes, { sample: true, notify: true });
      changed = true;
    }

    if (!changed) return;
    if (Date.now() - lastSave > SAVE_EVERY_MS) {
      lastSave = Date.now();
      void saveWorld(world);
    }
    emit();
  }, LOOP_MS);
}

export function stopLoop() {
  if (timer !== undefined) {
    window.clearInterval(timer);
    timer = undefined;
  }
}

/** Meldung weiterreichen, falls der Browser-Speicher knapp wird. */
export function setSaveListener(fn: SaveListener | undefined) {
  onSaveProblem(fn);
}

export function saveNow() {
  if (world) {
    lastSave = Date.now();
    void saveWorld(world);
  }
}

export function setSpeed(speed: number) {
  dispatch((w) => {
    w.settings.speed = speed;
    w.settings.paused = speed === 0;
  });
}

/** React-Anbindung: liefert die Welt und rendert bei jeder Aenderung neu. */
export function useWorld(): World | null {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return world;
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', saveNow);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveNow();
  });
}
