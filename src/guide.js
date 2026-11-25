// The field guide: the README's two rules tables as a collection. Every outcome in them starts as a blank outline and is
// named once you've made it yourself in this browser (paint you threw, not an accident Oops or Let it happen threw).
// decide() marks each plan with the cell it came from (plan.cell): a paint and a place for the first table, or what it
// hit and with which paint for the second. findOf() reads a step of that plan, once it's painted, as one outcome.

// The first table: what each paint becomes, by where it lands. Each outcome's kinds are the painted things that count
// as it (a cloud the painter calls a storm cloud counts as storm).
export const PLACES = [
  ['high', 'High in the sky'],
  ['low', 'Low in the sky'],
  ['lake', 'On the lake'],
  ['land', 'On land'],
];

const o = (id, name, kinds = [id]) => ({ id, name, kinds: [].concat(kinds) });
const sunOrMoon = ['sun', 'moon'];
const ground = ['bank', 'island'];

export const PAINTS = [
  {
    fam: 'white',
    name: 'White',
    swatch: '#f4f2ea',
    high: [o('cloud', 'a white cloud'), o('sun', 'the sun or moon', sunOrMoon), o('stars', 'stars at night')],
    low: [o('mountain', 'a snowy mountain'), o('cloud', 'a cloud')],
    lake: [o('sailboat', 'a sailboat'), o('light', 'light on the water', ['glints', 'ripples'])],
    land: [o('pine', 'a snowy pine', 'evergreen'), o('birch', 'a birch', 'deciduous'), o('cabin', 'a white cabin'), o('flowers', 'flowers')],
  },
  {
    fam: 'yellow',
    name: 'Yellow',
    swatch: '#f2c21a',
    high: [o('sun', 'the sun, or the moon at night', sunOrMoon), o('cloud', 'golden clouds')],
    low: [o('sun', 'the sun, or the moon at night', sunOrMoon), o('cloud', 'golden clouds'), o('mountain', 'a golden mountain')],
    lake: [o('glints', 'glints of light'), o('land', 'land', ground), o('rock', 'a rock')],
    land: [o('tree', 'a golden tree', 'deciduous'), o('bush', 'a golden bush'), o('flowers', 'flowers')],
  },
  {
    fam: 'red',
    name: 'Red',
    swatch: '#c9321f',
    high: [o('cloud', 'a sunset cloud')],
    low: [o('mountain', 'a red-rock mountain'), o('cloud', 'a sunset cloud')],
    lake: [o('canoe', 'a canoe'), o('glints', 'glints, once there are three')],
    land: [o('tree', 'a red tree', 'deciduous'), o('bush', 'a red bush'), o('cabin', 'a red cabin'), o('flowers', 'flowers')],
  },
  {
    fam: 'green',
    name: 'Green',
    swatch: '#3f5c23',
    high: [o('pine', 'the top of a tall pine', 'evergreen'), o('far', 'far-off trees', 'treeline'), o('aurora', 'an aurora at night')],
    low: [o('mountain', 'a wooded mountain')],
    lake: [o('land', 'land', 'bank'), o('island', 'an island'), o('rock', 'a mossy rock')],
    land: [o('pine', 'a pine', 'evergreen'), o('tree', 'a leafy tree', 'deciduous'), o('bush', 'a bush')],
  },
  {
    fam: 'blue',
    name: 'Blue',
    swatch: '#15418a',
    high: [o('cloud', 'a cool cloud'), o('storm', 'a storm, from Prussian Blue')],
    low: [o('mountain', 'a blue mountain'), o('cloud', 'a cool cloud')],
    lake: [o('ripples', 'ripples'), o('loons', 'a pair of loons')],
    land: [o('spruce', 'a blue spruce', 'evergreen'), o('flowers', 'flowers')],
  },
  {
    fam: 'brown',
    name: 'Brown',
    swatch: '#3e2b1d',
    high: [o('storm', 'a storm cloud'), o('birds', 'birds')],
    low: [o('mountain', 'a mountain'), o('storm', 'a storm cloud')],
    lake: [o('land', 'land', ground), o('rock', 'a rock'), o('dock', 'a dock'), o('loons', 'a pair of loons')],
    land: [o('cabin', 'a cabin'), o('tree', 'a bare tree', 'deciduous'), o('bush', 'a bush')],
  },
];

