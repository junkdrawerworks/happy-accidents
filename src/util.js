export const TAU = Math.PI * 2;

export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
export const pick = (list) => list[Math.floor(Math.random() * list.length)];
export const chance = (p) => Math.random() < p;
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => t * t * (3 - 2 * t);

export function gauss() {
  let u = 0;
  let v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

// entries: [[value, weight], ...]
export function weighted(entries) {
  let total = 0;
  for (const [, w] of entries) total += Math.max(0, w);
  if (total <= 0) return entries[0][0];
  let r = Math.random() * total;
  for (const [value, w] of entries) {
    r -= Math.max(0, w);
    if (r <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

// Like pick(), but avoids repeating the last few choices made under the same key. It remembers all but one choice of a
// list of three or fewer, and all but two of a longer one (nine at most). So from four on there are always two or more
// to pick from, and the order never settles into a loop (remembering all but one played a list of up to seven as
// A B C D A B C D forever), while a choice still doesn't come round again for as many picks as the list has, less one:
// ten for a list of eleven.
const recent = new Map();
const memory = (n) => (n <= 3 ? n - 1 : Math.min(9, n - 2));
export function pickFresh(key, list) {
  if (!list || !list.length) return '';
  const seen = recent.get(key) || [];
  const pool = list.filter((item) => !seen.includes(item));
  const choice = pick(pool.length ? pool : list);
  seen.push(choice);
  while (seen.length > memory(list.length)) seen.shift();
  recent.set(key, seen);
  return choice;
}

// A file name from a title: lower case, accents taken off (Café becomes cafe), every letter and digit kept in any script,
// and anything else between them made one hyphen. Only the accents that sit on Latin, Greek and Cyrillic letters come
// off; the vowel signs of scripts like Devanagari are part of the word and stay.
export function slug(text) {
  const words = String(text)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return [...words].slice(0, 60).join('').replace(/-+$/, '') || 'happy-accident';
}
