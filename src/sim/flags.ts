/**
 * Die Privatsphaere-Schalter - bewusst ohne Abhaengigkeiten, damit jede
 * Stelle, die etwas nach draussen schicken will, hier nachfragen kann.
 */

const OFFLINE_KEY = 'fotogram.privacy.offline';
const VISION_KEY = 'fotogram.privacy.vision';
const AUTOLOCK_KEY = 'fotogram.lock.minutes';

export interface PrivacySettings {
  /** Kein einziger Zugriff nach draussen - alles rechnet und zeichnet die App selbst. */
  offline: boolean;
  /** Duerfen eigene Fotos und Videostandbilder zur Bilderkennung an die KI? */
  shareImages: boolean;
  /** Nach wie vielen Minuten im Hintergrund wieder gesperrt wird. 0 = sofort. */
  autoLockMinutes: number;
}

export const AUTOLOCK_CHOICES = [0, 1, 5, 15, 60] as const;

function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function write(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* ignorieren */
  }
}

const listeners = new Set<() => void>();

export function onPrivacyChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function notifyPrivacy() {
  for (const fn of listeners) fn();
}

export function getPrivacy(): PrivacySettings {
  const stored = read(AUTOLOCK_KEY);
  return {
    offline: read(OFFLINE_KEY) === '1',
    // Bilder gehen nur nach ausdruecklicher Zustimmung raus - Vorgabe: aus.
    shareImages: read(VISION_KEY) === '1',
    autoLockMinutes: stored === '' ? 5 : Math.max(0, Number(stored) || 0),
  };
}

export function setPrivacy(patch: Partial<PrivacySettings>) {
  if (patch.offline !== undefined) write(OFFLINE_KEY, patch.offline ? '1' : '');
  if (patch.shareImages !== undefined) write(VISION_KEY, patch.shareImages ? '1' : '');
  if (patch.autoLockMinutes !== undefined) write(AUTOLOCK_KEY, String(patch.autoLockMinutes));
  notifyPrivacy();
}

/** Kurzform fuer alle Stellen, die etwas aus dem Netz holen wollen. */
export function networkAllowed(): boolean {
  return !getPrivacy().offline;
}
