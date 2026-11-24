// The parts that don't need a browser:  node --test test/unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { featureLine, madeFrom, durationText, makeTitle, toolInfo, keptNote, LINES } from '../src/words.js';
import { topEdge, heights, at, span, sideProfile } from '../src/shape.js';
import { ramp, mix, hex, mixPaint, familyOf, colorName } from '../src/color.js';
import { weighted, pickFresh, clamp, rand, chance, pick, TAU } from '../src/util.js';
import { SCHEMES, PIGMENTS } from '../src/schemes.js';
import { decide } from '../src/decide.js';
import { makeSplat } from '../src/splat.js';
import { lineKey } from '../src/studio.js';
import * as P from '../src/paint/index.js';
import { flowers, canoe, glints } from '../src/paint/index.js';
import { autumn, treeGlow, sunlitCloud } from '../src/paint/react.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Just enough of a studio to ask decide() what a splat becomes: ground everywhere below the horizon (or where land(x, y)
// says), nothing painted yet (or only target, which every splat lands on), and the sun or moon already up if sunUp.
function bareStudio(schemeId = 'golden-hour', { land = (x, y) => y > 480, target = null, sunUp = false } = {}) {
  const reserved = new Set();
  const scheme = SCHEMES.find((s) => s.id === schemeId);
  if (sunUp) reserved.add(scheme.sunType);
  return {
    W: 1200,
    H: 900,
    hy: 480,
    lightDir: 1,
    scheme,
    haze: scheme.haze,
    elements: [{ kind: 'sky' }],
    elementAt: () => target,
    isLand: land,
    addLand: () => {},
    has: (kind) => reserved.has(kind),
    count: () => 0,
    reserve: (kind) => reserved.add(kind),
  };
}

test('the placard lists what is in the painting in plain English', () => {
  assert.equal(featureLine({}), 'Mostly sky and water, which is plenty.');
  assert.equal(featureLine({ cabin: 1 }), 'Features a cabin.');
  assert.equal(featureLine({ mountain: 2, evergreen: 1 }), 'Features two mountains and a happy little tree.');
  assert.equal(featureLine({ mountain: 1, evergreen: 3, sun: 1 }), 'Features a mountain, three happy little trees and the sun.');
  const long = featureLine({ mountain: 2, evergreen: 3, deciduous: 2, bush: 1, cabin: 1, cloud: 2, rock: 1 });
  assert.match(long, /, and more\.$/);
  assert.doesNotMatch(long, /and more and/);
});

test('painting time and accident counts read naturally', () => {
  assert.equal(durationText(42), '42 seconds');
  assert.equal(durationText(192), '3 min 12 s');
  assert.equal(madeFrom(1, 20), 'Painted wet-on-wet from one happy accident in 20 seconds.');
  assert.equal(madeFrom(14, 192), 'Painted wet-on-wet from 14 happy accidents in 3 min 12 s.');
  assert.equal(madeFrom(0, 2), 'Painted wet-on-wet without a single accident, in 2 seconds.', 'a blank canvas isn’t made from 0 happy accidents');
});

test('the label says when the browser didn’t keep the painting, or took older ones down for it', () => {
  assert.equal(keptNote({ kept: true, dropped: 0 }), '', 'a usual signing says nothing');
  assert.match(keptNote({ kept: false, dropped: 0 }), /won’t go up on the wall\. Download it to keep it\.$/);
  assert.match(keptNote({ kept: false, dropped: 0 }, false), /Save the picture to keep it\.$/, 'with no Download button it doesn’t point at one');
  assert.match(keptNote({ kept: true, dropped: 1 }), /the oldest painting came down/);
  assert.match(keptNote({ kept: true, dropped: 7 }), /the seven oldest paintings came down/);
});

test('titles are always real words', () => {
  for (const s of SCHEMES) {
    for (let i = 0; i < 40; i++) {
      const t = makeTitle({ mountain: 1, evergreen: 2, cabin: i % 2, island: i % 3 === 0 ? 1 : 0 }, s.id);
      assert.ok(t.length > 3, t);
      assert.doesNotMatch(t, /undefined|null|NaN|\{|\}/, t);
    }
  }
});

test('night titles don’t say night twice, like Midnight Night', () => {
  for (const id of ['northern-night', 'violet-dusk']) {
    for (let i = 0; i < 600; i++) assert.doesNotMatch(makeTitle({ mountain: 1 }, id), /\b(Midnight|Evening) Night\b/);
  }
});

test('the painter names the brush and a touch of the paint you used', () => {
  const blue = PIGMENTS.find((p) => p.id === 'phthalo-blue');
  assert.equal(toolInfo('mountain', blue), 'Palette knife · Van Dyke Brown, Prussian Blue, Titanium White · a touch of Phthalo Blue');
  assert.equal(toolInfo('no-such-thing', blue), '');
  for (const [key, lines] of Object.entries(LINES)) assert.ok(lines.length > 0, `no lines for ${key}`);
});