// The second table, row by row: what was hit, with what, and what that can do. hit and with are the README's words.
export const HITS = [
  { id: 'tree-white', hit: 'a tree', with: 'white', outcomes: [o('snow', 'snow settles on it')] },
  { id: 'evergreen-warm', hit: 'an evergreen', with: 'yellow or red', outcomes: [o('light', 'late light catches its side'), o('moon', 'moonlight, at night')] },
  { id: 'leafy-warm', hit: 'a leafy tree or bush', with: 'yellow or red', outcomes: [o('autumn', 'it turns to autumn')] },
  { id: 'tree-other', hit: 'a tree', with: 'anything else', outcomes: [o('friend', 'a friend grows next to it'), o('light', 'light catches it, once')] },
  {
    id: 'mountain',
    hit: 'a mountain',
    with: 'white / blue / yellow or red / green',
    outcomes: [o('snow', 'fresh snow'), o('falls', 'a waterfall'), o('mist', 'mist, right at its foot'), o('glow', 'alpenglow'), o('trees', 'trees up the slope')],
  },
  { id: 'mountain-other', hit: 'a mountain', with: 'anything else', outcomes: [o('trees', 'trees up the slope'), o('mist', 'a drift of mist')] },
  { id: 'sun-warm', hit: 'the sun or moon', with: 'warm or white', outcomes: [o('sunset', 'the sky warms into a sunset'), o('moon', 'the sky lights up around the moon')] },
  { id: 'sun-other', hit: 'the sun or moon', with: 'anything else', outcomes: [o('cloud', 'a cloud drifts across it')] },
  {
    id: 'cloud-dark',
    hit: 'a cloud',
    with: 'something dark',
    outcomes: [o('rain', 'it turns stormy and rains'), o('snow', 'it snows, in Winter Hush'), o('storm', 'only stormy, once four are raining')],
  },
  { id: 'cloud-warm', hit: 'a cloud', with: 'yellow or red', outcomes: [o('lit', 'its edges catch the light')] },
  { id: 'cabin', hit: 'the cabin', with: 'white / warm / anything', outcomes: [o('snow', 'snow on the roof'), o('lights', 'the lights come on'), o('garden', 'a garden')] },
  { id: 'rock', hit: 'a rock', with: 'green / white', outcomes: [o('moss', 'moss'), o('snow', 'snow')] },
];

// Every outcome's key, as kept in the browser: paint.place.outcome for the first table, on.row.outcome for the second.
export const KEYS = [
  ...PAINTS.flatMap((p) => PLACES.flatMap(([at]) => p[at].map((x) => `${p.fam}.${at}.${x.id}`))),
  ...HITS.flatMap((r) => r.outcomes.map((x) => `on.${r.id}.${x.id}`)),
];
const VALID = new Set(KEYS);
export const isKey = (k) => VALID.has(k);

const TREES = new Set(['evergreen', 'deciduous', 'bush']);
const WARM = new Set(['yellow', 'red']);

// The outcome a step of a plan made, once painted, as its key, or null if it isn't one in the tables (the far-off trees
// on the horizon, a bush beside a new cabin, the land a tall pine brought with it). st is the step, spec what it painted
// (null if not painted yet: then the step's own kind is used), index its place in the plan, night whether the canvas's
// mood is a night one.
export function findOf(cell, st, spec, { index = 0, plan = [], night = false } = {}) {
  if (!cell || !st) return null;
  const kind = spec?.kind ?? st.kind;
  if (cell.hit) return onSomething(cell, st, kind, index, plan, night);
  // The first table counts only what the splat set out to be, not the quiet extras painted with it.
  if (st.quiet) return null;
  const paint = PAINTS.find((p) => p.fam === cell.fam);
  if (!paint) return null;
  const token = kind === 'cloud' && st.say === 'stormCloud' ? 'storm' : kind;
  // The middle of the sky is either sky column (the README's high and low overlap there), so the other one is tried too.
  const places = cell.at === 'high' ? ['high', 'low'] : cell.at === 'low' ? ['low', 'high'] : [cell.at];
  for (const at of places) {
    const hit = paint[at]?.find((x) => x.kinds.includes(token));
    if (hit) return `${paint.fam}.${at}.${hit.id}`;
  }
  return null;
}

