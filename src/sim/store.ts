import { useSyncExternalStore } from 'react';
import { tick } from './engine';
import { clearWorld, loadWorld, onSaveProblem, saveWorld, type SaveListener } from './persistence';
import { createWorld, type UserProfile } from './world';
import type { World } from './types';

/** Echtzeit-Intervall der Simulationsschleife. */
const LOOP_MS = 1000;
/** Maximale Simulationszeit, die nach einer Pause nachgeholt wird (Minuten). */
const MAX_CATCHUP = 3 * 24 * 60;
const SAVE_EVERY_MS = 8000;

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

export function startNewWorld(profile: UserProfile, seed = Math.floor(Math.random() * 1e9)) {
  world = createWorld(seed, profile);
  saveWorld(world);
  emit();
  startLoop();
  return world;
}

/** Laedt einen gespeicherten Stand und holt die verstrichene Zeit nach. */
export function resumeWorld(): World | null {
  const loaded = loadWorld();
  if (!loaded) return null;
  world = loaded;
  const elapsedRealMs = Math.max(0, Date.now() - (loaded.realTime ?? Date.now()));
  const simMinutes = Math.min(MAX_CATCHUP, (elapsedRealMs / 1000) * loaded.settings.speed);
  if (simMinutes > 1 && !loaded.settings.paused) {
    // Waehrend der Abwesenheit lief die Welt weiter - inklusive Benachrichtigungen.
    tick(world, simMinutes, { sample: true, notify: true });
  }
  world.realTime = Date.now();
  emit();
  startLoop();
  return world;
}

export function resetWorld() {
  stopLoop();
  clearWorld();
  world = null;
  emit();
}

export function startLoop() {
  if (timer !== undefined) return;
  timer = window.setInterval(() => {
    if (!world || world.settings.paused) return;
    const minutes = (world.settings.speed * LOOP_MS) / 1000;
    tick(world, minutes, { sample: true, notify: true });
    if (Date.now() - lastSave > SAVE_EVERY_MS) {
      saveWorld(world);
      lastSave = Date.now();
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
    saveWorld(world);
    lastSave = Date.now();
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