test('the painter’s lines use curly apostrophes, like the rest of the page', () => {
  for (const [key, lines] of Object.entries(LINES)) {
    for (const text of lines) assert.doesNotMatch(text, /'/, `${key}: ${text}`);
  }
});

test('an ordinary brown tap on land can be a cabin', () => {
  // Taps are R 11 to 22. From R 15 up, brown on land in the middle distance is a cabin about half the time (until there's
  // one), which makes about a third of those taps a cabin; smaller ones are a bare tree or a bush.
  const brown = PIGMENTS.find((p) => p.id === 'van-dyke-brown');
  const becomes = (R) => {
    const S = bareStudio();
    return decide(S, makeSplat({ x: 600, y: S.hy + (S.H - S.hy) * 0.3, R, pigment: brown }))[0].kind;
  };
  const cabins = Array.from({ length: 60 }, (_, i) => becomes(15 + (i % 3))).filter((k) => k === 'cabin').length;
  assert.ok(cabins >= 15, `only ${cabins} of 60 brown taps of R 15 to 17 made a cabin`);
  for (let i = 0; i < 30; i++) assert.notEqual(becomes(14.5), 'cabin', 'a brown tap smaller than R 15 made a cabin');
});

// Plays a painter's steps on a context that draws nothing and keeps every color it's handed, as [r, g, b].
function colorsOf(spec) {
  const colors = [];
  const keep = (c) => {
    const m = typeof c === 'string' && c.match(/^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
    if (m) colors.push(m.slice(1, 4).map(Number));
  };
  const gradient = { addColorStop: (at, c) => keep(c) };
  const ctx = new Proxy(
    {},
    {
      get: (t, k) => (k in t ? t[k] : typeof k === 'string' && k.startsWith('create') ? () => gradient : () => {}),
      set: (t, k, v) => {
        if (k === 'fillStyle' || k === 'strokeStyle') keep(v);
        t[k] = v;
        return true;
      },
    },
  );
  for (const op of spec.ops) op(ctx);
  return colors;
}

// Runs fn with Math.random started from the same seed every time, so two runs make the same choices.
function sameDice(fn, seed = 7) {
  const real = Math.random;
  let a = seed;
  Math.random = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  try {
    return fn();
  } finally {
    Math.random = real;
  }
}

test('at night and dusk, what paint adds sits in the shade like everything else', () => {
  // Each touch is painted twice from the same random numbers: in the mood itself, and in a copy of the mood that isn't
  // dimmed. The colors that differ are the ones that came from the paint, and each went toward the shade: the darkest
  // tree color, or for light on a cloud's edges, the cloud's own light (into the dark, it looked like grime).
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const paint = (id) => PIGMENTS.find((p) => p.id === id).rgb;
  const make = (S, x, y, R, id, hint) => decide(S, makeSplat({ x, y, R, pigment: PIGMENTS.find((p) => p.id === id), hint }))[0].make();
  for (const mood of ['northern-night', 'violet-dusk']) {
    const S = bareStudio(mood);
    const plain = { ...S, scheme: { ...S.scheme, id: 'not-dimmed', night: false } };
    const ground = S.hy + 150;
    const pine = make(S, 300, ground, 30, 'phthalo-blue', 'tree');
    const leafy = make(S, 500, ground, 30, 'cadmium-yellow', 'tree');
    const cloud = make(S, 600, S.hy * 0.3, 30, 'titanium-white', 'cloud');
    const hit = (id) => ({ x: 600, y: ground, R: 18, tint: paint(id) });
    const dark = S.scheme.tree.dark;
    const touches = {
      'autumn leaves': [(s) => autumn(s, leafy, hit('bright-red')), dark],
      'late light on a pine': [(s) => treeGlow(s, pine, hit('cadmium-yellow')), dark],
      'a cloud’s lit edges': [(s) => sunlitCloud(s, cloud, hit('cadmium-yellow')), cloud.meta.light],
      flowers: [(s) => flowers(s, { x: 700, y: ground, R: 10, tint: paint('cadmium-yellow') }), dark],
      'a canoe': [(s) => canoe(s, { x: 600, y: S.hy + 100, R: 20, tint: paint('bright-red') }), dark],
      glints: [(s) => glints(s, { x: 600, y: S.hy + 80, R: 20, tint: paint('cadmium-yellow') }), dark],
    };
    for (const [what, [paintIt, toward]] of Object.entries(touches)) {
      const shaded = sameDice(() => colorsOf(paintIt(S)));
      const bright = sameDice(() => colorsOf(paintIt(plain)));
      assert.equal(shaded.length, bright.length, `${what} at ${mood} painted differently`);
      const changed = shaded.map((c, i) => [c, bright[i]]).filter(([a, b]) => dist(a, b) > 1);
      assert.ok(changed.length > 0, `at ${mood}, ${what} kept the colors of daylight`);
      for (const [a, b] of changed) assert.ok(dist(a, toward) < dist(b, toward), `at ${mood}, ${what} went from ${b} to ${a}, out of the shade`);
    }
    // A warm cloud's shadow too, not just its light.
    for (const id of ['cadmium-yellow', 'bright-red']) {
      const shadow = (s) => make(s, 600, s.hy * 0.3, 30, id, 'cloud').meta.shadow;
      assert.ok(dist(shadow(S), dark) < dist(shadow(plain), dark), `at ${mood}, a ${id} cloud’s shadow kept the colors of daylight`);
    }
  }
});

test('a pine’s trunk reaches the ground, however tall the pine', () => {
  // The trunk is painted first. Each bristle's lowest point should be down at the base, under the grass, not a sixteenth
  // of the tree's height above it (44px on a pine that fills the canvas).
  const S = bareStudio();
  for (const h of [80, 150, 300, 500, 700, 900]) {
    const spec = P.evergreen(S, { x: 300, baseY: 800, h, tint: [60, 90, 40] });
    const strokes = [];
    const ctx = new Proxy(
      {},
      {
        get: (t, k) => (k === 'beginPath' ? () => strokes.push([]) : k === 'moveTo' || k === 'lineTo' ? (x, y) => strokes.at(-1).push(y) : k in t ? t[k] : () => {}),
        set: (t, k, v) => ((t[k] = v), true),
      },
    );
    spec.ops[0](ctx);
    const gaps = strokes.filter((s) => s.length).map((s) => 800 - Math.max(...s)).sort((a, b) => a - b);
    const median = gaps[gaps.length >> 1];
    assert.ok(median <= Math.max(5, h * 0.015), `a ${h}px pine's trunk stops ${median.toFixed(1)}px above the ground`);
  }
});

test('a splat outline turns into a silhouette', () => {
  // A circle of radius 10 centered at (50, 50).
  const circle = Array.from({ length: 72 }, (_, i) => [50 + Math.cos((i / 72) * Math.PI * 2) * 10, 50 + Math.sin((i / 72) * Math.PI * 2) * 10]);
  const edge = topEdge(circle, 21);
  assert.ok(Math.abs(edge.x0 - 40) < 0.01 && Math.abs(edge.x1 - 60) < 0.01);
  assert.ok(Math.abs(Math.min(...edge.ys) - 40) < 0.5, 'the top of the circle is its highest point');
  const hs = heights(edge, 50);
  assert.equal(Math.max(...hs), 1);
  assert.ok(at(hs, 0.5) > 0.95 && at(hs, 0) < 0.5, 'tallest in the middle, low at the sides');
  assert.deepEqual(span(circle, 50).map((v) => Math.round(v)), [40, 60]);
  assert.equal(span(circle, 90), null);
  const reach = sideProfile({ pts: circle, box: { x: 40, y: 40, w: 20, h: 20 }, cx: 50 });
  assert.ok(reach(0.5, -1) > reach(0.02, -1), 'a circle reaches furthest at its middle');
  assert.equal(sideProfile(null)(0.5, 1), 1);
});

test('colors mix and ramp', () => {
  assert.deepEqual(hex('#ff8000'), [255, 128, 0]);
  assert.deepEqual(mix([0, 0, 0], [200, 100, 50], 0.5), [100, 50, 25]);
  const stops = [[0, [0, 0, 0]], [1, [255, 255, 255]]];
  assert.deepEqual(ramp(stops, 0.5), [127.5, 127.5, 127.5]);
  assert.deepEqual(ramp(stops, -1), [0, 0, 0]);
});

test('paint mixes like paint, and the mix decides its family', () => {
  for (const p of PIGMENTS) assert.equal(familyOf(p.rgb), p.family, `${p.name} reads as ${p.family}`);
  const P = Object.fromEntries(PIGMENTS.map((p) => [p.id, p.rgb]));
  const fam = (a, b, wa = 1, wb = 1) => familyOf(mixPaint([[P[a], wa], [P[b], wb]]));
  assert.equal(fam('cadmium-yellow', 'phthalo-blue'), 'green', 'yellow and blue make green');
  assert.equal(fam('cadmium-yellow', 'prussian-blue'), 'green');
  assert.equal(fam('bright-red', 'cadmium-yellow'), 'yellow', 'red and yellow make orange, which acts like yellow');
  assert.equal(colorName(mixPaint([[P['bright-red'], 1], [P['cadmium-yellow'], 1]])), 'orange');
  assert.equal(fam('bright-red', 'titanium-white'), 'red', 'red and white make pink');
  assert.equal(colorName(mixPaint([[P['bright-red'], 1], [P['titanium-white'], 1]])), 'pink');
  assert.equal(fam('bright-red', 'sap-green'), 'brown', 'red and green make brown');
  assert.equal(fam('titanium-white', 'phthalo-blue'), 'blue');
  assert.equal(colorName(mixPaint([[P['titanium-white'], 3], [P['phthalo-blue'], 1]])), 'pale blue', 'mostly white with some blue is pale blue');
  const same = mixPaint([[P['sap-green'], 2], [P['sap-green'], 5]]);
  same.forEach((v, i) => assert.ok(Math.abs(v - P['sap-green'][i]) < 1, 'a paint mixed with itself stays itself'));
});

test('small helpers behave', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(weighted([['a', 0], ['b', 1]]), 'b');
  const seen = new Set();
  let last = null;
  for (let i = 0; i < 30; i++) {
    const v = pickFresh('test', ['x', 'y', 'z']);
    assert.notEqual(v, last, 'never the same line twice in a row');
    last = v;
    seen.add(v);
  }
  assert.equal(seen.size, 3);
});

test('the README says what each file is for', async () => {
  const readme = await readFile(join(root, 'README.md'), 'utf8');
  const list = readme.slice(readme.indexOf('### Files'));
  const code = (await readdir(join(root, 'src'), { withFileTypes: true })).filter((e) => e.isFile()).map((e) => `src/${e.name}`);
  for (const f of [...code, 'src/paint/', 'fonts/', 'sw.js']) assert.ok(list.includes(`- \`${f}\`:`), `the README's Files list leaves out ${f}`);
});

test('the gallery wall says how many paintings it keeps', async () => {
  // Signing one more than that takes the oldest painting down, so the wall says so.
  const main = await readFile(join(root, 'src/main.js'), 'utf8');
  const html = await readFile(join(root, 'index.html'), 'utf8');
  const cap = main.match(/\[record, \.\.\.readGallery\(\)\]\.slice\(0, (\d+)\)/)?.[1];
  assert.ok(cap, 'main.js keeps the wall to some other number of paintings now');
  assert.match(html, new RegExp(`keeps your ${cap} newest paintings`), `the wall doesn't say it keeps ${cap} paintings`);
});

test('the screenshot tool starts its random numbers again before each painting', async () => {
  // The page paints its own first canvas as it loads, and how far it gets depends on timing; without this, the same
  // seed gave different paintings from run to run.
  const tool = await readFile(join(root, 'tools/screenshots.mjs'), 'utf8');
  const paintings = tool.split('page.evaluate(').filter((call) => call.includes('newCanvas('));
  assert.ok(paintings.length >= 2, 'the screenshot tool paints its canvases somewhere else now');
  for (const call of paintings) assert.match(call.slice(0, call.indexOf('newCanvas(')), /reseed\(/, `a painting in tools/screenshots.mjs isn't reseeded first: ${call.slice(0, 120)}`);
});

test('the offline copy lists every file the page needs', async () => {
  const sw = await readFile(join(root, 'sw.js'), 'utf8');
  const listed = new Set([...sw.matchAll(/'([^']+\.(?:js|css|woff2|svg|html|webmanifest))'/g)].map((m) => m[1]));
  const walk = async (dir) => {
    const out = [];
    for (const e of await readdir(join(root, dir), { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) out.push(...(await walk(p)));
      else out.push(p);
    }
    return out;
  };
  const needed = [...(await walk('src')), ...(await walk('fonts')), 'styles.css', 'index.html', 'icon.svg', 'manifest.webmanifest'];
  for (const f of needed) assert.ok(listed.has(f), `sw.js doesn't list ${f}`);
  for (const f of listed) assert.ok(needed.includes(f), `sw.js lists ${f}, which doesn't exist`);
});

// ——— the rules: the README's two tables ———
// Each cell of the README's tables is written out here as the outcomes it allows. For every paint, place and time of day,
// a few hundred splats of every size and shape go through decide() on a clean canvas: each must become something its cell
// allows, and everything the cell lists must turn up. The cell's text is checked against the README too, so changing a
// rule means changing it in both places.

// Node has no Path2D; the painters only build paths here, they never draw them.
globalThis.Path2D ??= class {
  moveTo() {}
  lineTo() {}
  closePath() {}
  quadraticCurveTo() {}
  bezierCurveTo() {}
  arc() {}
  ellipse() {}
  rect() {}
};

const paintOf = (id) => PIGMENTS.find((p) => p.id === id);
const FAMILIES = ['white', 'yellow', 'red', 'green', 'blue', 'brown'];
const PAINTS = Object.fromEntries(FAMILIES.map((f) => [f, PIGMENTS.filter((p) => p.family === f).map((p) => p.id)]));
const DAY = SCHEMES.filter((s) => !s.night).map((s) => s.id);
const NIGHT = SCHEMES.filter((s) => s.night).map((s) => s.id);
// The rules canvas: a bank of land down the left of the lake (x under 300), water everywhere else below the horizon.
const leftBank = (x, y) => y > 480 && x < 300;

// What a plan paints, in the README's words.
function outcomeOf(plan) {
  const [first] = plan;
  if (!first) return 'nothing';
  const kinds = plan.map((s) => s.kind);
  if (first.say === 'tallTree') return 'tall pine';
  switch (first.kind) {
    case 'cloud':
      return first.say === 'stormCloud' ? 'storm cloud' : 'cloud';
    case 'mountain':
      return first.say === 'goldMountain' ? 'golden mountain' : 'mountain';
    case 'bank':
      return 'land';
    case 'rock':
      return kinds.includes('moss') ? 'mossy rock' : 'rock';
    case 'evergreen':
      return kinds.includes('treeSnow') ? 'snowy pine' : first.say === 'blueSpruce' ? 'blue spruce' : 'pine';
    case 'deciduous':
      return first.say === 'birch' ? 'birch' : first.say === 'bareTree' ? 'bare tree' : 'leafy tree';
    default:
      return first.kind;
  }
}

// An outcome a cell allows: is (one name, or several that count as one listed outcome), and optionally only at
// night or by day, or only from some of the family's paints.
const may = (is, more = {}) => ({ is: [].concat(is), ...more });
const night = { when: 'night' };
const day = { when: 'day' };

// The first table. text is the cell as the README has it. todo marks a cell the code doesn't follow yet.
const CELLS = {
  'high in the sky': {
    white: { text: 'a white cloud, the sun or moon, or stars at night', allows: [may('cloud'), may('sun', day), may('moon', night), may('stars', night)] },
    yellow: { text: 'the sun, then golden clouds', allows: [may('sun', day), may('cloud')], todo: { night: 'yellow at night makes the moon' } },
    red: { text: 'a sunset cloud', allows: [may('cloud')] },
    green: { text: 'the top of a tall pine, or an aurora at night', allows: [may('tall pine'), may('aurora', night)] },
    blue: { text: 'a cool cloud, or a storm from Prussian Blue', allows: [may('cloud'), may('storm cloud', { only: ['prussian-blue'] })] },
    brown: { text: 'a storm cloud, or birds', allows: [may('storm cloud'), may('birds')] },
  },
  'low in the sky': {
    white: { text: 'a snowy mountain or a cloud', allows: [may('mountain'), may('cloud')] },
    yellow: { text: 'the sun or golden clouds', allows: [may('sun', day), may('cloud')], todo: 'Yellow Ochre makes a golden mountain, and at night yellow makes the moon' },
    red: { text: 'a red-rock mountain or a sunset cloud', allows: [may('mountain'), may('cloud')] },
    green: { text: 'a wooded mountain', allows: [may('mountain')] },
    blue: { text: 'a blue mountain or a cool cloud', allows: [may('mountain'), may('cloud')] },
    brown: { text: 'a mountain', allows: [may('mountain')], todo: 'brown low in the sky also makes storm clouds' },
  },
  'on the lake': {
    white: { text: 'a sailboat, or light on the water', allows: [may('sailboat'), may(['glints', 'ripples'])] },
    yellow: { text: 'glints of light, or land from Yellow Ochre', allows: [may('glints', { only: ['cadmium-yellow', 'indian-yellow'] }), may(['land', 'island'], { only: ['yellow-ochre'] })], todo: 'a small Yellow Ochre splat on open water makes a rock' },
    red: { text: 'a canoe', allows: [may('canoe')] },
    green: { text: 'land, an island or a mossy rock', allows: [may('land'), may('island'), may('mossy rock')] },
    blue: { text: 'ripples', allows: [may('ripples')] },
    brown: { text: 'land, or a rock', allows: [may(['land', 'island']), may('rock')] },
  },
  'on land': {
    white: { text: 'a snowy pine, a birch or a white cabin', allows: [may('snowy pine'), may('birch'), may('cabin')], todo: 'small splats make flowers' },
    yellow: { text: 'a golden tree or bush', allows: [may('leafy tree'), may('bush')], todo: 'small splats make flowers' },
    red: { text: 'a red tree or bush, or a red cabin', allows: [may('leafy tree'), may('bush'), may('cabin')], todo: 'small splats make flowers' },
    green: { text: 'pines, leafy trees and bushes', allows: [may('pine'), may('leafy tree'), may('bush')] },
    blue: { text: 'a blue spruce', allows: [may('blue spruce')], todo: 'small splats make flowers' },
    brown: { text: 'a cabin, a bare tree or a bush', allows: [may('cabin'), may('bare tree'), may('bush')] },
  },
};

// Where each column lands on the rules canvas (horizon at 480 of 900). The middle of the sky, between high and low, is
// checked against both columns at once, and the horizon on its own.
const PLACES = {
  'high in the sky': (S) => ({ x: rand(30, S.W - 30), y: S.hy * rand(0.05, 0.42) }),
  'low in the sky': (S) => ({ x: rand(30, S.W - 30), y: S.hy * rand(0.72, 0.93) }),
  'on the lake': (S) => ({ x: rand(330, S.W - 30), y: rand(S.hy + 36, S.H - 8) }),
  'on land': (S) => ({ x: rand(30, 270), y: rand(S.hy + 36, S.H - 10) }),
  middle: (S) => ({ x: rand(30, S.W - 30), y: S.hy * rand(0.42, 0.72) }),
  horizon: (S) => ({ x: rand(30, S.W - 30), y: S.hy + rand(-0.03, 0.03) * S.H }),
};

// Small flecks up high are birds, stars or wisps of cloud, whatever the paint (How it plays): splats under R 14, about a
// quarter of taps.
const FLECK_R = 14;
const FLECKS = ['birds', 'stars', 'cloud'];

// A splat of any size the page makes: half of them taps (R 11 to 22), half bigger flicks and pours, some stretched.
function throwAt(spot, id) {
  const R = chance(0.5) ? rand(11, 22) : rand(22, 56);
  const speed = chance(0.5) ? 0 : rand(0.4, 2.5);
  const a = rand(TAU);
  return makeSplat({ ...spot, R, pigment: paintOf(id), vx: Math.cos(a) * speed, vy: Math.sin(a) * speed });
}

// Throws n splats of each paint at a place, and returns each outcome with the paints that made it, and anything
// allowed() refused.
function throwMany(place, ids, time, n, allowed) {
  const made = new Map();
  const wrong = new Map();
  for (const id of ids) {
    for (let i = 0; i < n; i++) {
      const S = bareStudio(pick(time === 'night' ? NIGHT : DAY), { land: leftBank, sunUp: chance(0.4) });
      const sp = throwAt(PLACES[place](S), id);
      const what = outcomeOf(decide(S, sp));
      if (allowed(what, id, sp)) {
        if (!made.has(what)) made.set(what, new Set());
        made.get(what).add(id);
      } else {
        const key = `${paintOf(id).name} became ${what}`;
        wrong.set(key, (wrong.get(key) || 0) + 1);
      }
    }
  }
  return { made, wrong };
}

const reportWrong = (wrong) => [...wrong].map(([k, n]) => `${k} (${n}×)`).join('; ');

test('the rules table in the README is the one written out here', async () => {
  const readme = await readFile(join(root, 'README.md'), 'utf8');
  for (const fam of FAMILIES) {
    const row = `| ${fam[0].toUpperCase() + fam.slice(1)} | ${Object.values(CELLS).map((cells) => cells[fam].text).join(' | ')} |`;
    assert.ok(readme.includes(row), `the README's row for ${fam} isn't ${row}`);
  }
});

let seed = 100;
for (const [place, cells] of Object.entries(CELLS)) {
  for (const fam of FAMILIES) {
    for (const time of ['day', 'night']) {
      const cell = cells[fam];
      const todo = typeof cell.todo === 'string' ? cell.todo : cell.todo?.[time];
      const dice = seed++;
      test(`the rules: ${fam} ${place}, by ${time === 'day' ? 'day' : 'night'}, is ${cell.text}`, { todo }, () =>
        sameDice(() => {
          const sky = place.includes('sky');
          const fits = (a, id) => (!a.when || a.when === time) && (!a.only || a.only.includes(id));
          const allowed = (what, id, sp) => cell.allows.some((a) => fits(a, id) && a.is.includes(what)) || (sky && sp.R < FLECK_R && FLECKS.includes(what));
          const { made, wrong } = throwMany(place, PAINTS[fam], time, 250, allowed);
          assert.equal(wrong.size, 0, reportWrong(wrong));
          for (const a of cell.allows) {
            const ids = PAINTS[fam].filter((id) => fits(a, id));
            if (!ids.length) continue;
            assert.ok(
              a.is.some((what) => [...(made.get(what) || [])].some((id) => ids.includes(id))),
              `${a.is.join(' or ')} never turned up (made: ${[...made.keys()].join(', ')})`,
            );
          }
        }, dice),
      );
    }
  }
}

test('the rules: in the middle of the sky, paint becomes something from the high column or the low one', () =>
  sameDice(() => {
    for (const fam of FAMILIES) {
      for (const time of ['day', 'night']) {
        const ok = (what, id, sp) => {
          if (sp.R < FLECK_R && FLECKS.includes(what)) return true;
          return ['high in the sky', 'low in the sky'].some((place) => {
            const cell = CELLS[place][fam];
            if (cell.todo) return true;
            return cell.allows.some((a) => (!a.when || a.when === time) && (!a.only || a.only.includes(id)) && a.is.includes(what));
          });
        };
        const { wrong } = throwMany('middle', PAINTS[fam], time, 150, ok);
        assert.equal(wrong.size, 0, `${fam} by ${time}: ${reportWrong(wrong)}`);
      }
    }
  }, 31));

test('the rules: on the horizon, any paint makes a far-off row of trees', () =>
  sameDice(() => {
    const { wrong } = throwMany('horizon', PIGMENTS.map((p) => p.id), 'day', 40, (what) => what === 'treeline');
    assert.equal(wrong.size, 0, reportWrong(wrong));
  }, 32));

// The second table: paint that lands on something already there. Each row's targets are painted for real, and every
// splat of every paint in the row lands on a fresh one, so it's always the first hit.
const YELLOW_RED = [...PAINTS.yellow, ...PAINTS.red];
const ground = 680;
const TARGETS = {
  evergreen: (S) => P.evergreen(S, { x: 150, baseY: ground, h: 140, tint: [60, 90, 40] }),
  deciduous: (S) => P.deciduous(S, { x: 150, baseY: ground, h: 140, tint: [60, 90, 40] }),
  birch: (S) => P.deciduous(S, { x: 150, baseY: ground, h: 140, tint: [244, 242, 234], birch: true, bare: true, sparse: 0.14 }),
  bush: (S) => P.bush(S, { x: 150, baseY: ground, r: 30, tint: [60, 90, 40] }),
  'island tree': (S) => P.evergreen(S, { x: 700, baseY: ground, h: 140, tint: [60, 90, 40] }),
  mountain: (S) => P.mountain(S, { x: 600, y: 200, R: 40, index: 0, tint: [62, 43, 29] }),
  sun: (S) => P.sun(S, { x: 900, y: 150, R: 24 }),
  cloud: (S) => P.cloud(S, { x: 600, y: 150, R: 30, tint: [244, 242, 234], elong: 1 }),
  cabin: (S) => P.cabin(S, { x: 150, baseY: ground, size: 90, tint: [62, 43, 29] }),
  'lit cabin': (S) => P.cabin(S, { x: 150, baseY: ground, size: 90, tint: [62, 43, 29] }),
  rock: (S) => P.rock(S, { x: 600, y: 620, R: 16, tint: [62, 43, 29] }),
};
// Where on the target the paint lands.
const HIT = {
  mountain: (t) => ({ x: t.meta.peak[0] + rand(-30, 30), y: t.meta.peak[1] + t.meta.hgt * rand(0.15, 0.4) }),
  sun: (t) => ({ x: t.meta.x, y: t.meta.y }),
  cloud: (t) => ({ x: t.meta.x, y: t.meta.baseY - t.meta.h * 0.4 }),
  rock: (t) => ({ x: t.meta.x, y: t.meta.y - t.meta.hh * 0.5 }),
  tree: (t) => ({ x: t.meta.x + rand(-10, 10), y: t.meta.baseY - t.meta.size * 0.5 }),
};
const hitOn = (name, t) => (HIT[name] || (t.meta.peak ? HIT.mountain : t.meta.puffs ? HIT.cloud : t.meta.hh ? HIT.rock : t.meta.r ? HIT.sun : HIT.tree))(t);

const REACTIONS = [
  { row: ['a tree', 'white', 'snow settles on it'], targets: ['evergreen', 'deciduous', 'bush'], paints: PAINTS.white, first: () => ['treeSnow'] },
  { row: ['an evergreen', 'yellow or red', 'late light catches its side'], targets: ['evergreen'], paints: YELLOW_RED, first: () => ['treeGlow'] },
  { row: ['a leafy tree or bush', 'yellow or red', 'it turns to autumn'], targets: ['deciduous', 'bush'], paints: YELLOW_RED, first: () => ['autumn'] },
  {
    row: ['a tree', 'anything else', 'a friend grows next to it (with no ground beside it, light catches it instead)'],
    targets: ['evergreen', 'deciduous', 'birch', 'bush', 'island tree'],
    paints: [...PAINTS.green, ...PAINTS.blue, ...PAINTS.brown],
    first: (target) => (target === 'island tree' ? ['treeGlow'] : ['friend']),
  },
  {
    row: ['a mountain', 'white / blue / yellow or red / green', 'fresh snow / a waterfall / alpenglow / trees up the slope'],
    targets: ['mountain'],
    paints: [...PAINTS.white, ...PAINTS.blue, ...YELLOW_RED, ...PAINTS.green],
    first: (target, fam) => ({ white: ['snowfall'], blue: ['waterfall'], yellow: ['alpenglow'], red: ['alpenglow'], green: ['foothills'] })[fam],
  },
  { row: ['a mountain', 'anything else', 'trees up the slope, or a drift of mist'], targets: ['mountain'], paints: PAINTS.brown, first: () => ['foothills', 'mist'] },
  { row: ['the sun or moon', 'warm or white', 'the whole sky warms into a sunset, or lights up around the moon'], targets: ['sun'], paints: [...PAINTS.white, ...YELLOW_RED], first: () => ['sunset'] },
  { row: ['the sun or moon', 'anything else', 'a cloud drifts across it'], targets: ['sun'], paints: [...PAINTS.green, ...PAINTS.blue, ...PAINTS.brown], first: () => ['cloudOverSun'] },
  { row: ['a cloud', 'something dark', 'it turns stormy and rains'], targets: ['cloud'], paints: [...PAINTS.blue, ...PAINTS.brown], first: () => ['storm'] },
  { row: ['a cloud', 'yellow or red', 'its edges catch the light'], targets: ['cloud'], paints: YELLOW_RED, first: () => ['sunlitCloud'] },
  {
    row: ['the cabin', 'white / warm / anything', 'snow on the roof / the lights come on (if they aren\'t on already) / a garden'],
    targets: ['cabin', 'lit cabin'],
    paints: PIGMENTS.map((p) => p.id),
    first: (target, fam) => (fam === 'white' ? ['roofSnow'] : target === 'cabin' && (fam === 'yellow' || fam === 'red') ? ['lights'] : ['garden']),
    todo: 'any paint turns the lights on 40% of the time, not only warm paint',
  },
  { row: ['a rock', 'green / white', 'moss / snow'], targets: ['rock'], paints: [...PAINTS.green, ...PAINTS.white], first: (target, fam) => (fam === 'green' ? ['moss'] : ['rockSnow']) },
];

// What the first step of a reaction is: a friend is a new tree the painter calls company.
const reactionOf = (plan) => (plan[0]?.say === 'company' ? 'friend' : plan[0]?.kind ?? 'nothing');

test('the second rules table in the README is the one written out here', async () => {
  const readme = await readFile(join(root, 'README.md'), 'utf8');
  for (const { row } of REACTIONS) assert.ok(readme.includes(`| ${row.join(' | ')} |`), `the README has no row | ${row.join(' | ')} |`);
});

for (const [i, r] of REACTIONS.entries()) {
  test(`the rules: paint on ${r.row[0]}, ${r.row[1]}: ${r.row[2]}`, { todo: r.todo }, () =>
    sameDice(() => {
      const wrong = new Map();
      for (const time of ['day', 'night']) {
        for (const target of r.targets) {
          for (const id of r.paints) {
            const fam = paintOf(id).family;
            const want = r.first(target, fam);
            const seen = new Set();
            for (let n = 0; n < 30; n++) {
              const mood = pick(time === 'night' ? NIGHT : DAY);
              const el = { ...TARGETS[target](bareStudio(mood, { land: leftBank })) };
              // Some moods start with the cabin's lights on; these start them off, or on.
              if (el.kind === 'cabin') el.meta.glow = target === 'lit cabin';
              const S = bareStudio(mood, { land: leftBank, target: el });
              const what = reactionOf(decide(S, makeSplat({ ...hitOn(target, el), R: rand(12, 26), pigment: paintOf(id) })));
              seen.add(what);
              if (!want.includes(what)) {
                const key = `${paintOf(id).name} on a ${target} by ${time} made ${what}`;
                wrong.set(key, (wrong.get(key) || 0) + 1);
              }
            }
            for (const w of want) if (!seen.has(w)) wrong.set(`${paintOf(id).name} on a ${target} by ${time} never made ${w}`, 1);
          }
        }
      }
      assert.equal(wrong.size, 0, reportWrong(wrong));
    }, 200 + i),
  );
}

// The README's mixes. Yellow into blue makes green for every yellow and every blue, half and half. Red into yellow makes
// orange, which acts like yellow (a little red into more yellow: half and half, Alizarin and Yellow Ochre make a brick
// red). White into red makes pink, which acts like red, however much white. Red into green makes brown.
const mixOf = (a, b, wa = 1, wb = 1) => mixPaint([[paintOf(a).rgb, wa], [paintOf(b).rgb, wb]]);
test('the rules: yellow into blue makes green, for every yellow and every blue', () => {
  for (const y of PAINTS.yellow) {
    for (const b of PAINTS.blue) {
      assert.equal(familyOf(mixOf(y, b)), 'green', `${y} into ${b} is ${colorName(mixOf(y, b))}`);
      assert.match(colorName(mixOf(y, b)), /green/, `the painter calls ${y} and ${b} ${colorName(mixOf(y, b))}`);
    }
  }
  // Green reaches into the dull olives, but not into the browns: Van Dyke Brown, and yellows mixed into it.
  for (const [a, b] of [['van-dyke-brown', 'van-dyke-brown'], ['yellow-ochre', 'van-dyke-brown'], ['cadmium-yellow', 'van-dyke-brown'], ['indian-yellow', 'van-dyke-brown']]) {
    assert.equal(familyOf(mixOf(a, b)), 'brown', `${a} into ${b}`);
  }
});
test('the rules: red into yellow makes orange, white into red makes pink, red into green makes brown', () => {
  for (const r of PAINTS.red) {
    for (const y of PAINTS.yellow) {
      assert.equal(familyOf(mixOf(r, y, 1, 2)), 'yellow', `${r} into ${y}`);
      assert.equal(colorName(mixOf(r, y, 1, 2)), 'orange', `${r} into ${y}`);
    }
    for (const [ww, wr] of [[2, 1], [1, 1], [1, 2]]) assert.equal(familyOf(mixOf('titanium-white', r, ww, wr)), 'red', `white into ${r}, ${ww}:${wr}`);
    assert.equal(colorName(mixOf('titanium-white', r, 2, 1)), 'pink', `white into ${r}`);
    for (const g of PAINTS.green) assert.equal(familyOf(mixOf(r, g)), 'brown', `${r} into ${g}`);
  }
});

test('blue at the foot of a mountain still makes a waterfall, and the painter says what was painted', () =>
  sameDice(() => {
    // A hit just above the horizon used to be too near the foot for a fall: it painted mist, and the painter announced a
    // waterfall anyway. Now the fall starts a little higher up the slope.
    let falls = 0;
    for (let i = 0; i < 40; i++) {
      const el = { ...TARGETS.mountain(bareStudio()) };
      const S = bareStudio('golden-hour', { land: leftBank, target: el });
      const plan = decide(S, makeSplat({ x: el.meta.peak[0] + rand(-30, 30), y: S.hy - 5, R: 16, pigment: paintOf('phthalo-blue') }));
      const spec = plan[0].make();
      if (spec.kind === 'waterfall') falls++;
      assert.equal(lineKey(plan[0], spec), spec.kind, `the painter would say ${lineKey(plan[0], spec)} for ${spec.kind}`);
    }
    assert.equal(falls, 40, `only ${falls} of 40 blue hits at a mountain's foot made a waterfall`);
    assert.equal(lineKey({ kind: 'waterfall' }, { kind: 'mist' }), 'mist', 'a waterfall that fell back to mist says so');
    assert.equal(lineKey({ kind: 'garden', say: 'garden' }, { kind: 'flowers' }), 'garden');
    assert.equal(lineKey({ kind: 'cloudOverSun', say: 'cloudOverMoon' }, { kind: 'cloud' }), 'cloudOverMoon');
  }, 41));
