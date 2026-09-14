/**
 * Deterministischer Zufall.
 *
 * Die komplette Welt (Accounts, Bilder, Ereignisse) laesst sich aus einem
 * einzigen Seed reproduzieren. Das macht die Simulation testbar und sorgt
 * dafuer, dass ein Bild nach dem Neuladen exakt gleich aussieht.
 */

export type Rng = () => number;

/** Mulberry32 - klein, schnell, gute Verteilung. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stabiler String-Hash (FNV-1a), fuer Seeds aus Ids/Handles. */
export function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rngFrom(...parts: (string | number)[]): Rng {
  return makeRng(hashString(parts.join('|')));
}

export function randInt(rng: Rng, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function randFloat(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

export function pickMany<T>(rng: Rng, arr: readonly T[], n: number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  const count = Math.min(n, pool.length);
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(rng() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

export function chance(rng: Rng, p: number): boolean {
  return rng() < p;
}

/** Normalverteilung (Box-Muller), fuer natuerlich streuende Eigenschaften. */
export function gauss(rng: Rng, mean = 0, sd = 1): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Normalverteilt, aber hart auf [min,max] begrenzt. */
export function gaussClamped(rng: Rng, mean: number, sd: number, min = 0, max = 1): number {
  return clamp(gauss(rng, mean, sd), min, max);
}

/**
 * Pareto-artige Verteilung - die Grundlage jeder Creator-Oekonomie:
 * wenige Accounts haben sehr viel, die meisten sehr wenig.
 */
export function powerLaw(rng: Rng, min: number, max: number, alpha = 1.35): number {
  const u = Math.max(rng(), 1e-9);
  const v = min * Math.pow(u, -1 / alpha);
  return Math.min(v, max);
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

/** Weiche 0..1-Kennlinie, um harte Schwellen zu vermeiden. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Wandelt einen Erwartungswert in eine ganze Zahl um, ohne den Mittelwert
 * zu verfaelschen: 0.3 wird in 30% der Faelle zu 1, sonst zu 0.
 */
export function stochasticRound(rng: Rng, value: number): number {
  const floor = Math.floor(value);
  return floor + (rng() < value - floor ? 1 : 0);
}
