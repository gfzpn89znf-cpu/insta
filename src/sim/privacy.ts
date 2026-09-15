import {
  cryptoAvailable,
  deriveKey,
  getActiveKey,
  openText,
  randomBytes,
  sealText,
  setActiveKey,
  bytesToBase64,
  base64ToBytes,
} from './crypto';
import { dbRekey, dbWipe } from './db';
import { notifyPrivacy, onPrivacyChange } from './flags';
import { forgetApiKey, loadApiKey, protectApiKey, unprotectApiKey } from './ai';

/**
 * Sicherheit und Privatsphaere.
 *
 * Zwei Dinge stecken hier drin:
 *
 * 1. Die Bildschirmsperre. Ist eine PIN gesetzt, liegen Spielstand, Fotos
 *    und Videos nur verschluesselt auf dem Geraet und die App zeigt ohne PIN
 *    gar nichts an.
 * 2. Die Schalter dafuer, was ueberhaupt das Geraet verlassen darf.
 *
 * Die PIN wird nie gespeichert. Gespeichert wird nur ein zufaelliges Salz
 * und ein verschluesselter Pruefsatz - passt er nach dem Entschluesseln, war
 * die PIN richtig.
 */

const SALT_KEY = 'fotogram.lock.salt';
const CHECK_KEY = 'fotogram.lock.check';
const CHECK_PHRASE = 'fotogram-lock-ok';

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

const notify = notifyPrivacy;

export { onPrivacyChange };
export { getPrivacy, setPrivacy, networkAllowed, AUTOLOCK_CHOICES } from './flags';
export type { PrivacySettings } from './flags';

/* ------------------------------------------------------------------ */
/* Sperre                                                              */
/* ------------------------------------------------------------------ */

export type LockState = 'off' | 'locked' | 'open';

let unlocked = false;

export function lockAvailable(): boolean {
  return cryptoAvailable();
}

export function hasLock(): boolean {
  return read(SALT_KEY) !== '' && read(CHECK_KEY) !== '';
}

export function lockState(): LockState {
  if (!hasLock()) return 'off';
  return unlocked && getActiveKey() ? 'open' : 'locked';
}

/** Mindestlaenge einer PIN. Vier Ziffern sind auf dem Handy die Gewohnheit. */
export const MIN_PIN = 4;

/**
 * Setzt eine PIN. Alles, was schon gespeichert ist, wird dabei
 * verschluesselt neu geschrieben.
 */
export async function setPin(pin: string): Promise<{ ok: boolean; message: string }> {
  if (!cryptoAvailable()) return { ok: false, message: 'Dieser Browser kann nicht verschluesseln.' };
  if (pin.length < MIN_PIN) return { ok: false, message: `Mindestens ${MIN_PIN} Zeichen.` };
  if (hasLock() && !unlocked) return { ok: false, message: 'Erst entsperren.' };

  const previous = getActiveKey();
  const salt = randomBytes(16);
  let key: CryptoKey;
  try {
    key = await deriveKey(pin, salt);
  } catch {
    return { ok: false, message: 'Die PIN konnte nicht verarbeitet werden.' };
  }

  if (!(await dbRekey(previous, key))) {
    return { ok: false, message: 'Die vorhandenen Daten liessen sich nicht verschluesseln.' };
  }

  write(SALT_KEY, bytesToBase64(salt));
  write(CHECK_KEY, await sealText(key, CHECK_PHRASE));
  setActiveKey(key);
  unlocked = true;

  // Der KI-Schluessel und der alte Klartext-Spielstand duerfen nicht offen liegen bleiben.
  await protectApiKey(key);
  write('fotogram.world.v1', '');
  notify();
  return { ok: true, message: 'Die App ist jetzt mit deiner PIN gesichert.' };
}

/** Prueft eine eingegebene PIN und gibt bei Erfolg die Daten frei. */
export async function unlockWithPin(pin: string): Promise<boolean> {
  if (!hasLock() || !cryptoAvailable()) return false;
  let key: CryptoKey;
  try {
    key = await deriveKey(pin, base64ToBytes(read(SALT_KEY)));
  } catch {
    return false;
  }
  const check = await openText(key, read(CHECK_KEY));
  if (check !== CHECK_PHRASE) return false;

  setActiveKey(key);
  unlocked = true;
  await loadApiKey(key);
  notify();
  return true;
}

/** Sperrt sofort. Der Schluessel verlaesst den Arbeitsspeicher. */
export function lockNow() {
  if (!hasLock()) return;
  setActiveKey(null);
  unlocked = false;
  forgetApiKey();
  notify();
}

/** Nimmt die Sperre weg - die Daten liegen danach wieder unverschluesselt da. */
export async function removePin(): Promise<{ ok: boolean; message: string }> {
  if (!hasLock()) return { ok: true, message: 'Es war keine PIN gesetzt.' };
  const key = getActiveKey();
  if (!unlocked || !key) return { ok: false, message: 'Erst entsperren.' };

  if (!(await dbRekey(key, null))) {
    return { ok: false, message: 'Die Daten liessen sich nicht zurueckwandeln.' };
  }
  await unprotectApiKey(key);
  write(SALT_KEY, '');
  write(CHECK_KEY, '');
  setActiveKey(null);
  unlocked = false;
  notify();
  return { ok: true, message: 'Die PIN wurde entfernt.' };
}

/**
 * Loescht wirklich alles: Spielstand, Fotos, Videos, PIN, KI-Schluessel und
 * jede Einstellung. Danach ist auf dem Geraet nichts mehr von Fotogram da.
 */
export async function wipeEverything(): Promise<void> {
  setActiveKey(null);
  unlocked = false;
  forgetApiKey();
  await dbWipe();
  // Auch der Bild-Zwischenspeicher des Browsers muss weg.
  try {
    if (typeof caches !== 'undefined') {
      for (const name of await caches.keys()) {
        if (name.includes('foto')) await caches.delete(name);
      }
    }
  } catch {
    /* ignorieren */
  }
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('fotogram.')) localStorage.removeItem(key);
    }
  } catch {
    /* ignorieren */
  }
  notify();
}
