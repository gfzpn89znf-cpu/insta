import { NICHES } from './niches';
import { pick, randInt, chance, type Rng } from './rng';
import type { NicheId } from './types';

const FIRST_NAMES = [
  'Lena', 'Jonas', 'Mia', 'Luca', 'Emma', 'Noah', 'Hannah', 'Ben', 'Sofia', 'Leon',
  'Marie', 'Paul', 'Lina', 'Elias', 'Clara', 'Finn', 'Amelie', 'Felix', 'Nora', 'Max',
  'Jana', 'Tim', 'Laura', 'Nico', 'Julia', 'David', 'Sarah', 'Jan', 'Anna', 'Moritz',
  'Pia', 'Tom', 'Greta', 'Simon', 'Ida', 'Erik', 'Frieda', 'Oskar', 'Merle', 'Levi',
  'Yara', 'Samir', 'Aylin', 'Deniz', 'Zoe', 'Malik', 'Nele', 'Timo', 'Charlotte', 'Jakob',
  'Ella', 'Milan', 'Romy', 'Kian', 'Jule', 'Fabian', 'Melina', 'Robin', 'Alina', 'Til',
  'Mara', 'Anton', 'Selin', 'Emil', 'Leonie', 'Henry', 'Nina', 'Marco', 'Svenja', 'Jannik',
];

const LAST_NAMES = [
  'Meier', 'Schmidt', 'Weber', 'Hoffmann', 'Koch', 'Wagner', 'Becker', 'Schulz', 'Richter', 'Klein',
  'Wolf', 'Neumann', 'Braun', 'Krueger', 'Hartmann', 'Lange', 'Werner', 'Krause', 'Lehmann', 'Koehler',
  'Herrmann', 'Walter', 'Maier', 'Kaiser', 'Fuchs', 'Peters', 'Lang', 'Scholz', 'Jung', 'Moeller',
  'Berg', 'Sommer', 'Winter', 'Vogel', 'Roth', 'Frank', 'Keller', 'Graf', 'Busch', 'Baum',
  'Yilmaz', 'Demir', 'Kowalski', 'Novak', 'Rossi', 'Silva', 'Nguyen', 'Petrov', 'Ivanov', 'Haddad',
];

const HANDLE_WORDS: Record<NicheId, string[]> = {
  fitness: ['fit', 'iron', 'lift', 'gains', 'strong', 'move', 'pump', 'coach'],
  food: ['kitchen', 'bites', 'hungry', 'cooks', 'tasty', 'loeffel', 'pfanne', 'foodie'],
  travel: ['travels', 'nomad', 'wander', 'unterwegs', 'faraway', 'roadtrip', 'fernweh', 'maps'],
  fashion: ['style', 'wardrobe', 'thread', 'looks', 'fits', 'mode', 'vintage', 'closet'],
  art: ['draws', 'paints', 'studio', 'ink', 'canvas', 'atelier', 'sketch', 'colors'],
  photo: ['shots', 'lens', 'frames', 'foto', 'capture', 'analog', 'light', 'visuals'],
  tech: ['builds', 'bytes', 'dev', 'setup', 'code', 'tech', 'lab', 'stack'],
  gaming: ['plays', 'gg', 'clutch', 'pixel', 'quest', 'respawn', 'loot', 'arcade'],
  music: ['sounds', 'beats', 'tunes', 'records', 'studio', 'audio', 'wave', 'noise'],
  pets: ['paws', 'fell', 'tails', 'woof', 'katzen', 'hund', 'pfoten', 'snout'],
  beauty: ['glow', 'skin', 'beauty', 'blush', 'care', 'lips', 'routine', 'shine'],
  lifestyle: ['daily', 'slow', 'living', 'alltag', 'habits', 'calm', 'ordnung', 'balance'],
  cars: ['drives', 'garage', 'motor', 'wrench', 'boost', 'autos', 'schrauber', 'lane'],
  nature: ['outdoors', 'wald', 'trails', 'wild', 'berge', 'draussen', 'green', 'roam'],
  comedy: ['laughs', 'jokes', 'memes', 'witz', 'humor', 'satire', 'lol', 'sketch'],
  dance: ['moves', 'dance', 'steps', 'flow', 'rhythm', 'stage', 'tanzt', 'beatwork'],
};

const SUFFIXES = ['', '', '', '_', '.', 'official', 'de', 'hd', '01', '99', '_x', 'tv'];

/** Erzeugt einen plausiblen, eindeutigen Handle. */
export function makeHandle(rng: Rng, first: string, last: string, niche: NicheId, taken: Set<string>): string {
  const f = normalize(first);
  const l = normalize(last);
  const word = pick(rng, HANDLE_WORDS[niche]);
  const patterns: (() => string)[] = [
    () => `${f}.${l}`,
    () => `${f}_${l}`,
    () => `${f}${l}`,
    () => `${f}.${word}`,
    () => `${f}_${word}`,
    () => `${word}.${f}`,
    () => `${f}${randInt(rng, 2, 99)}`,
    () => `${f}${word}`,
    () => `its.${f}`,
    () => `${f}.${l[0]}`,
    () => `the.${word}.${f}`,
    () => `${word}${randInt(rng, 10, 99)}`,
  ];
  for (let attempt = 0; attempt < 40; attempt++) {
    let h = pick(rng, patterns)();
    if (attempt > 6 || chance(rng, 0.2)) h += pick(rng, SUFFIXES);
    h = h.replace(/[^a-z0-9._]/g, '').slice(0, 24);
    if (h.length >= 4 && !taken.has(h)) {
      taken.add(h);
      return h;
    }
  }
  let i = 2;
  while (taken.has(`${f}.${l}${i}`)) i++;
  const fallback = `${f}.${l}${i}`;
  taken.add(fallback);
  return fallback;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');
}

export function makeName(rng: Rng): { first: string; last: string; display: string } {
  const first = pick(rng, FIRST_NAMES);
  const last = pick(rng, LAST_NAMES);
  const display = chance(rng, 0.78) ? `${first} ${last}` : first;
  return { first, last, display };
}

export function makeBio(rng: Rng, niche: NicheId, secondary: NicheId): string {
  const base = pick(rng, NICHES[niche].bios);
  if (chance(rng, 0.35)) {
    return `${base} | ${NICHES[secondary].emoji} ${NICHES[secondary].label}`;
  }
  return base;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export { normalize as normalizeHandle };
