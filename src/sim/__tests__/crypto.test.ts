import { describe, expect, it } from 'vitest';
import {
  deriveKey,
  isSealed,
  openBytes,
  openJson,
  openText,
  randomBytes,
  sealBytes,
  sealJson,
  sealText,
} from '../crypto';

/**
 * Die Verschluesselung muss zwei Dinge koennen: mit der richtigen PIN alles
 * zurueckgeben und mit einer falschen gar nichts.
 */
describe('Verschluesselung', () => {
  it('gibt einen Spielstand nur mit derselben PIN zurueck', async () => {
    const salt = randomBytes(16);
    const key = await deriveKey('1234', salt);
    const world = { user: 'ich', posts: [1, 2, 3], geheim: 'Bildunterschrift' };

    const sealed = await sealJson(key, world);
    expect(isSealed(sealed)).toBe(true);
    // Im gespeicherten Datensatz darf nichts Lesbares mehr stehen.
    expect(new TextDecoder().decode(sealed.data)).not.toContain('Bildunterschrift');

    expect(await openJson(key, sealed)).toEqual(world);

    const wrong = await deriveKey('4321', salt);
    expect(await openJson(wrong, sealed)).toBeNull();
  });

  it('haelt ein Foto zusammen und gibt seinen Typ zurueck', async () => {
    const key = await deriveKey('geheim!', randomBytes(16));
    const pixels = randomBytes(2048);
    const sealed = await sealBytes(key, pixels.buffer as ArrayBuffer, 'image/jpeg');

    expect(sealed.type).toBe('image/jpeg');
    const back = await openBytes(key, sealed);
    expect(back).not.toBeNull();
    expect(new Uint8Array(back!)).toEqual(pixels);
  });

  it('verschluesselt denselben Inhalt jedes Mal anders', async () => {
    const key = await deriveKey('1234', randomBytes(16));
    const a = await sealText(key, 'sk-ant-beispiel');
    const b = await sealText(key, 'sk-ant-beispiel');
    expect(a).not.toBe(b);
    expect(await openText(key, a)).toBe('sk-ant-beispiel');
    expect(await openText(key, b)).toBe('sk-ant-beispiel');
  });

  it('meldet Fehler statt zu raten, wenn der Text beschaedigt ist', async () => {
    const key = await deriveKey('1234', randomBytes(16));
    const sealed = await sealText(key, 'geheim');
    const broken = `${sealed.slice(0, -4)}AAAA`;
    expect(await openText(key, broken)).toBeNull();
  });

  it('leitet aus demselben Salz und derselben PIN denselben Schluessel ab', async () => {
    const salt = randomBytes(16);
    const first = await deriveKey('9999', salt);
    const second = await deriveKey('9999', salt);
    const sealed = await sealText(first, 'hallo');
    expect(await openText(second, sealed)).toBe('hallo');
  });
});