function onSomething(cell, st, kind, index, plan, night) {
  const { hit, fam } = cell;
  const tree = TREES.has(hit);
  const key = (row, id) => `on.${row}.${id}`;
  if (st.kind === 'garden') return key('cabin', 'garden');
  if (st.kind === 'cloudOverSun') return key('sun-other', 'cloud');
  switch (kind) {
    case 'treeSnow':
      // Snow on a friend just grown (white on a tree already snowy) is part of the friend, not this row.
      return tree && index === 0 ? key('tree-white', 'snow') : null;
    case 'treeGlow':
      if (!tree) return null;
      return hit === 'evergreen' && WARM.has(fam) ? key('evergreen-warm', night ? 'moon' : 'light') : key('tree-other', 'light');
    case 'autumn':
      return key('leafy-warm', 'autumn');
    case 'evergreen':
    case 'deciduous':
    case 'bush':
      return tree ? key('tree-other', 'friend') : null;
    case 'snowfall':
      return key('mountain', 'snow');
    case 'waterfall':
      return key('mountain', 'falls');
    case 'alpenglow':
      return key('mountain', 'glow');
    case 'mist':
      if (hit !== 'mountain') return null;
      // Blue too near the foot for a waterfall paints mist in its place; any other mist is the drift.
      return st.kind === 'waterfall' ? key('mountain', 'mist') : key('mountain-other', 'mist');
    case 'foothills':
      return key(fam === 'green' ? 'mountain' : 'mountain-other', 'trees');
    case 'sunset':
      return key('sun-warm', hit === 'moon' ? 'moon' : 'sunset');
    case 'storm':
      return plan.some((s) => s.kind === 'rain' || s.kind === 'snowShower') ? null : key('cloud-dark', 'storm');
    case 'rain':
      return key('cloud-dark', 'rain');
    case 'snowShower':
      return key('cloud-dark', 'snow');
    case 'sunlitCloud':
      return key('cloud-warm', 'lit');
    case 'roofSnow':
      return key('cabin', 'snow');
    case 'lights':
      return key('cabin', 'lights');
    case 'moss':
      return hit === 'rock' ? key('rock', 'moss') : null;
    case 'rockSnow':
      return key('rock', 'snow');
    default:
      return null;
  }
}

// ——— the sheet ———

// What the sheet says at the top, by how much has been found.
export function guideIntro(n, total = KEYS.length) {
  if (!n) return `Everything paint can turn into is here, ${total} things in all. Each one fills in the first time your own paint makes it.`;
  if (n >= total) return `All ${total} found. That’s everything paint does here, and none of it on purpose.`;
  return `${n} of ${total} found so far. Each one fills in the first time your own paint makes it.`;
}

// One outcome: its name once it's been found, a blank outline until then.
function chip(key, outcome, found) {
  const li = document.createElement('li');
  li.dataset.key = key;
  if (found.has(key)) {
    li.className = 'found';
    li.textContent = outcome.name;
  } else {
    li.className = 'blank';
    const sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = 'Not found yet';
    li.append(sr);
  }
  return li;
}

const el = (tag, className, text) => {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
};

// Fills the two tables: becomes (what each paint becomes, by where it lands) and hits (paint on something already
// there), with found, the set of keys found in this browser.
export function renderGuide(becomes, hits, found) {
  const head = el('div', 'guide-head');
  head.setAttribute('aria-hidden', 'true');
  head.append(el('span'), ...PLACES.map(([, name]) => el('span', '', name)));
  const rows = PAINTS.map((p) => {
    const row = el('div', 'guide-row');
    const name = el('h4', 'guide-paint', p.name);
    name.style.setProperty('--swatch', p.swatch);
    row.append(name);
    for (const [at, place] of PLACES) {
      const cell = el('div', 'guide-cell');
      const list = el('ul', 'guide-chips');
      list.setAttribute('aria-label', `${p.name}, ${place.toLowerCase()}`);
      list.append(...p[at].map((x) => chip(`${p.fam}.${at}.${x.id}`, x, found)));
      cell.append(el('span', 'guide-place', place), list);
      row.append(cell);
    }
    return row;
  });
  becomes.replaceChildren(head, ...rows);
  hits.replaceChildren(
    ...HITS.map((r) => {
      const row = el('div', 'guide-row');
      const what = el('h4', 'guide-hit');
      what.append(el('span', '', r.hit), el('span', 'guide-with', `with ${r.with}`));
      const list = el('ul', 'guide-chips');
      list.setAttribute('aria-label', `${r.hit}, with ${r.with}`);
      list.append(...r.outcomes.map((x) => chip(`on.${r.id}.${x.id}`, x, found)));
      row.append(what, list);
      return row;
    }),
  );
}
