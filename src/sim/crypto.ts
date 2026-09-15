/**
 * Verschluesselung fuer alles, was auf dem Geraet liegt.
 *
 * Wenn eine PIN gesetzt ist, wird aus ihr ein Schluessel abgeleitet
 * (PBKDF2) und damit der Spielstand, die Fotos und die Videos verschluesselt
 * (AES-GCM). Ohne die PIN sind die Daten im Browser-Speicher nur noch
 * Buchstabensalat - auch fuer jemanden, der das Geraet in die Hand bekommt.
 *
 * Die PIN selbst wird nirgends gespeichert. Es liegt nur ein kleiner
 * Pruefwert dort, an dem sich erkennen laesst, ob eine eingegebene PIN die
 * richtige ist.
 */

/** Wie aufwendig die Ableitung ist. Hoch genug, dass Durchprobieren teuer wird. */
export const PBKDF2_ITERATIONS = 310000;

export interface Sealed {
  /** Kennzeichnet einen verschluesselten Datensatz. */
  enc: 1;
  iv: Uint8Array;
  data: ArrayBuffer;
  /** Ursprungstyp, damit aus den Bytes wieder ein Bild oder Video wird. */
  type?: string;
}

/** Steht die Verschluesselung des Browsers zur Verfuegung? */
export function cryptoAvailable(): boolean {
  return typeof crypto !== 'undefined' && !!crypto.subtle && typeof TextEncoder !== 'undefined';
}

export function isSealed(value: unknown): value is Sealed {
  const v = value as Sealed | null;
  return !!v && typeof v === 'object' && (v as { enc?: unknown }).enc === 1 && !!v.iv && !!v.data;
}

export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
}

/** Leitet aus einer PIN den eigentlichen Schluessel ab. */
export async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function sealBytes(key: CryptoKey, bytes: ArrayBuffer, type?: string): Promise<Sealed> {
  const iv = randomBytes(12);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, bytes);
  return type ? { enc: 1, iv, data, type } : { enc: 1, iv, data };
}

/** Gibt null zurueck, wenn der Schluessel nicht passt - dann war es die falsche PIN. */
export async function openBytes(key: CryptoKey, sealed: Sealed): Promise<ArrayBuffer | null> {
  try {
    return await crypto.subtle.decrypt({ name: 'AES-GCM', iv: sealed.iv as BufferSource }, key, sealed.data);
  } catch {
    return null;
  }
}

export async function sealJson(key: CryptoKey, value: unknown): Promise<Sealed> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  return sealBytes(key, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
}

export async function openJson<T>(key: CryptoKey, sealed: Sealed): Promise<T | null> {
  const bytes = await openBytes(key, sealed);
  if (!bytes) return null;
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Text-Form, fuer die kleinen Werte in localStorage                    */
/* ------------------------------------------------------------------ */

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Verschluesselt einen Text zu einer Zeichenkette (IV vorne angehaengt). */
export async function sealText(key: CryptoKey, text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const sealed = await sealBytes(key, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  const body = new Uint8Array(sealed.data);
  const joined = new Uint8Array(sealed.iv.length + body.length);
  joined.set(sealed.iv, 0);
  joined.set(body, sealed.iv.length);
  return bytesToBase64(joined);
}

export async function openText(key: CryptoKey, text: string): Promise<string | null> {
  try {
    const joined = base64ToBytes(text);
    const iv = joined.slice(0, 12);
    const body = joined.slice(12);
    const bytes = await openBytes(key, {
      enc: 1,
      iv,
      data: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer,
    });
    return bytes ? new TextDecoder().decode(bytes) : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Der gerade gueltige Schluessel                                       */
/* ------------------------------------------------------------------ */

/**
 * Der abgeleitete Schluessel lebt nur im Arbeitsspeicher. Wird die App
 * gesperrt oder geschlossen, ist er weg - und die Daten sind wieder zu.
 */
let activeKey: CryptoKey | null = null;

export function getActiveKey(): CryptoKey | null {
  return activeKey;
}

export function setActiveKey(key: CryptoKey | null) {
  activeKey = key;
}
