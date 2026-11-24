// The parts that don't need a browser:  node --test test/unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { featureLine, canvasContents, madeFrom, durationText, makeTitle, toolInfo, keptNote, mixLine, line, linesFor, LINES } from '../src/words.js';
import { topEdge, heights, at, span, sideProfile } from '../src/shape.js';
import { ramp, mix, hex, mixPaint, familyOf, colorName, lum } from '../src/color.js';
import { weighted, pickFresh, clamp, rand, chance, pick, TAU, slug } from '../src/util.js';
import { SCHEMES, PIGMENTS, pickScheme, moodsAfter } from '../src/schemes.js';
import { decide, birdColor } from '../src/decide.js';
import { makeSplat, splatShape } from '../src/splat.js';
import { lineKey, Studio, landInside, paintFor } from '../src/studio.js';
import * as P from '../src/paint/index.js';
import { flowers, canoe, glints } from '../src/paint/index.js';
import { autumn, treeGlow, sunlitCloud, treeSnow as treeSnowOf } from '../src/paint/react.js';
import { ridgeAt } from '../src/paint/mountains.js';
import { signSpot, poorGround } from '../src/paint/signature.js';
import { Film, MAX_FRAMES, stepMs } from '../src/film.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Just enough of a studio to ask decide() what a splat becomes: ground everywhere below the horizon (or where land(x, y)
// says), nothing painted yet (or only target, which every splat lands on), and the sun or moon already up if sunUp.
function bareStudio(schemeId = 'golden-hour', { land = (x, y) => y > 480, target = null, sunUp = false, counts = {} } = {}) {
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
    count: (kind) => counts[kind] || 0,
    reserve: (kind) => reserved.add(kind),
  };
}

test('the placard lists what is in the painting in plain English', () => {
  assert.equal(featureLine({}), 'Mostly sky and water, which is plenty.');
  assert.equal(featureLine({ cabin: 1 }), 'Features a cabin.');
  assert.equal(featureLine({ mountain: 2, evergreen: 1 }), 'Features two mountains and a pine.');
  assert.equal(featureLine({ mountain: 1, evergreen: 3, sun: 1 }), 'Features the sun, a mountain and three pines.');
  const long = featureLine({ mountain: 2, evergreen: 3, deciduous: 2, bush: 1, cabin: 1, cloud: 2, rock: 1 });
  assert.equal(long, 'Features a cabin, a rock, two mountains, three pines and more.', 'four at most, then “and more”, with no comma before it');
  assert.equal(featureLine({ evergreen: 14, birds: 1 }), 'Features fourteen pines and a flock of birds.');
  assert.equal(featureLine({ evergreen: 1, deciduous: 2, bush: 1, cloud: 3 }), 'Features a pine, two leafy trees, a bush and three clouds.', 'four are all named');
  // For a screen reader, the whole of it: no "and more".
  assert.equal(canvasContents({}), 'Nothing on it yet but sky and water.');
  assert.equal(canvasContents({ stars: 1 }), 'It has a sky full of stars.');
  assert.equal(
    canvasContents({ mountain: 2, evergreen: 3, deciduous: 2, bush: 1, cabin: 1, cloud: 2, rock: 1, moon: 1, stars: 2, aurora: 1 }),
    'It has a cabin, the moon, an aurora, a sky full of stars, a rock, two mountains, three pines, two leafy trees, a bush and two clouds.',
  );
  assert.equal(featureLine({ cloud: 20 }), 'Features twenty clouds.');
});

test('the label names what makes the painting first: the boat, the cabin, the moon, before the trees and clouds', () => {
  // Winter Hush, signed with its sailboat out on the lake and the sun up, said “Features a mountain, a pine, a leafy
  // tree, two bushes, a cabin and more.”
  const hush = { mountain: 1, evergreen: 1, deciduous: 1, bush: 2, cabin: 1, cloud: 3, sailboat: 1, sun: 1, birds: 1 };
  assert.equal(featureLine(hush), 'Features a cabin, a sailboat, the sun, a mountain and more.');
  // Golden Hour with a sailboat, a canoe and a waterfall named only its cabin.
  const golden = { mountain: 2, evergreen: 4, deciduous: 3, bush: 2, cabin: 1, cloud: 4, sailboat: 1, canoe: 1, waterfall: 1, bank: 2, sun: 1 };
  assert.equal(featureLine(golden), 'Features a cabin, a waterfall, a sailboat, a canoe and more.');
  assert.match(featureLine({ stars: 3, moon: 1, mountain: 1 }), /the moon, a sky full of stars and a mountain/, 'the stars are named');
  for (const counts of [hush, golden, { ...golden, rock: 2, island: 1, aurora: 1 }]) {
    const named = featureLine(counts).replace(/^Features | and more\.$/g, '').split(', ');
    assert.ok(named.length <= 4, `more than four named: ${featureLine(counts)}`);
  }
});

test('a bare brown tree or a birch is not called a leafy tree on the label, and the titles still count it as a tree', () =>
  sameDice(() => {
    assert.equal(featureLine({ deciduous: 1, bare: 1 }), 'Features a bare tree.');
    assert.equal(featureLine({ deciduous: 4, bare: 2, birch: 1 }), 'Features a leafy tree, two bare trees and a birch.');
    // A studio's counts, from a real brown tree and a real birch painted onto it.
    const studio = { counts: {}, elements: [], active: [], seq: 0, k: 1, hooks: {}, kick() {}, clampBox: Studio.prototype.clampBox, layer: () => ({ getContext: () => ({ setTransform() {} }) }) };
    for (const [id, say] of [['van-dyke-brown', 'bareTree'], ['titanium-white', 'birch']]) {
      for (let i = 0; i < 200; i++) {
        const S = bareStudio();
        const plan = decide(S, makeSplat({ x: 400, y: 700, R: 26, pigment: paintOf(id) }));
        const st = plan.find((p) => p.say === say);
        if (!st) continue;
        Studio.prototype.addElement.call(studio, st.make());
        break;
      }
    }
    assert.deepEqual([studio.counts.deciduous, studio.counts.bare, studio.counts.birch], [2, 1, 1], 'two deciduous trees: one bare, one birch');
    assert.equal(featureLine(studio.counts), 'Features a bare tree and a birch.');
    assert.doesNotMatch(canvasContents(studio.counts), /leafy/);
    assert.ok(Array.from({ length: 200 }, () => makeTitle(studio.counts, 'golden-hour')).some((t) => /Grove|Thicket/.test(t)), 'still a grove to the titles');
  }));

test('titles say plurals only for things there are two or more of', () => {
  const plural = /\b(Cabins|Hideaways|Homesteads|Moons|Peaks|Ridges|Mountains|Pines|Evergreens)\b/;
  for (const s of SCHEMES) {
    for (let i = 0; i < 400; i++) {
      assert.doesNotMatch(makeTitle({ cabin: 1, moon: 1, mountain: 1, evergreen: 1 }, s.id), plural);
      assert.doesNotMatch(makeTitle({ stars: 2 }, s.id), /\bMoons?\b/, 'stars alone are no moon');
      assert.doesNotMatch(makeTitle({ stars: 2 }, s.id), /Starlit Stars/);
    }
  }
  const many = new Set(Array.from({ length: 400 }, () => makeTitle({ mountain: 3 }, 'golden-hour')));
  assert.ok([...many].some((t) => /Peaks|Ridges|Mountains/.test(t)), 'three mountains can still be Peaks');
});

test('titles name the time of day the mood paints', () => {
  const wrong = { 'golden-hour': /Morning|Night/, 'violet-dusk': /Morning|Afternoon/, 'northern-night': /Morning|Afternoon|Evening/, 'autumn-blaze': /Morning|Evening Night/, 'misty-morning': /Evening|Night\b/, 'winter-hush': /Evening|Night\b/, 'spring-thaw': /Morning|Evening|Night\b/ };
  for (const s of SCHEMES) {
    for (let i = 0; i < 600; i++) {
      const t = makeTitle({ mountain: 2 }, s.id);
      assert.doesNotMatch(t, wrong[s.id], `${s.name}: ${t}`);
      assert.doesNotMatch(t, /\b(\w+) \1\b/, `${s.name}: ${t}`);
    }
  }
});

test('a new title steers clear of the titles already on the wall', () => {
  for (let i = 0; i < 200; i++) {
    const wall = Array.from({ length: 11 }, () => makeTitle({ mountain: 2, evergreen: 3 }, 'golden-hour'));
    assert.ok(!wall.includes(makeTitle({ mountain: 2, evergreen: 3 }, 'golden-hour', wall)), 'a title already on the wall');
  }
});

test('a title never says a word twice, like Ridge at Stillwater Ridge or Silver Morning at Silver Lake', () => {
  const everything = { cabin: 1, mountain: 2, evergreen: 2, deciduous: 2, bush: 1, rock: 2, island: 1, waterfall: 1, sailboat: 2, canoe: 1, moon: 1, stars: 3 };
  const ones = Object.fromEntries(Object.keys(everything).map((k) => [k, 1]));
  for (const s of SCHEMES) {
    for (let i = 0; i < 5000; i++) {
      const t = makeTitle(i % 2 ? everything : ones, s.id);
      const words = t.toLowerCase().split(/[\s,]+/).filter((w) => w !== 'at' && w !== 'the');
      assert.equal(new Set(words).size, words.length, `${s.name}: ${t}`);
    }
  }
});

test('titles on the wall don’t share their place names, or call a grey mountain golden', () => {
  const PLACE_A = ['Hollow', 'Cedar', 'Otter', 'Wren', 'Bramble', 'Silver', 'Miller’s', 'Juniper', 'Heron', 'Quiet', 'Lantern', 'Foxglove', 'Birch', 'Stillwater', 'Old Mill', 'Kestrel'];
  const counts = { mountain: 2, evergreen: 3, deciduous: 2, bush: 1 };
  for (const s of SCHEMES) {
    for (let run = 0; run < 50; run++) {
      const wall = [];
      for (let i = 0; i < 12; i++) wall.push(makeTitle(counts, s.id, wall));
      const used = PLACE_A.map((a) => wall.filter((t) => new RegExp(`(^| at )${a} (Creek|Lake|Cove|Pond|Hollow|Reach|Bend|Ridge|Meadow|Crossing|Narrows|Point)(,|$)`).test(t)).length);
      assert.ok(used.every((n) => n <= 1), `${s.name}: a place name twice in ${wall.join(' / ')}`);
    }
    for (let i = 0; i < 2000; i++) {
      const t = makeTitle({ mountain: 2 }, s.id);
      assert.doesNotMatch(t, /^(The )?(Golden|Amber|Copper|Violet|Silver|Lavender|Russet) (Peak|Ridge|Mountain)s?$/, t);
    }
  }
});

test('a title is more often named for the boat, the cabin or the moon than for the trees', () => {
  const sails = { mountain: 2, evergreen: 3, deciduous: 2, bush: 2, sailboat: 3 };
  const titles = Array.from({ length: 4000 }, () => makeTitle(sails, 'golden-hour'));
  const n = (re) => titles.filter((t) => re.test(t)).length;
  assert.ok(n(/\bSails?\b/) > 2 * n(/\b(Grove|Thicket)s?\b/), `Sails ${n(/\bSails?\b/)}, Groves and Thickets ${n(/\b(Grove|Thicket)s?\b/)}`);
  assert.ok(n(/\bSails?\b/) > 2 * n(/\b(Pine|Evergreen)s?\b/), `Sails ${n(/\bSails?\b/)}, Pines and Evergreens ${n(/\b(Pine|Evergreen)s?\b/)}`);
  // With Cabin at Otter Cove on the wall, a cabin is more likely to be a Hideaway or a Homestead.
  const wall = ['Cabin at Otter Cove'];
  const next = Array.from({ length: 2000 }, () => makeTitle({ cabin: 1, mountain: 1 }, 'golden-hour', wall));
  assert.ok(next.filter((t) => /\bCabin\b/.test(t)).length * 3 < next.filter((t) => /Hideaway|Homestead/.test(t)).length);
});

test('painting time and accident counts read naturally', () => {
  assert.equal(durationText(1), '1 second');
  assert.equal(durationText(42), '42 seconds');
  assert.equal(durationText(59), '59 seconds');
  assert.equal(durationText(60), 'a minute');
  assert.equal(durationText(89), 'a minute');
  assert.equal(durationText(90), '2 minutes');
  assert.equal(durationText(192), '3 minutes');
  assert.equal(durationText(12 * 60 + 20), '12 minutes');
  assert.equal(durationText(59 * 60 + 40), 'about an hour', 'not 60 minutes');
  assert.equal(durationText(3600), 'about an hour');
  assert.equal(durationText(3600 + 2 * 60), 'about an hour');
  assert.equal(durationText(3600 + 23 * 60), 'an hour and 25 minutes');
  assert.equal(durationText(2 * 3600 + 5 * 60), '2 hours and 5 minutes');
  assert.equal(durationText(15 * 3600 + 12 * 60), '15 hours and 10 minutes');
  assert.equal(durationText(24 * 3600), 'about 24 hours');
  assert.equal(madeFrom(1, 20), 'Painted wet-on-wet from one happy accident in 20 seconds.');
  assert.equal(madeFrom(14, 192), 'Painted wet-on-wet from fourteen happy accidents in 3 minutes.', 'in words, like the line above it');
  assert.equal(madeFrom(9, 75), 'Painted wet-on-wet from nine happy accidents in a minute.');
  assert.equal(madeFrom(3, 1), 'Painted wet-on-wet from three happy accidents in 1 second.', 'not 1 seconds');
  assert.equal(madeFrom(20, 60), 'Painted wet-on-wet from twenty happy accidents in a minute.');
  assert.equal(madeFrom(40, 2 * 3600 + 5 * 60), 'Painted wet-on-wet from 40 happy accidents in 2 hours and 5 minutes.');
  assert.equal(madeFrom(0, 2), 'Painted wet-on-wet without a single accident, in 2 seconds.', 'a blank canvas isn’t made from 0 happy accidents');
});

test('a download is named for its title, in whatever script the title is in', () => {
  assert.equal(slug('Last Light at Otter’s Cove'), 'last-light-at-otter-s-cove');
  assert.equal(slug('Café du Lac'), 'cafe-du-lac', 'accents come off');
  assert.equal(slug('غروب فوق البحيرة'), 'غروب-فوق-البحيرة', 'Arabic letters stay');
  assert.equal(slug('שקיעה באגם'), 'שקיעה-באגם', 'Hebrew letters stay');
  assert.equal(slug('नमस्ते दुनिया'), 'नमस्ते-दुनिया', 'Devanagari keeps its vowel signs');
  assert.equal(slug('호수 위의 노을'), '호수-위의-노을', 'Korean stays in whole syllables');
  assert.equal(slug('🌅🌊'), 'happy-accident', 'a title of emoji alone');
  assert.equal(slug(' -- '), 'happy-accident');
  assert.equal(slug(`${'a'.repeat(59)} bcd`), 'a'.repeat(59), 'cut at 60 characters, with no hyphen left at the end');
});

test('the label says when the browser didn’t keep the painting, or took older ones down for it', () => {
  assert.equal(keptNote({ kept: true, dropped: 0 }), '', 'a usual signing says nothing');
  assert.match(keptNote({ kept: false, dropped: 0 }), /won’t go up on the wall\. Download it to keep it\.$/);
  assert.match(keptNote({ kept: false, dropped: 0 }, false), /Save the picture to keep it\.$/, 'with no Download button it doesn’t point at one');
  assert.equal(keptNote({ kept: true, dropped: 0, gone: ['Cabin at Otter Cove'] }), 'Cabin at Otter Cove came down to make room.', 'a full wall doesn’t say which painting came down');
  assert.equal(keptNote({ kept: true, dropped: 1, gone: ['Warm Pines'] }), 'The browser ran short of room, so Warm Pines came down to make space for this one.');
  assert.match(keptNote({ kept: true, dropped: 7, gone: Array(8).fill('x') }), /the eight oldest paintings came down/, 'the count leaves out the one that would have come down anyway');
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
  for (const key of Object.keys(LINES)) {
    for (const s of SCHEMES) for (const auto of [false, true]) assert.ok(linesFor(key, { scheme: s.id, auto }).length > 0, `no lines for ${key} in ${s.id}${auto ? ' (auto)' : ''}`);
  }
});

// Every string anywhere in LINES, however it's nested.
const everyLine = (v = LINES) => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(everyLine) : Object.values(v).flatMap(everyLine));

test('the painter’s lines fit the mood: no evening in the morning, no sun at night', () => {
  // Keys that can't come up in a mood: the sun's at night (it's the moon then) and the moon's by day.
  const never = { 'northern-night': ['sun', 'sunset', 'cloudOverSun'] };
  const byDay = ['moon', 'moonGlow', 'cloudOverMoon'];
  const wrong = {
    morning: /evening|sunset|last of the light|dusk/i,
    evening: /morning|first light|sunrise|up early/i,
    night: /\bsun\b|sunny|sunset|evening|morning|afternoon/i,
    day: /evening|morning|fall came early|now it’s autumn/i,
  };
  const time = { 'golden-hour': 'evening', 'violet-dusk': 'evening', 'misty-morning': 'morning', 'winter-hush': 'morning', 'northern-night': 'night', 'autumn-blaze': 'day', 'spring-thaw': 'day' };
  for (const s of SCHEMES) {
    for (const key of Object.keys(LINES)) {
      if ((never[s.id] || []).includes(key) || (s.id !== 'northern-night' && byDay.includes(key))) continue;
      for (const auto of [false, true]) {
        for (const text of linesFor(key, { scheme: s.id, auto })) assert.doesNotMatch(text, wrong[time[s.id]], `${s.name}, ${key}: ${text}`);
      }
    }
  }
  assert.doesNotMatch(linesFor('autumn', { scheme: 'winter-hush' }).join(' '), /fall came early/i, 'in Winter Hush, fall didn’t come early');
});

test('paint the toy threw itself doesn’t get “you hit him”', () => {
  for (const key of Object.keys(LINES)) {
    for (const s of SCHEMES) for (const text of linesFor(key, { scheme: s.id, auto: true })) assert.doesNotMatch(text, /\byou (hit|touched)\b/i, `${key}: ${text}`);
  }
  assert.ok(linesFor('company').some((t) => /You hit him/.test(t)), 'your own splat still gets “you hit him”');
  for (let i = 0; i < 10; i++) assert.ok(linesFor('company', { auto: true }).includes(line('company', { auto: true })));
  // The intro always paints a bank, before anyone has thrown anything.
  for (const key of ['bank', 'bankTree']) for (const text of linesFor(key, { auto: true })) assert.doesNotMatch(text, /\byour?\b|\bhit it\b/i, `${key}: ${text}`);
  // Nor is any line about the toy's own paint about "your splat" (its first thing is a mountain).
  for (const key of Object.keys(LINES)) {
    for (const s of SCHEMES) for (const text of linesFor(key, { scheme: s.id, auto: true })) assert.doesNotMatch(text, /\byour splat\b|\bwhere you hit\b/i, `${key}: ${text}`);
  }
  assert.ok(linesFor('mountain').some((t) => /your splat/.test(t)), 'your own mountain can still be the top of your splat');
  assert.ok(linesFor('bank').some((t) => /your splat/.test(t)), 'your own bank can still be the shape of your splat');
  assert.ok(!linesFor('bank').some((t) => /land under it/.test(t)), 'a plain bank doesn’t promise something to stand on it');
});

test('the painter has at least three things to say for everything a splat can become, and never the same line twice', async () => {
  const src = await readFile(join(root, 'src/decide.js'), 'utf8');
  const said = new Set(['merge', 'wash']);
  for (const m of src.matchAll(/say: '(\w+)'|say = [^;]*/g)) for (const k of (m[1] ? [m[1]] : [...m[0].matchAll(/[?:] '(\w+)'/g)].map((q) => q[1]))) said.add(k);
  for (const m of src.matchAll(/'(\w+)' : '(\w+)'/g)) said.add(m[1]).add(m[2]);
  for (const k of said) assert.ok(LINES[k], `decide.js says “${k}”, which has no lines`);
  // Everything but what the page itself says around the painting (signing, the wall, the first visit, the intro, Let it
  // happen's end).
  const page = ['signature', 'hung', 'unkept', 'welcome', 'invite', 'nudge', 'done', 'undo'];
  for (const key of Object.keys(LINES).filter((k) => !page.includes(k))) {
    for (const sc of SCHEMES) {
      for (const auto of [false, true]) {
        const n = new Set(linesFor(key, { scheme: sc.id, auto })).size;
        assert.ok(n >= 3, `${key} in ${sc.id}${auto ? ' (auto)' : ''} has only ${n} lines`);
      }
    }
  }
  const all = everyLine();
  const twice = all.filter((t, i) => all.indexOf(t) !== i);
  assert.deepEqual(twice, [], 'lines written into two lists');
  assert.ok(!('tree' in LINES) && !('leave' in LINES), 'lines nobody can hear are gone');
  assert.ok(linesFor('snowyMountain').includes('Push it up, let it be big. Mountains don’t apologize.'), 'a snowy mountain can say the mountain lines too');
});

test('a line doesn’t come round again until most of the others have been said', () => {
  const list = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const got = Array.from({ length: 70 }, () => pickFresh('seven', list));
  for (let i = 7; i < got.length; i++) assert.ok(!got.slice(i - 6, i).includes(got[i]), `${got[i]} again within six: ${got.slice(i - 6, i + 1)}`);
});

test('a short list of lines doesn’t come round in the same order every time', () => {
  // Remembering all but one of up to seven lines left one to pick from after the first pass: A B C A B C forever.
  const periodic = (got, from) => [...Array(8).keys()].slice(1).find((p) => got.slice(from).every((x, i) => x === got[from + i + p] || from + i + p >= got.length));
  for (const n of [4, 5, 7]) {
    const list = Array.from({ length: n }, (_, i) => `line ${i}`);
    const got = Array.from({ length: 400 }, () => pickFresh(`short${n}`, list));
    for (let i = 0; i < got.length; i++) assert.ok(!got.slice(Math.max(0, i - (n - 2)), i).includes(got[i]), `${n} lines: ${got[i]} again within ${n - 2}`);
    assert.equal(periodic(got, 20), undefined, `${n} lines come round in a fixed order: ${got.slice(20, 40).join(' ')}`);
    for (const x of list) assert.ok(got.filter((g) => g === x).length > 400 / n / 2, `${x} hardly ever said`);
  }
  const eleven = Array.from({ length: 11 }, (_, i) => i);
  const got = Array.from({ length: 1000 }, () => pickFresh('eleven', eleven));
  for (let i = 0; i < got.length; i++) assert.ok(!got.slice(Math.max(0, i - 9), i).includes(got[i]), `${got[i]} again sooner than ten picks on`);
  assert.equal(periodic(got, 20), undefined, 'eleven lines in a fixed order');
});

test('the things made most often have plenty to say, so a line doesn’t come round again within ten', () => {
  // With one paint loaded, most of what it makes is one of these (a lab of 400 canvases had 12 to 15% of lines repeat
  // one of the last ten, nearly all from them).
  for (const key of ['cloud', 'glints', 'ripples', 'blueRipples', 'coolCloud', 'stormCloud', 'goldenCloud', 'sunsetCloud']) {
    for (const s of SCHEMES) for (const auto of [false, true]) assert.ok(new Set(linesFor(key, { scheme: s.id, auto })).size >= 11, `${key} in ${s.id}`);
  }
  for (const key of ['sunlitCloud', 'evergreen']) {
    for (const s of SCHEMES) assert.ok(new Set(linesFor(key, { scheme: s.id })).size >= 6, `${key} in ${s.id}`);
  }
});

test('a tall tree with no land under it says “land first” for the land, and the tall tree line with the tree', () =>
  sameDice(() => {
    for (let i = 0; i < 10; i++) {
      const S = bareStudio('golden-hour', { land: () => false });
      const plan = decide(S, makeSplat({ x: 300 + i * 50, y: 120, R: 30, pigment: paintOf('sap-green') }));
      assert.deepEqual(plan.map((st) => [st.kind, st.say]), [['bank', 'bankTree'], ['evergreen', 'tallTree']]);
    }
  }));

test('paints running together are named when there are two and counted when there are more', () => {
  const four = ['Cadmium Yellow', 'Phthalo Blue', 'Sap Green', 'Alizarin Crimson'];
  for (let i = 0; i < 6; i++) {
    const many = mixLine(four, 'brown');
    assert.match(many, /^(Four paints ran together|Four paints make brown|Wet into wet: four paints)\./, many);
    assert.ok(!four.some((n) => many.includes(n)), many);
    const two = mixLine(['Cadmium Yellow', 'Phthalo Blue'], 'green');
    assert.match(two, /Cadmium Yellow and Phthalo Blue/, two);
  }
  assert.match(mixLine(['A', 'B', 'C'], 'grey'), /three paints/i);
});

test('a little paint run into a lot of another that stays its color says it’s still that color', () => {
  // A big yellow and a little blue said "Cadmium Yellow and Phthalo Blue make yellow", like a sum gone wrong.
  const said = [];
  const studio = { dryIn() {}, say() {}, kick() {}, sayMix: Studio.prototype.sayMix, hooks: { onNarrate: (n) => said.push(n.line) } };
  const run = (big, small, R = 46, r = 12) => {
    said.length = 0;
    const a = makeSplat({ x: 600, y: 300, R, pigment: paintOf(big) });
    Studio.prototype.merge.call(studio, a, makeSplat({ x: 610, y: 300, R: r, pigment: paintOf(small) }));
    return { line: said[0], family: a.mixPigment.family };
  };
  for (let i = 0; i < 6; i++) {
    const still = run('cadmium-yellow', 'phthalo-blue');
    assert.equal(still.family, 'yellow');
    assert.match(still.line, /[Ss]till (mostly )?yellow\.$/, still.line);
    assert.match(still.line, /Phthalo Blue.*Cadmium Yellow|Cadmium Yellow.*Phthalo Blue/, still.line);
    assert.doesNotMatch(still.line, /make yellow/, still.line);
    const green = run('cadmium-yellow', 'phthalo-blue', 22, 22);
    assert.equal(green.family, 'green');
    assert.match(green.line, /green/, green.line);
    assert.doesNotMatch(green.line, /[Ss]till/, green.line);
  }
  assert.match(mixLine(['Cadmium Yellow', 'Phthalo Blue', 'Sap Green', 'Bright Red'], 'yellow', 'Cadmium Yellow'), /other three paints|of the others/);
});

test('the brush line names each paint once, and no paint of another hue than the splat’s', () => {
  const paint = (id) => PIGMENTS.find((p) => p.id === id);
  const crimson = toolInfo('cloud', paint('alizarin-crimson'));
  assert.equal(crimson.match(/Alizarin Crimson/g).length, 1, crimson);
  assert.equal(crimson, '1-inch brush · Titanium White, a whisper of Alizarin Crimson');
  assert.equal(toolInfo('cloud', paint('prussian-blue')), '1-inch brush · Titanium White · a touch of Prussian Blue', 'a blue cloud is painted without crimson');
  assert.equal(toolInfo('flowers', paint('phthalo-blue')), 'Liner brush · Phthalo Blue', 'blue flowers are painted in blue, not red');
  // A mixed splat's paint is called “Titanium White and Indian Yellow”: the white was named twice.
  const mixed = (name, family) => ({ id: 'mix', name, family });
  assert.equal(toolInfo('cloud', mixed('Titanium White and Indian Yellow', 'yellow')), '1-inch brush · Titanium White · a touch of Indian Yellow');
  assert.equal(toolInfo('deciduous', mixed('Van Dyke Brown and Cadmium Yellow', 'brown')), 'Round brush · Sap Green, Yellow Ochre, Van Dyke Brown · a touch of Cadmium Yellow');
  assert.equal(toolInfo('deciduous', mixed('Indian Yellow and Phthalo Blue and Bright Red', 'brown')), 'Round brush · Sap Green, Yellow Ochre, Van Dyke Brown · a touch of Indian Yellow, Phthalo Blue and Bright Red');
  assert.equal(toolInfo('cloud', mixed('Titanium White and Alizarin Crimson', 'red')), '1-inch brush · Titanium White, a whisper of Alizarin Crimson', 'nothing to add');
  for (const a of PIGMENTS) {
    for (const b of PIGMENTS) {
      if (a === b) continue;
      for (const kind of Object.keys(LINES)) {
        const text = toolInfo(kind, mixed(`${a.name} and ${b.name}`, a.family));
        for (const name of [a.name, b.name]) assert.ok(text.split(name).length <= 2, `${name} twice: ${text}`);
      }
    }
  }
  const hue = { 'Cadmium Yellow': 'yellow', 'Yellow Ochre': 'yellow', 'Indian Yellow': 'yellow', 'Bright Red': 'red', 'Alizarin Crimson': 'red', 'Sap Green': 'green', 'Phthalo Green': 'green', 'Phthalo Blue': 'blue', 'Prussian Blue': 'blue' };
  for (const kind of [...Object.keys(LINES), 'rain', 'snowShower']) {
    for (const p of PIGMENTS) {
      const text = toolInfo(kind, p);
      if (!text) continue;
      for (const name of Object.keys(hue)) assert.ok((text.match(new RegExp(name, 'g')) || []).length <= 1, `${name} twice: ${text}`);
      if (!['yellow', 'red', 'green', 'blue'].includes(p.family)) continue;
      const named = text.split(' · ').slice(1).join(', ').split(', ');
      const others = named.filter((n) => Object.keys(hue).some((h) => n.includes(h) && hue[h] !== p.family));
      assert.deepEqual(others, [], `${p.name} on ${kind}: ${text}`);
    }
  }
});

test('while the signature goes on, the painter doesn’t ask you to sign it, or say which corner it’s in', () => {
  for (const text of LINES.signature) assert.doesNotMatch(text, /^Now sign|\b(left|right)\b/i, text);
});

test('the painter’s lines use curly apostrophes, like the rest of the page', () => {
  for (const text of everyLine()) assert.doesNotMatch(text, /'/, text);
});

// The painter is their own painter: no catchphrase or paint name borrowed from a real TV painter, in what they say, the
// brushes and paints they name, the label or the page.
test('the painter doesn’t echo a real TV painter', async () => {
  const echoes = /happy little|liquid (white|clear|black)/i;
  const kinds = [...Object.keys(LINES), 'rain', 'snowShower', 'stormCloud', 'treeSnow', 'treeGlow'];
  const texts = [...everyLine(), ...kinds.flatMap((k) => [toolInfo(k), ...PIGMENTS.map((p) => toolInfo(k, p))])];
  const all = Object.fromEntries(['evergreen', 'deciduous', 'bush', 'cabin', 'mountain', 'cloud', 'rock'].map((k) => [k, 3]));
  texts.push(featureLine(all), canvasContents(all), await readFile(join(root, 'index.html'), 'utf8'), await readFile(join(root, 'README.md'), 'utf8'));
  for (const text of texts) assert.doesNotMatch(text, echoes, text.slice(0, 120));
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
      // (At night it's moonlight, whatever the paint: the test for Winter Hush's snow checks that.)
      ...(S.scheme.night ? {} : { 'late light on a pine': [(s) => treeGlow(s, pine, hit('cadmium-yellow')), dark] }),
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

test('a pine’s trunk reaches the ground, however tall the pine', () => sameDice(() => {
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
    assert.ok(median <= Math.max(8, h * 0.015), `a ${h}px pine's trunk stops ${median.toFixed(1)}px above the ground`);
  }
}, 21));

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
  const cap = main.match(/const WALL_SIZE = (\d+);/)?.[1];
  assert.match(main, /\.slice\(0, WALL_SIZE\)/, 'main.js doesn’t keep the wall to WALL_SIZE');
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
  if (plan.some((s) => s.say === 'tallTree')) return 'tall pine';
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
// night or by day, only from some of the family's paints, or only once the canvas has counts of something on it (and
// then only then: a cell is checked on a fresh canvas, and again with each of those counts).
const may = (is, more = {}) => ({ is: [].concat(is), ...more });
const night = { when: 'night' };
const day = { when: 'day' };

// The first table. text is the cell as the README has it. todo marks a cell the code doesn't follow yet.
const CELLS = {
  'high in the sky': {
    white: { text: 'a white cloud, the sun or moon, or stars at night', allows: [may('cloud'), may('sun', day), may('moon', night), may('stars', night)] },
    yellow: { text: 'the sun (or the moon at night), then golden clouds', allows: [may('sun', day), may('moon', night), may('cloud')] },
    red: { text: 'a sunset cloud', allows: [may('cloud')] },
    green: { text: 'the top of a tall pine (or far-off trees, where it would stand in front of another), or an aurora at night', allows: [may('tall pine'), may('aurora', night)] },
    blue: { text: 'a cool cloud, or a storm from Prussian Blue', allows: [may('cloud'), may('storm cloud', { only: ['prussian-blue'] })] },
    brown: {
      text: 'a storm cloud, or birds (until there are eight flocks)',
      allows: [may('storm cloud'), may('birds'), may('storm cloud', { counts: { birds: 8 } }), may('cloud', { counts: { birds: 8 } })],
    },
  },
  'low in the sky': {
    white: { text: 'a snowy mountain or a cloud', allows: [may('mountain'), may('cloud')] },
    yellow: {
      text: 'the sun (or the moon at night), golden clouds, or a golden mountain from Yellow Ochre',
      allows: [may('sun', day), may('moon', night), may('cloud'), may('golden mountain', { only: ['yellow-ochre'] })],
    },
    red: { text: 'a red-rock mountain or a sunset cloud', allows: [may('mountain'), may('cloud')] },
    green: { text: 'a wooded mountain', allows: [may('mountain')] },
    blue: { text: 'a blue mountain or a cool cloud', allows: [may('mountain'), may('cloud')] },
    brown: { text: 'a mountain or a storm cloud', allows: [may('mountain'), may('storm cloud')] },
  },
  'on the lake': {
    white: { text: 'a sailboat, or light on the water', allows: [may('sailboat'), may(['glints', 'ripples'])] },
    yellow: {
      text: 'glints of light, or land or a rock from Yellow Ochre',
      allows: [may('glints', { only: ['cadmium-yellow', 'indian-yellow'] }), may(['land', 'island'], { only: ['yellow-ochre'] }), may('rock', { only: ['yellow-ochre'] })],
    },
    red: { text: 'a canoe, or glints once there are three', allows: [may('canoe'), may('glints', { counts: { canoe: 3 } })] },
    green: { text: 'land, an island or a mossy rock', allows: [may('land'), may('island'), may('mossy rock')] },
    blue: { text: 'ripples, or a pair of loons from a small fleck out in the open', allows: [may('ripples'), may('loons'), may('ripples', { counts: { loons: 3 } })] },
    brown: {
      text: 'land or a rock, a dock right at the shore, or a pair of loons from a small fleck out in the open',
      allows: [
        may(['land', 'island']),
        may('rock'),
        // Only paint within a splat's width of the shore makes a dock, which the rules canvas seldom throws: its own test does.
        may('dock', { rare: true }),
        may('loons'),
        may(['land', 'island'], { counts: { loons: 3, dock: 1 } }),
        may('rock', { counts: { loons: 3, dock: 1 } }),
      ],
    },
  },
  'on land': {
    white: { text: 'a snowy pine, a birch or a white cabin, or flowers from a small splat', allows: [may('snowy pine'), may('birch'), may('cabin'), may('flowers')] },
    yellow: { text: 'a golden tree or bush, or flowers from a small splat', allows: [may('leafy tree'), may('bush'), may('flowers')] },
    red: { text: 'a red tree or bush, or a red cabin, or flowers from a small splat', allows: [may('leafy tree'), may('bush'), may('cabin'), may('flowers')] },
    green: { text: 'pines, leafy trees and bushes', allows: [may('pine'), may('leafy tree'), may('bush')] },
    blue: { text: 'a blue spruce, or flowers from a small splat', allows: [may('blue spruce'), may('flowers')] },
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
// quarter of taps. Only up high: low in the sky (below 0.45 of the way down to the horizon), a tap is what the table says.
// Once there are eight flocks (counts on the canvas), no more birds.
const FLECK_R = 14;
const FLECKS = ['birds', 'stars', 'cloud'];
const fleck = (what, sp, counts = {}) => sp.R < FLECK_R && sp.y < 480 * 0.45 && FLECKS.includes(what) && !(what === 'birds' && (counts.birds || 0) >= 8);

// A splat of any size the page makes: half of them taps (R 11 to 22), half bigger flicks and pours, some stretched.
function throwAt(spot, id) {
  const R = chance(0.5) ? rand(11, 22) : rand(22, 56);
  const speed = chance(0.5) ? 0 : rand(0.4, 2.5);
  const a = rand(TAU);
  return makeSplat({ ...spot, R, pigment: paintOf(id), vx: Math.cos(a) * speed, vy: Math.sin(a) * speed });
}

// Throws n splats of each paint at a place (on a canvas that already has counts of things on it), and returns each
// outcome with the paints that made it, and anything allowed() refused.
function throwMany(place, ids, time, n, allowed, counts = {}) {
  const made = new Map();
  const wrong = new Map();
  for (const id of ids) {
    for (let i = 0; i < n; i++) {
      const S = bareStudio(pick(time === 'night' ? NIGHT : DAY), { land: leftBank, sunUp: chance(0.4), counts });
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
          const sky = place === 'high in the sky';
          const states = [undefined, ...new Set(cell.allows.filter((a) => a.counts).map((a) => JSON.stringify(a.counts)))];
          for (const state of states) {
            const fits = (a, id) => (!a.when || a.when === time) && (!a.only || a.only.includes(id)) && JSON.stringify(a.counts) === state;
            const allowed = (what, id, sp) => cell.allows.some((a) => fits(a, id) && a.is.includes(what)) || (sky && fleck(what, sp, state ? JSON.parse(state) : {}));
            const { made, wrong } = throwMany(place, PAINTS[fam], time, 250, allowed, state ? JSON.parse(state) : {});
            assert.equal(wrong.size, 0, `${state ? `with ${state} on the canvas: ` : ''}${reportWrong(wrong)}`);
            for (const a of cell.allows) {
              if (a.rare) continue;
              const ids = PAINTS[fam].filter((id) => fits(a, id));
              if (!ids.length) continue;
              assert.ok(
                a.is.some((what) => [...(made.get(what) || [])].some((id) => ids.includes(id))),
                `${a.is.join(' or ')} never turned up${state ? ` with ${state} on the canvas` : ''} (made: ${[...made.keys()].join(', ')})`,
              );
            }
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
          if (fleck(what, sp)) return true;
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

test('a tap low in the sky is never birds, stars or a wisp, whatever the paint', () =>
  sameDice(() => {
    for (const p of PIGMENTS) {
      for (const time of ['day', 'night']) {
        for (let i = 0; i < 200; i++) {
          const S = bareStudio(pick(time === 'night' ? NIGHT : DAY), { land: leftBank, sunUp: chance(0.4) });
          const plan = decide(S, makeSplat({ ...PLACES['low in the sky'](S), R: rand(11, 22), pigment: p }));
          const [first] = plan;
          assert.ok(!['birds', 'stars'].includes(first.kind) && first.say !== 'wisp', `${p.name} low in the sky by ${time} became ${first.say ?? first.kind}`);
        }
      }
    }
  }, 33));

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
  { row: ['an evergreen', 'yellow or red', 'late light (moonlight at night) catches its side'], targets: ['evergreen'], paints: YELLOW_RED, first: () => ['treeGlow'] },
  { row: ['a leafy tree or bush', 'yellow or red', 'it turns to autumn'], targets: ['deciduous', 'bush'], paints: YELLOW_RED, first: () => ['autumn'] },
  {
    row: ['a tree', 'anything else', 'a friend grows next to it, two at most (after that, or with no ground beside it, light catches it once)'],
    targets: ['evergreen', 'deciduous', 'birch', 'bush', 'island tree'],
    paints: [...PAINTS.green, ...PAINTS.blue, ...PAINTS.brown],
    first: (target) => (target === 'island tree' ? ['treeGlow'] : ['friend']),
  },
  {
    row: ['a mountain', 'white / blue / yellow or red / green', 'fresh snow / a waterfall (or mist, right at its foot) / alpenglow / trees up the slope'],
    targets: ['mountain'],
    paints: [...PAINTS.white, ...PAINTS.blue, ...YELLOW_RED, ...PAINTS.green],
    first: (target, fam) => ({ white: ['snowfall'], blue: ['waterfall'], yellow: ['alpenglow'], red: ['alpenglow'], green: ['foothills'] })[fam],
  },
  { row: ['a mountain', 'anything else', 'trees up the slope, or a drift of mist'], targets: ['mountain'], paints: PAINTS.brown, first: () => ['foothills', 'mist'] },
  { row: ['the sun or moon', 'warm or white', 'the whole sky warms into a sunset, or lights up around the moon'], targets: ['sun'], paints: [...PAINTS.white, ...YELLOW_RED], first: () => ['sunset'] },
  { row: ['the sun or moon', 'anything else', 'a cloud drifts across it'], targets: ['sun'], paints: [...PAINTS.green, ...PAINTS.blue, ...PAINTS.brown], first: () => ['cloudOverSun'] },
  { row: ['a cloud', 'something dark', 'it turns stormy and rains, or snows in Winter Hush (once four clouds are raining or snowing, only stormy)'], targets: ['cloud'], paints: [...PAINTS.blue, ...PAINTS.brown], first: () => ['storm'] },
  { row: ['a cloud', 'yellow or red', 'its edges catch the light'], targets: ['cloud'], paints: YELLOW_RED, first: () => ['sunlitCloud'] },
  {
    row: ['the cabin', 'white / warm / anything', 'snow on the roof / the lights come on (if they aren\'t on already) / the lights come on, or a garden'],
    targets: ['cabin', 'lit cabin'],
    paints: PIGMENTS.map((p) => p.id),
    first: (target, fam) => (fam === 'white' ? ['roofSnow'] : target === 'lit cabin' ? ['garden'] : fam === 'yellow' || fam === 'red' ? ['lights'] : ['lights', 'garden']),
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

test('paint on something with nothing left to change lands beside it, not inside it', () =>
  sameDice(() => {
    // A rock that already has its moss and snow: whatever the paint makes on the water is next to it, never a sail
    // growing out of it or a canoe hidden behind it. Red on the lake is still a canoe.
    const reachOf = (spec) => (spec.kind === 'rock' ? spec.meta.w / 2 : spec.meta.size * 0.5);
    for (const id of PIGMENTS.map((p) => p.id)) {
      for (let i = 0; i < 30; i++) {
        const rock = { ...TARGETS.rock(bareStudio()), touched: new Set(['moss', 'snow']) };
        const S = bareStudio(pick(DAY), { land: leftBank, target: rock });
        S.elements.push(rock);
        const plan = decide(S, makeSplat({ ...hitOn('rock', rock), R: rand(12, 26), pigment: paintOf(id) }));
        const spec = plan[0].make();
        if (id === 'bright-red' || id === 'alizarin-crimson') assert.equal(spec.kind, 'canoe', `red on a rock made ${spec.kind}`);
        if (!['rock', 'sailboat', 'canoe'].includes(spec.kind)) continue;
        const gap = Math.abs(spec.meta.x - rock.meta.x) - reachOf(spec) - rock.meta.w / 2;
        assert.ok(gap >= 0, `${paintOf(id).name} on a rock made a ${spec.kind} overlapping it by ${(-gap).toFixed(0)}px`);
      }
    }
    // With no room beside it (a rock in a narrow channel), paint on it is ripples or glints at its waterline.
    for (const id of ['bright-red', 'titanium-white', 'phthalo-blue']) {
      const rock = { ...TARGETS.rock(bareStudio()), touched: new Set(['moss', 'snow']) };
      const S = bareStudio('golden-hour', { land: (x, y) => y > 480 && Math.abs(x - 600) > 30, target: rock });
      S.elements.push(rock);
      const spec = decide(S, makeSplat({ ...hitOn('rock', rock), R: 20, pigment: paintOf(id) }))[0].make();
      assert.ok(['ripples', 'glints'].includes(spec.kind), `${paintOf(id).name} on a rock with no room beside it made ${spec.kind}`);
    }
    // A cabin with its snow, lights and garden: a tree from more paint stands beside it, not behind its middle.
    for (const id of ['sap-green', 'phthalo-blue', 'van-dyke-brown', 'bright-red']) {
      for (let i = 0; i < 20; i++) {
        const cabin = { ...TARGETS.cabin(bareStudio()), touched: new Set(['snow', 'garden']) };
        cabin.meta.glow = true;
        const S = bareStudio(pick(DAY), { land: leftBank, target: cabin });
        S.reserve('cabin');
        const spec = decide(S, makeSplat({ ...hitOn('cabin', cabin), R: rand(14, 24), pigment: paintOf(id) }))[0].make();
        if (!spec.meta?.type) continue;
        assert.ok(spec.meta.x < cabin.meta.x0 || spec.meta.x > cabin.meta.x1, `${paintOf(id).name} on a finished cabin planted a ${spec.kind} inside it`);
      }
    }
    // A tree out on an island with nothing left to change: red is flowers at its foot, not a canoe hidden behind it.
    const lonely = { ...TARGETS['island tree'](bareStudio()), touched: new Set(['snow', 'glow']) };
    const S = bareStudio('golden-hour', { land: leftBank, target: lonely });
    assert.equal(decide(S, makeSplat({ ...hitOn('tree', lonely), R: 18, pigment: paintOf('bright-red') }))[0].kind, 'flowers');
  }, 51));

test('a friend grown by paint on a tree is the tree that paint grows', () =>
  sameDice(() => {
    // The paint's color decides: blue on a birch grows a blue spruce, not a maple in the mood's leaves; white (once the
    // tree has its snow) a snowy pine or a birch; brown a bare tree or a bush. Green, the plain tree color, grows one of
    // the tree's own kind.
    const grows = (target, id, touched = []) => {
      const el = { ...TARGETS[target](bareStudio('autumn-blaze')), touched: new Set(touched) };
      const plan = decide(bareStudio('autumn-blaze', { land: leftBank, target: el }), makeSplat({ ...hitOn('tree', el), R: 18, pigment: paintOf(id) }));
      assert.equal(plan[0].say, 'company', `${id} on a ${target} didn't grow a friend`);
      const spec = plan[0].make();
      return { spec, kinds: plan.map((s) => s.kind), say: plan[0].say };
    };
    for (let i = 0; i < 20; i++) {
      for (const target of ['birch', 'deciduous', 'evergreen', 'bush']) {
        const blue = grows(target, 'phthalo-blue');
        assert.equal(blue.spec.kind, 'evergreen', `blue on a ${target} grew a ${blue.spec.kind}`);
        const white = grows(target, 'titanium-white', ['snow']);
        assert.ok(white.kinds.includes('treeSnow') || white.spec.meta.type === 'deciduous', `white on a ${target} grew a ${white.spec.kind} with no snow`);
        assert.ok(['deciduous', 'bush'].includes(grows(target, 'van-dyke-brown').spec.kind), `brown on a ${target} grew an evergreen`);
        assert.equal(grows(target, 'sap-green').spec.kind, target === 'birch' ? 'deciduous' : target, `green on a ${target} grew another kind of tree`);
      }
    }
  }, 61));

test('snow on a pine sits on its branches and leaves it dark underneath', () =>
  sameDice(() => {
    // Snow used to cover every branch of every tier nearly to its tip, which painted a pine solid white. Measured as the
    // ink the strokes lay down (length times width), the snow now comes to well under half of the dark needles'.
    const S = bareStudio();
    const ink = (ops) => {
      let total = 0;
      let at = [0, 0];
      const ctx = new Proxy(
        {},
        {
          get: (t, k) => (k === 'moveTo' ? (x, y) => (at = [x, y]) : k === 'quadraticCurveTo' ? (cx, cy, x, y) => (total += Math.hypot(x - at[0], y - at[1]) * t.lineWidth) : k in t ? t[k] : () => {}),
          set: (t, k, v) => ((t[k] = v), true),
        },
      );
      for (const op of ops) op(ctx);
      return total;
    };
    let snow = 0;
    let needles = 0;
    for (let i = 0; i < 20; i++) {
      const pine = P.evergreen(S, { x: 300, baseY: 800, h: 220, tint: [60, 90, 40] });
      snow += ink(treeSnowOf(S, { ...pine }, { tint: [244, 242, 234] }).ops);
      needles += ink(pine.ops.slice(1, 1 + Math.ceil(pine.meta.tiers.length / 2)));
    }
    assert.ok(snow / needles < 0.35, `the snow is ${Math.round((100 * snow) / needles)}% of the needles`);
  }, 71));

test('trees up a mountain’s slope are painted only on the mountain', () =>
  sameDice(() => {
    // Every stroke of them is clipped to the mountain's outline, as a waterfall is, so on a low mountain or near a summit
    // they don't climb into the empty sky. Green on a mountain, and a green mountain's own trees.
    const clippedToIt = (spec, path) =>
      spec.ops.every((op) => {
        const calls = [];
        const gradient = { addColorStop() {} };
        op(new Proxy({}, { get: (t, k) => (k in t ? t[k] : (...a) => (calls.push([k, a[0]]), gradient)), set: (t, k, v) => ((t[k] = v), true) }));
        return calls[0]?.[0] === 'save' && calls[1]?.[0] === 'clip' && calls[1][1] === path;
      });
    for (let i = 0; i < 10; i++) {
      const el = { ...TARGETS.mountain(bareStudio()) };
      const S = bareStudio('golden-hour', { land: leftBank, target: el });
      const plan = decide(S, makeSplat({ ...hitOn('mountain', el), R: 20, pigment: paintOf('sap-green') }));
      assert.equal(plan[0].kind, 'foothills');
      assert.ok(clippedToIt(plan[0].make(), el.meta.path), 'trees up the slope reach past the mountain');
      const green = decide(bareStudio(), makeSplat({ x: 600, y: 400, R: 40, pigment: paintOf('sap-green'), hint: 'mountain' }));
      const mountain = green[0].make();
      green[0].spec = mountain;
      assert.ok(clippedToIt(green[1].make(mountain), mountain.meta.path), 'a green mountain’s trees reach past it');
    }
  }, 81));

test('a cloud painted just above the horizon stays clear of it', () =>
  sameDice(() => {
    // Its puffs and flat base used to reach below the horizon, where the lake cut the cloud off flat.
    const S = bareStudio();
    for (let i = 0; i < 200; i++) {
      const sp = makeSplat({ x: 600, y: S.hy * rand(0.85, 0.94), R: rand(15, 45), pigment: paintOf('titanium-white') });
      const { meta } = P.cloud(S, { x: sp.x, y: sp.y, R: sp.R, tint: sp.pigment.rgb, elong: sp.stretch, shape: splatShape(sp) });
      const lowest = Math.max(meta.baseY, ...meta.puffs.map((pf) => pf.y + pf.r * 0.9));
      assert.ok(lowest <= S.hy - 6, `a cloud from a splat ${Math.round(S.hy - sp.y)}px above the horizon reaches ${Math.round(lowest - S.hy)}px below it`);
    }
  }, 91));

test('a canoe or a sailboat near the horizon is big enough to see', () =>
  sameDice(() => {
    // A red tap far out on the lake made a canoe 12px long and 2px tall while the painter said it was a canoe.
    const S = bareStudio();
    for (let i = 0; i < 100; i++) {
      const R = rand(11, 22);
      const y = S.hy + rand(3, 40);
      const c = canoe(S, { x: 600, y, R, tint: paintOf('bright-red').rgb });
      assert.ok(c.meta.size >= Math.max(28, R * 1.3), `a canoe from a tap of R ${R.toFixed(0)} was ${c.meta.size.toFixed(0)}px long`);
      assert.ok(P.sailboat(S, { x: 600, y, R: 15, tint: paintOf('titanium-white').rgb }).meta.size >= 20, 'a sailboat was too small to see');
    }
  }, 101));

test('a new bank laid over older land draws its water line only where it meets water', () =>
  sameDice(() => {
    // Its shore scrapes (and a far shore's dark reflection) were tapped all along the shore, so where the new bank's shore
    // ran across older ground they made rows of light marks in the grass.
    const inside = (pts, x, y) => {
      let hit = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i];
        const [xj, yj] = pts[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
      }
      return hit;
    };
    const scheme = SCHEMES.find((s) => s.id === 'golden-hour');
    const waterLine = `rgba(${scheme.waterLine.map(Math.round).join(',')},0.7)`;
    let marks = 0;
    let onGround = 0;
    for (let i = 0; i < 40; i++) {
      const left = i % 2 === 0;
      const at = (u) => (left ? u : 1200 - u);
      const far = i % 4 >= 2;
      const old = decide(bareStudio('golden-hour', { land: () => false }), makeSplat({ x: at(rand(260, 330)), y: 480 + (far ? rand(120, 150) : rand(220, 300)), R: rand(36, 50), pigment: paintOf('sap-green'), hint: 'bank' }))[0].make();
      const ground = (x, y) => inside(old.meta.outline, x, y);
      const S = bareStudio('golden-hour', { land: ground });
      const fresh = decide(S, makeSplat({ x: at(rand(150, 230)), y: 480 + (far ? rand(60, 110) : rand(160, 210)), R: rand(36, 50), pigment: paintOf('sap-green'), hint: 'bank' }))[0].make();
      const solid = (x, y) => [[0, 0], [-12, 0], [12, 0], [0, -12], [0, 12]].every(([dx, dy]) => ground(x + dx, y + dy));
      let style = '';
      const ctx = new Proxy({}, {
        get: (t, k) => {
          if (k === 'moveTo') return (x, y) => {
            if (style.replace(/\s/g, '') !== waterLine) return;
            marks++;
            if (solid(x, y)) onGround++;
          };
          // a far shore's dark reflection, under the shore point it's drawn for
          if (k === 'fillRect') return (x, y) => {
            marks++;
            if (solid(x + 6, y + 1)) onGround++;
          };
          return k in t ? t[k] : () => ({ addColorStop() {} });
        },
        set: (t, k, v) => {
          if (k === 'strokeStyle') style = String(v);
          t[k] = v;
          return true;
        },
      });
      fresh.ops.at(-1)(ctx);
    }
    assert.ok(marks > 100, `only ${marks} water-line marks were drawn`);
    assert.equal(onGround, 0, `${onGround} of ${marks} water-line marks landed on solid ground`);
  }, 111));

test('a tall pine grown from green at the very top stays on the canvas', () =>
  sameDice(() => {
    // It grew to the height of the canvas and more, so its tip ran off the top, under the easel's clamp.
    for (let i = 0; i < 40; i++) {
      const bare = i % 2 === 0;
      const S = bareStudio('golden-hour', bare ? { land: () => false } : {});
      const plan = decide(S, makeSplat({ x: rand(100, 1100), y: rand(2, 30), R: rand(16, 40), pigment: paintOf('sap-green') }));
      const prev = bare ? plan[0].make() : undefined;
      const pine = plan.at(-1).make(prev);
      assert.equal(pine.kind, 'evergreen');
      assert.ok(pine.bbox.y >= 4, `a tall pine${bare ? ' on new land' : ''} reaches ${Math.round(pine.bbox.y)}px from the top`);
    }
  }, 121));

test('snow on a leafy tree rests on the tops of its clumps, and the leaves show through', () =>
  sameDice(() => {
    // It used to cover the top half of every clump nearly solid, a white patch in the crown. Now every dab sits on a
    // clump's top cap, and the snow's dabs come to well under the leaves'.
    const S = bareStudio();
    const dabs = (ops) => {
      const at = [];
      const ctx = new Proxy({}, { get: (t, k) => (k === 'ellipse' ? (x, y) => at.push([x, y]) : k in t ? t[k] : () => {}), set: (t, k, v) => ((t[k] = v), true) });
      for (const op of ops) op(ctx);
      return at;
    };
    let snow = 0;
    let leaves = 0;
    for (let i = 0; i < 20; i++) {
      const tree = P.deciduous(S, { x: 300, baseY: 800, h: 220, tint: paintOf('bright-red').rgb });
      leaves += dabs(tree.ops).length;
      const { clusters } = tree.meta;
      const ops = treeSnowOf(S, { ...tree }, { tint: [244, 242, 234] }).ops;
      ops.forEach((op, j) => {
        const cl = clusters[j];
        for (const [x, y] of dabs([op])) {
          snow++;
          assert.ok(cl.y - y > cl.r * 0.3 - (x - cl.x) * S.lightDir * 0.3 - 1e-6, `a dab of snow sat ${Math.round(y - cl.y)}px below the top of a clump ${Math.round(cl.r)}px across`);
        }
      });
    }
    assert.ok(snow > 0, 'no snow at all');
    assert.ok(snow / leaves < 0.15, `the snow is ${Math.round((100 * snow) / leaves)}% of the leaves`);
  }, 131));

test('the moods come round like a shuffled deck: all seven in every seven canvases, and never the same twice running', () =>
  sameDice(() => {
    const N = SCHEMES.length;
    assert.equal(N, 7, 'seven moods, as the README says');
    // Picked at random, avoiding only the last, a given mood was missing from the first five canvases a third of the time.
    for (let run = 0; run < 200; run++) {
      let used = [];
      let last;
      const seen = [];
      for (let i = 0; i < N * 3; i++) {
        const s = pickScheme(last, used);
        assert.notEqual(s.id, last, `${s.name} twice running`);
        used = moodsAfter(used, s.id);
        last = s.id;
        seen.push(s.id);
      }
      for (let at = 0; at < N * 3; at += N) assert.equal(new Set(seen.slice(at, at + N)).size, N, `canvases ${at + 1} to ${at + N} were ${seen.slice(at, at + N).join(', ')}`);
    }
    // A round already started on an earlier visit carries on; a mood asked for by name left one mood out of the bag.
    assert.deepEqual(moodsAfter(['golden-hour'], 'violet-dusk'), ['golden-hour', 'violet-dusk']);
    const most = SCHEMES.slice(0, N - 1).map((s) => s.id);
    assert.equal(pickScheme(most.at(-1), most).id, SCHEMES[N - 1].id, 'the last mood left in the round');
    const next = pickScheme(SCHEMES[N - 1].id, most);
    assert.notEqual(next.id, SCHEMES[N - 1].id, 'a new round still avoids the mood just painted');
    assert.deepEqual(moodsAfter(most, next.id), [next.id], 'a new round starts with the mood it picked');
  }, 141));

test('Spring Thaw: blossom in the leafy trees, snow on the peaks and nowhere else', () =>
  sameDice(() => {
    const spring = SCHEMES.find((s) => s.id === 'spring-thaw');
    assert.ok(spring, 'there is a Spring Thaw mood');
    assert.equal(spring.snow, false, 'no snow on the trees, the cabin or the ground');
    // Every color a list of ops paints with, as the canvas would read it back (rgba(r,g,b,a) with the spaces taken out).
    const colors = (ops) => {
      const seen = new Set();
      const ctx = new Proxy({}, {
        get: (t, k) => (k in t ? t[k] : () => ({ addColorStop() {} })),
        set: (t, k, v) => {
          if (k === 'fillStyle' || k === 'strokeStyle') seen.add(String(v).replace(/\s/g, '').replace(/,[\d.]+\)$/, ')').replace('rgba', 'rgb'));
          t[k] = v;
          return true;
        },
      });
      for (const op of ops) op(ctx);
      return [...seen];
    };
    const near = (list, rgb, d = 18) => list.some((c) => {
      const m = c.match(/rgb\(([\d.]+),([\d.]+),([\d.]+)\)/);
      return m && Math.hypot(m[1] - rgb[0], m[2] - rgb[1], m[3] - rgb[2]) < d;
    });
    const pink = spring.blossom[0];
    for (const id of SCHEMES.map((s) => s.id)) {
      const S = bareStudio(id);
      const tree = P.deciduous(S, { x: 300, baseY: 800, h: 220, tint: paintOf('sap-green').rgb, leaf: [[36, 58, 28], [70, 105, 42], [143, 174, 69], [216, 224, 122]] });
      assert.equal(near(colors(tree.ops), pink), id === 'spring-thaw', `${id}: blossom ${id === 'spring-thaw' ? 'missing from' : 'in'} a leafy green tree`);
      const bare = P.deciduous(S, { x: 300, baseY: 800, h: 220, tint: paintOf('van-dyke-brown').rgb, bare: true });
      assert.ok(!near(colors(bare.ops), pink), `${id}: blossom on a bare tree`);
    }
    // A brown mountain gets its snowy tops in Spring Thaw, as in Winter Hush, and not in Golden Hour.
    const snowy = (id) => {
      let n = 0;
      for (let i = 0; i < 10; i++) {
        const S = bareStudio(id);
        if (near(colors(P.mountain(S, { x: 600, y: 200, R: 40, index: 0, tint: paintOf('van-dyke-brown').rgb }).ops), S.scheme.mtn.snow, 6)) n++;
      }
      return n;
    };
    assert.ok(snowy('spring-thaw') >= 8, `snow on ${snowy('spring-thaw')} of 10 Spring Thaw mountains`);
    assert.equal(snowy('golden-hour'), 0, 'snow on a Golden Hour mountain');
  }, 151));

test('a storm cloud, a cool cloud and a sunset cloud each get their own brush line', () => {
  // Every cloud got the white cloud's: a storm cloud from an Oops was "Titanium White, a whisper of Alizarin Crimson".
  const brown = paintOf('van-dyke-brown');
  assert.doesNotMatch(toolInfo('stormCloud'), /Titanium White/);
  assert.equal(toolInfo('cloud', brown, 'stormCloud'), '1-inch brush · Midnight Black, Prussian Blue · a touch of Van Dyke Brown');
  assert.match(toolInfo('cloud', paintOf('phthalo-blue'), 'coolCloud'), /Phthalo Blue/);
  assert.match(toolInfo('cloud', paintOf('bright-red'), 'sunsetCloud'), /Alizarin Crimson/);
  assert.equal(toolInfo('cloud', paintOf('titanium-white'), 'wisp'), toolInfo('cloud', paintOf('titanium-white')), 'a line with no brush of its own uses the kind’s');
});

test('blue too near a mountain’s foot paints mist, and the mountain can still get its waterfall', () =>
  sameDice(() => {
    for (let i = 0; i < 20; i++) {
      const el = { ...TARGETS.mountain(bareStudio()) };
      const m = el.meta;
      // Out along the ridge, where the slope is too low for water to fall.
      let x = m.ridge[0][0] + 2;
      while (x < m.peak[0] && m.base - 4 - ridgeAt(m, x) < 18) x += 2;
      x -= 6;
      const S = bareStudio('golden-hour', { land: leftBank, target: el });
      const blue = (at) => decide(S, makeSplat({ ...at, R: 16, pigment: paintOf('phthalo-blue') }));
      const low = blue({ x, y: m.base - 3 });
      assert.equal(low[0].make().kind, 'mist', 'blue right at the foot paints mist');
      const high = blue({ x: m.peak[0], y: m.peak[1] + m.hgt * 0.3 });
      assert.equal(high[0].kind, 'waterfall', 'after mist, blue on the mountain tries for a waterfall again');
      assert.equal(high[0].make().kind, 'waterfall');
      assert.notEqual(blue({ x: m.peak[0], y: m.peak[1] + m.hgt * 0.3 })[0].kind, 'waterfall', 'only one waterfall');
    }
  }, 151));

test('paint flung off the picture lands just inside its edge, and paint well inside stays where it landed', () => {
  const white = PIGMENTS[0];
  for (let i = 0; i < 200; i++) {
    const R = rand(14, 64);
    const fast = makeSplat({ x: 1250, y: 940, R, vx: rand(0.3, 3.2), vy: 0.2, pigment: white });
    const margin = Math.min(fast.R * fast.stretch * 0.6, 1200 * 0.2);
    landInside(fast);
    assert.ok(Math.abs(fast.x - (1200 - margin)) < 1e-9 && fast.x > 1200 * 0.75, `off the right edge it landed at x ${fast.x.toFixed(1)}`);
    assert.ok(Math.abs(fast.y - (900 - Math.min(fast.R * fast.stretch * 0.6, 900 * 0.2))) < 1e-9, `off the bottom it landed at y ${fast.y.toFixed(1)}`);
    const left = landInside(makeSplat({ x: -80, y: -30, R, vx: -1, pigment: white }));
    assert.ok(left.x > 0 && left.y > 0 && left.x < 1200 * 0.25, 'off the top left it lands just inside the corner');
    const inside = landInside(makeSplat({ x: 600, y: 450, R, vx: 1, pigment: white }));
    assert.deepEqual([inside.x, inside.y], [600, 450], 'paint landing well inside the picture moved');
  }
});

// Birds stand out from the sky behind them in every mood, dark paint at night too (70% Prussian Blue on Northern
// Night's near-black bird color was the color of the night sky). Checked over the sky where birds fly, from the top
// down to three quarters of the way to the horizon, with and without the mood's glow over it.
test('birds in dark paint can be seen against the sky in every mood', () => {
  for (const s of SCHEMES) {
    for (const id of ['prussian-blue', 'phthalo-blue', 'van-dyke-brown', 'sap-green']) {
      const paint = PIGMENTS.find((p) => p.id === id).rgb;
      for (let t = 0; t <= 0.75; t += 0.05) {
        for (const glow of [0, 0.2, 0.45]) {
          const sky = mix(ramp(s.sky, t), s.glow, glow);
          const gap = Math.abs(lum(birdColor(s, paint, sky)) - lum(sky));
          assert.ok(gap >= 0.15, `${s.name}, ${id} birds ${(t * 100).toFixed(0)}% down the sky differ from it by ${gap.toFixed(3)}`);
        }
      }
    }
  }
  // Where the paint already stands out, the birds keep most of it.
  const golden = SCHEMES.find((s) => s.id === 'golden-hour');
  assert.deepEqual(birdColor(golden, PIGMENTS.find((p) => p.id === 'van-dyke-brown').rgb, [248, 220, 154]), mix(golden.bird, hex('#3e2b1d'), 0.7));
  // At night the painter says so.
  assert.ok(linesFor('birds', { scheme: 'northern-night' }).includes('Night birds, heading home.'));
  assert.ok(!linesFor('birds', { scheme: 'golden-hour' }).includes('Night birds, heading home.'));
});

// Bright Red lettering is lost on red or orange paint (autumn leaves) and on dark ground (night), so the signature
// looks at both bottom corners and goes where it can be read, or over a pale underpaint if it can't be read in either.
test('the signature goes in a bottom corner it can be read in', () => {
  const S = { W: 1200, H: 900 };
  const patch = (rgb) => Array.from({ length: 64 }, () => rgb);
  const fake = (right, left) => (box) => patch(box.x > 600 ? right : left);
  const grass = [120, 150, 90];
  const autumn = [226, 120, 40];
  const night = [12, 30, 28];
  assert.equal(poorGround(patch(autumn)), true, 'orange leaves');
  assert.equal(poorGround(patch(hex('#c9321f'))), true, 'Bright Red');
  assert.equal(poorGround(patch(night)), true, 'night ground');
  assert.equal(poorGround(patch(grass)), false, 'grass');
  assert.equal(poorGround(patch(hex('#f2c21a'))), false, 'yellow is still a field red can be read on');
  const at = (sample) => signSpot(S, 150, 66, sample);
  const right = at(fake(grass, autumn));
  assert.deepEqual([right.x, right.y, right.under], [1200 - 28 - 150, 900 - 22 - 66, false], 'on grass it signs bottom right');
  assert.deepEqual([at(fake(autumn, grass)).x, at(fake(autumn, grass)).under], [28, false], 'on red leaves at the right it signs bottom left');
  assert.deepEqual([at(fake(night, grass)).x, at(fake(night, grass)).under], [28, false], 'on dark ground at the right it signs bottom left');
  const both = at(fake(autumn, night));
  assert.deepEqual([both.x, both.under], [1200 - 28 - 150, true], 'with neither corner readable it signs bottom right over an underpaint');
  assert.deepEqual(at(undefined), { ...right, under: false }, 'without a look at the painting it signs bottom right');
  // A long name in the left corner still stays on the canvas.
  const long = signSpot(S, 500, 66, fake(autumn, grass));
  assert.ok(long.x >= 0 && long.x + 500 <= 1200);
});

test('accidents that pick their own paint pick one that suits the mood', () =>
  sameDice(() => {
    const share = (mood, hints, fams, n = 600) => {
      const scheme = SCHEMES.find((s) => s.id === mood);
      let hit = 0;
      for (let i = 0; i < n; i++) if (fams.includes(paintFor(hints[i % hints.length], scheme).family)) hit++;
      return hit / n;
    };
    // A snowy pine or a birch in Golden Hour, Misty Morning or Violet Dusk came from an accident picking white for a tree.
    for (const s of SCHEMES.filter((m) => !m.snow)) {
      for (const hint of ['tree', 'treeline']) assert.equal(share(s.id, [hint], ['white'], 300), 0, `${s.name} picked white for a ${hint}`);
    }
    for (const s of SCHEMES.filter((m) => m.snow)) assert.ok(share(s.id, ['tree'], ['white'], 600) > 0, `${s.name} never picked white for a tree`);
    // Winter Hush leans to its whites, greens and blues, and Autumn Blaze to its reds and yellows, for every kind of aim.
    const all = ['cloud', 'mountain', 'sun', 'birds', 'treeline', 'bank', 'tree', 'cabin', 'water', 'rock', 'island', 'stars', 'aurora'];
    const cold = ['white', 'green', 'blue'];
    const warm = ['red', 'yellow'];
    assert.ok(share('winter-hush', all, cold) > share('golden-hour', all, cold) + 0.1, 'Winter Hush doesn’t favor whites, greens and blues');
    assert.ok(share('autumn-blaze', all, warm) > share('golden-hour', all, warm) + 0.1, 'Autumn Blaze doesn’t favor reds and yellows');
    assert.ok(share('autumn-blaze', ['tree'], warm) > share('winter-hush', ['tree'], warm) * 2, 'Autumn Blaze grows no more red and yellow trees than Winter Hush');
  }, 71));

test('an accident aimed at a rock, an island, stars or an aurora makes one', () =>
  sameDice(() => {
    const throwAim = (mood, hint, id, spot) => {
      const S = bareStudio(mood, { land: leftBank });
      return decide(S, makeSplat({ ...spot(S), pigment: paintOf(id), hint }));
    };
    for (let i = 0; i < 30; i++) {
      const day = pick(DAY);
      for (const id of ['van-dyke-brown', 'yellow-ochre', 'sap-green']) {
        const rock = outcomeOf(throwAim(day, 'rock', id, (S) => ({ x: rand(400, 800), y: S.hy + rand(40, 300), R: rand(10, 18) })));
        assert.equal(rock, id === 'sap-green' ? 'mossy rock' : 'rock', `${id} aimed at a rock made ${rock}`);
        const island = throwAim(day, 'island', id, (S) => ({ x: rand(450, 750), y: S.hy + rand(60, 250), R: rand(30, 44) }));
        assert.equal(island[0].kind, 'island', `${id} aimed at an island made ${island[0].kind}`);
      }
      for (const id of ['titanium-white', 'cadmium-yellow']) {
        const stars = outcomeOf(throwAim('northern-night', 'stars', id, (S) => ({ x: rand(100, 1100), y: S.hy * rand(0.06, 0.4), R: rand(10, 13) })));
        assert.equal(stars, 'stars', `${id} aimed at stars made ${stars}`);
      }
      const aurora = outcomeOf(throwAim('northern-night', 'aurora', 'sap-green', (S) => ({ x: rand(180, 1020), y: S.hy * rand(0.15, 0.5), R: rand(28, 42) })));
      assert.equal(aurora, 'aurora', `green aimed at an aurora made ${aurora}`);
    }
  }, 72));

test('a tree grows two friends at most: then light catches it once, and after that the paint lands beside it', () =>
  sameDice(() => {
    // In a long session about 40% of the paint landing on something grew a friend, and every friend could grow more,
    // until a wall of trees hid the lake.
    for (const target of ['evergreen', 'deciduous', 'bush']) {
      for (const id of ['sap-green', 'phthalo-blue', 'van-dyke-brown']) {
        for (let n = 0; n < 5; n++) {
          const el = { ...TARGETS[target](bareStudio('golden-hour')) };
          const S = bareStudio('golden-hour', { land: leftBank, target: el });
          const hits = [];
          for (let i = 0; i < 4; i++) hits.push(decide(S, makeSplat({ ...hitOn('tree', el), R: rand(12, 24), pigment: paintOf(id) })));
          const what = hits.map(reactionOf);
          assert.deepEqual(what.slice(0, 3), ['friend', 'friend', 'treeGlow'], `${id} on a ${target}, three times: ${what.join(', ')}`);
          const after = hits[3][0];
          assert.ok(after.say !== 'company' && after.kind !== 'treeGlow', `the fourth ${id} on a ${target} made ${after.say ?? after.kind}`);
          const spec = after.make();
          if (spec?.meta?.x !== undefined && spec.kind !== 'flowers') assert.notEqual(Math.round(spec.meta.x), Math.round(el.meta.x), `the fourth ${id} on a ${target} grew a ${spec.kind} inside it`);
        }
      }
    }
  }, 73));

test('a tall pine never stands in front of another: there, green high in the sky makes far-off trees', () =>
  sameDice(() => {
    // A long session grew a wall of full-height pines across the front of the lake, hiding it and the mountains.
    for (let i = 0; i < 40; i++) {
      const mood = pick(DAY);
      const S = bareStudio(mood, { land: leftBank });
      const spot = () => ({ x: rand(60, 240), y: S.hy * rand(0.05, 0.3), R: rand(22, 40), pigment: paintOf('sap-green') });
      const first = decide(S, makeSplat(spot()));
      assert.equal(outcomeOf(first), 'tall pine', `green high over the bank made ${outcomeOf(first)}`);
      const pine = first.at(-1).make(first.length > 1 ? first[0].make() : undefined);
      S.elements.push(pine);
      const next = decide(S, makeSplat(spot()));
      if (outcomeOf(next) === 'tall pine') {
        const other = next.at(-1).make();
        assert.ok(Math.abs(other.meta.x - pine.meta.x) >= (other.meta.size + pine.meta.size) * 0.22, 'a tall pine grew in front of another');
      } else assert.equal(next[0].kind, 'treeline', `green high over a tall pine made ${outcomeOf(next)}`);
      // Over open water, with no land under it, the tall pine brings its own bit of shore, unless that would put it in
      // front of the one already there.
      const T = bareStudio(mood, { land: () => false });
      const shore = decide(T, makeSplat({ x: 150, y: T.hy * 0.2, R: 30, pigment: paintOf('sap-green') }));
      assert.equal(shore[0].kind, 'bank');
      T.elements.push({ kind: 'evergreen', meta: { x: T.W * 0.15, baseY: 800, size: 600, tall: true } });
      assert.equal(decide(T, makeSplat({ x: 150, y: T.hy * 0.2, R: 30, pigment: paintOf('sap-green') }))[0].kind, 'treeline');
    }
  }, 74));

test('in Winter Hush a storm cloud snows instead of raining, and at night light on a pine is moonlight', () =>
  sameDice(() => {
    const darkOn = (mood, counts, id) => {
      const el = { ...TARGETS.cloud(bareStudio(mood)) };
      const S = bareStudio(mood, { land: leftBank, target: el, counts });
      const plan = decide(S, makeSplat({ ...hitOn('cloud', el), R: rand(12, 26), pigment: paintOf(id) }));
      return { kinds: plan.map((s) => s.kind), made: plan[1]?.make(), say: plan[0].say };
    };
    for (const id of [...PAINTS.blue, ...PAINTS.brown]) {
      for (const mood of SCHEMES.map((s) => s.id)) {
        const { kinds, made } = darkOn(mood, {}, id);
        const want = mood === 'winter-hush' ? 'snowShower' : 'rain';
        assert.deepEqual(kinds, ['storm', want], `${id} on a cloud in ${mood}`);
        assert.equal(made.kind, want);
      }
      // Rain and snow count together: four of either, or both, and storms stay dry.
      assert.deepEqual(darkOn('winter-hush', { snowShower: 3 }, id).kinds, ['storm', 'snowShower']);
      assert.deepEqual(darkOn('winter-hush', { snowShower: 4 }, id).kinds, ['storm'], `${id}: a fifth snow shower`);
      assert.deepEqual(darkOn('winter-hush', { rain: 2, snowShower: 2 }, id).kinds, ['storm']);
    }
    // A storm cloud thrown up high in Winter Hush brings snow, never rain.
    let snowed = 0;
    for (let i = 0; i < 200; i++) {
      const S = bareStudio('winter-hush', { land: leftBank });
      const kinds = decide(S, makeSplat({ x: rand(30, 1170), y: S.hy * rand(0.05, 0.42), R: rand(20, 50), pigment: paintOf('van-dyke-brown') })).map((s) => s.kind);
      assert.ok(!kinds.includes('rain'), 'rain in Winter Hush');
      if (kinds.includes('snowShower')) snowed++;
    }
    assert.ok(snowed > 20, `only ${snowed} of 200 storm clouds snowed`);
    // The painter says snow in Winter Hush, and rain elsewhere.
    assert.ok(linesFor('storm', { scheme: 'winter-hush' }).includes('That cloud got heavy. Here comes a little snow.'));
    assert.ok(!linesFor('storm', { scheme: 'winter-hush' }).some((t) => /rain/.test(t)), 'rain in a Winter Hush line');
    assert.ok(!linesFor('storm', { scheme: 'golden-hour' }).some((t) => /snow/.test(t)), 'snow in a Golden Hour line');
    // Light on a pine: the moon's pale light at night, whatever the paint; warm light by day.
    const strokes = (mood, id) => {
      const S = bareStudio(mood);
      const tree = P.evergreen(S, { x: 150, baseY: 680, h: 140, tint: [60, 90, 40] });
      const seen = [];
      const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => (k === 'strokeStyle' && seen.push(String(v).match(/[\d.]+/g).slice(0, 3).map(Number)), (t[k] = v), true) });
      for (const op of treeGlow(S, tree, { tint: paintOf(id).rgb }).ops) op(ctx);
      return seen;
    };
    // Warm light has much more red than blue; moonlight has as much blue as red, or more.
    const warmth = (list) => list.reduce((n, [r, , b]) => n + (r - b), 0) / list.length;
    for (const id of YELLOW_RED) {
      assert.ok(warmth(strokes('northern-night', id)) < 8, `${id} on a pine at night was warm, not moonlight (${Math.round(warmth(strokes('northern-night', id)))})`);
      assert.ok(warmth(strokes('golden-hour', id)) > 40, `${id} on a pine in Golden Hour wasn't warm`);
    }
    assert.ok(linesFor('treeGlow', { scheme: 'northern-night' }).includes('The moon found his edges.'));
    assert.ok(!linesFor('treeGlow', { scheme: 'northern-night' }).some((t) => /warm/i.test(t)), 'warm light at night');
  }, 76));

test('a small dark fleck out on open water is a pair of loons, three pairs at most', () =>
  sameDice(() => {
    const openAt = (S) => ({ x: rand(380, 820), y: rand(S.hy + 40, S.hy + (S.H - S.hy) * 0.7) });
    for (const id of [...PAINTS.blue, ...PAINTS.brown]) {
      for (let i = 0; i < 60; i++) {
        const mood = pick(SCHEMES).id;
        const S = bareStudio(mood, { land: leftBank });
        const plan = decide(S, makeSplat({ ...openAt(S), R: rand(8, 13.9), pigment: paintOf(id) }));
        assert.equal(plan[0].kind, 'loons', `a small ${id} fleck on open water in ${mood} made ${outcomeOf(plan)}`);
        const loons = plan[0].make();
        assert.equal(loons.kind, 'loons');
        assert.ok(loons.meta.size >= 7, 'too small to see');
        // Bigger than a fleck, or near the shore, or with three pairs out already: what it was before.
        const big = decide(S, makeSplat({ ...openAt(S), R: rand(16, 50), pigment: paintOf(id) }));
        assert.notEqual(big[0].kind, 'loons', `a big ${id} splat made loons`);
        const edge = decide(S, makeSplat({ x: rand(900, 1170), y: rand(S.hy + 40, S.H - 10), R: rand(8, 13.9), pigment: paintOf(id) }));
        assert.notEqual(edge[0].kind, 'loons', `a ${id} fleck near the edge of the lake made loons`);
        const full = bareStudio(mood, { land: leftBank, counts: { loons: 3 } });
        assert.notEqual(decide(full, makeSplat({ ...openAt(full), R: rand(8, 13.9), pigment: paintOf(id) }))[0].kind, 'loons', 'a fourth pair of loons');
      }
    }
    // Bright paint on the water never makes loons; nor does a pale blue mixed with white.
    for (const id of [...PAINTS.white, ...PAINTS.yellow, ...PAINTS.red, ...PAINTS.green]) {
      const S = bareStudio('golden-hour', { land: leftBank });
      assert.notEqual(decide(S, makeSplat({ ...openAt(S), R: 10, pigment: paintOf(id) }))[0].kind, 'loons', `${id} made loons`);
    }
    const pale = { ...paintOf('phthalo-blue'), rgb: mix(paintOf('phthalo-blue').rgb, [255, 255, 255], 0.6) };
    const S = bareStudio('golden-hour', { land: leftBank });
    assert.notEqual(decide(S, makeSplat({ ...openAt(S), R: 10, pigment: pale }))[0].kind, 'loons', 'a pale blue made loons');
    // The label and the titles know them.
    assert.equal(featureLine({ loons: 1, cloud: 1 }), 'Features a pair of loons and a cloud.');
    assert.equal(featureLine({ loons: 2 }), 'Features two pairs of loons.');
    assert.ok(Array.from({ length: 300 }, () => makeTitle({ loons: 1, mountain: 1 }, 'golden-hour')).some((t) => /\bLoons\b/.test(t)), 'no title named for the loons');
  }, 77));

test('brown landing right at the shore is a little dock reaching out from it, one to a canvas', () =>
  sameDice(() => {
    const brown = paintOf('van-dyke-brown');
    let docks = 0;
    for (let i = 0; i < 300; i++) {
      const mood = pick(SCHEMES).id;
      const S = bareStudio(mood, { land: leftBank });
      const y = rand(S.hy + 60, S.hy + (S.H - S.hy) * 0.82);
      const R = rand(11, 40);
      // Within a splat's width of the bank's edge (x 300), on the water.
      const x = rand(304, 300 + Math.max(30, R) - 4);
      const plan = decide(S, makeSplat({ x, y, R, pigment: brown }));
      assert.deepEqual(plan.map((s) => s.kind), ['dock'], `brown ${Math.round(x - 300)}px off the shore in ${mood} made ${outcomeOf(plan)}`);
      const dock = plan[0].make();
      // It starts on the bank and reaches out over the water, past where the paint landed.
      assert.ok(dock.bbox.x < 300 && dock.bbox.x + dock.bbox.w > x, `a dock from ${Math.round(dock.bbox.x)} to ${Math.round(dock.bbox.x + dock.bbox.w)} for paint at ${Math.round(x)}`);
      docks++;
      // A second one on the same canvas is what the paint would have been instead.
      assert.notEqual(decide(S, makeSplat({ x, y: y + 10, R, pigment: brown }))[0].kind, 'dock', 'a second dock');
      const counted = bareStudio(mood, { land: leftBank, counts: { dock: 1 } });
      assert.notEqual(decide(counted, makeSplat({ x, y, R, pigment: brown }))[0].kind, 'dock', 'a second dock');
      // Away from the shore, or in another paint that makes land, or aimed at a bank, no dock.
      assert.notEqual(decide(bareStudio(mood, { land: leftBank }), makeSplat({ x: rand(420, 1150), y, R, pigment: brown }))[0].kind, 'dock', 'a dock out in the lake');
      for (const id of ['sap-green', 'yellow-ochre']) assert.notEqual(decide(bareStudio(mood, { land: leftBank }), makeSplat({ x, y, R, pigment: paintOf(id) }))[0].kind, 'dock', `${id} made a dock`);
      assert.notEqual(decide(bareStudio(mood, { land: leftBank }), makeSplat({ x, y, R, pigment: brown, hint: 'bank' }))[0].kind, 'dock', 'an accident aimed at a bank made a dock');
    }
    assert.equal(docks, 300);
    // The far shore on the right works the same way, reaching left.
    const right = (x, y) => y > 480 && x > 900;
    const S = bareStudio('golden-hour', { land: right });
    const plan = decide(S, makeSplat({ x: 880, y: 700, R: 20, pigment: brown }));
    assert.equal(plan[0].kind, 'dock');
    const dock = plan[0].make();
    assert.ok(dock.bbox.x + dock.bbox.w > 900 && dock.bbox.x < 880, 'a dock off the right-hand shore');
    assert.equal(featureLine({ dock: 1, cloud: 1 }), 'Features a dock and a cloud.');
  }, 78));

test('birds and rain thin out once there are plenty: past eight flocks dark flecks are wisps, past four rain clouds storms stay dry', () =>
  sameDice(() => {
    // A 30-minute session ended with 20 flocks of birds and 15 rain clouds, grey streaks across the whole sky.
    for (let i = 0; i < 200; i++) {
      const mood = pick([...DAY, ...NIGHT]);
      const id = pick(['van-dyke-brown', 'prussian-blue', 'phthalo-blue', 'sap-green']);
      const fleckAt = (S) => makeSplat({ x: rand(30, 1170), y: S.hy * rand(0.05, 0.42), R: rand(10, 13.9), pigment: paintOf(id) });
      const few = bareStudio(mood, { land: leftBank, counts: { birds: 7 } });
      assert.equal(outcomeOf(decide(few, fleckAt(few))), 'birds', `with seven flocks, a ${id} fleck wasn't birds`);
      const many = bareStudio(mood, { land: leftBank, counts: { birds: 8 } });
      const wisp = decide(many, fleckAt(many));
      assert.equal(wisp[0].say, 'wisp', `with eight flocks, a ${id} fleck made ${outcomeOf(wisp)}`);
      assert.notEqual(decide(many, makeSplat({ ...fleckAt(many), hint: 'birds' }))[0].kind, 'birds', 'an accident aimed at birds made a ninth flock');
    }
    const darkOn = (rain, id) => {
      const el = { ...TARGETS.cloud(bareStudio()) };
      const S = bareStudio('golden-hour', { land: leftBank, target: el, counts: { rain } });
      return decide(S, makeSplat({ ...hitOn('cloud', el), R: rand(12, 26), pigment: paintOf(id) })).map((s) => s.kind);
    };
    for (const id of [...PAINTS.blue, ...PAINTS.brown]) {
      assert.deepEqual(darkOn(3, id), ['storm', 'rain'], `${id} on a cloud with three raining`);
      assert.deepEqual(darkOn(4, id), ['storm'], `${id} on a cloud with four raining`);
    }
    // Nor do storm clouds from dark paint up high bring more rain.
    for (let i = 0; i < 100; i++) {
      const S = bareStudio('golden-hour', { land: leftBank, counts: { rain: 4 } });
      const plan = decide(S, makeSplat({ x: rand(30, 1170), y: S.hy * rand(0.05, 0.42), R: rand(20, 50), pigment: paintOf('van-dyke-brown') }));
      assert.ok(!plan.some((s) => s.kind === 'rain'), 'a storm cloud brought a fifth rain');
    }
  }, 75));

// The sounds, on a stand-in for Web Audio that keeps every value each gain is sent to: the brush about twice as loud as
// it was (its strokes peaked at 0.04 to 0.07, a knife's at 0.06 to 0.09, under the splat's 0.42), the signature a pen's
// scratch (it made no sound), and a knock of wood for the label.
test('the brush is loud enough to hear, the signature scratches like a pen, and the label goes up with a knock', async () => {
  const made = [];
  class Param {
    constructor(v = 0) {
      this.value = v;
      this.to = [];
    }
    setValueAtTime(v) { this.to.push(v); }
    linearRampToValueAtTime(v) { this.to.push(v); }
    exponentialRampToValueAtTime(v) { this.to.push(v); }
    setTargetAtTime(v) { this.to.push(v); }
    cancelScheduledValues() {}
  }
  class Node {
    connect(n) { return n; }
    start() {}
    stop() {}
  }
  const node = (kind, props) => {
    const n = Object.assign(new Node(), props);
    made.push([kind, n]);
    return n;
  };
  class FakeAudio {
    currentTime = 0;
    sampleRate = 8000;
    state = 'running';
    destination = new Node();
    createGain() { return node('gain', { gain: new Param(1) }); }
    createDynamicsCompressor() { return node('compressor', { threshold: new Param(), knee: new Param(), ratio: new Param(), attack: new Param(), release: new Param() }); }
    createBuffer(channels, length) { const d = new Float32Array(length).fill(0.5); return { getChannelData: () => d }; }
    createBufferSource() { return node('source', {}); }
    createBiquadFilter() { return node('filter', { type: 'lowpass', frequency: new Param(), Q: new Param() }); }
    createOscillator() { return node('osc', { type: 'sine', frequency: new Param() }); }
    resume() { return Promise.resolve(); }
  }
  globalThis.window = { AudioContext: FakeAudio };
  let sound;
  try {
    sound = await import('../src/sound.js');
    sound.setSound(true);
  } finally {
    delete globalThis.window;
  }
  const peaks = () => made.filter(([k]) => k === 'gain').flatMap(([, g]) => g.gain.to).filter((v) => v > 0.001);
  made.length = 0;
  sound.brush('evergreen', 2000);
  assert.ok(Math.min(...peaks()) >= 0.08, `a brush stroke peaked at only ${Math.min(...peaks()).toFixed(3)}`);
  made.length = 0;
  sound.brush('mountain', 2000);
  assert.ok(Math.min(...peaks()) >= 0.11, `a palette knife stroke peaked at only ${Math.min(...peaks()).toFixed(3)}`);
  made.length = 0;
  sound.brush('signature', 1300);
  assert.ok(made.some(([k, f]) => k === 'filter' && f.type === 'highpass') && peaks().length >= 4, 'the signature made no pen scratch');
  assert.ok(Math.max(...peaks()) <= 0.15, 'the pen scratch is louder than the brush');
  made.length = 0;
  sound.knock();
  const oscs = made.filter(([k]) => k === 'osc').map(([, o]) => o.type);
  assert.ok(oscs.includes('triangle') && Math.max(...peaks()) <= 0.2, `the label's knock (${oscs}) is missing or loud`);
  // It swells in, rather than starting at full volume with a click.
  for (const [k, g] of made) if (k === 'gain') assert.ok(g.gain.to[0] <= 0.001, 'a knock starts with a click');
});

// Watch it again: the film keeps a picture each time something finishes, between half the cap and the cap however long
// a canvas runs, spread evenly over all of it (the first and the newest always kept), and nothing that changed is lost
// from the boxes the replay wipes in.
test('the film for Watch it again stays capped and evenly spread over a long canvas', () => {
  const film = new Film();
  assert.equal(film.next(), null, 'a picture with nothing changed');
  const all = [];
  for (let i = 0; i < 2000; i++) {
    const box = [i % 1100, (i * 7) % 800, (i % 1100) + 50, ((i * 7) % 800) + 40];
    film.changed(box);
    all.push(box);
    const f = film.next();
    if (f) f.pic = { size: 20000, i };
    assert.equal(film.next(), null, 'a second picture taken with nothing new');
    if (i >= MAX_FRAMES) assert.ok(film.frames.length > MAX_FRAMES / 2 && film.frames.length <= MAX_FRAMES, `${film.frames.length} pictures after ${i + 1} things painted`);
  }
  assert.equal(film.frames[0].pic.i, 0, 'the first picture (the sky) went');
  // Taken at even steps: the gaps between the pictures kept are all the same, give or take the stride the film is at.
  const at = film.frames.map((f) => f.pic.i);
  const gaps = at.slice(1, -1).map((v, i) => v - at[i]);
  assert.ok(Math.max(...gaps) - Math.min(...gaps) <= film.stride, `uneven gaps: ${gaps}`);
  // force takes what's waiting, even on a chance the film would skip.
  film.changed([0, 0, 10, 10]);
  film.next();
  film.changed([20, 20, 30, 30]);
  const last = film.next(true) ?? film.frames.at(-1);
  assert.ok(last.box[0] <= 20 && last.box[2] >= 30, 'the forced picture lost what changed');
  // Every box ever painted is inside the box of some picture kept (or the one waiting).
  const boxes = film.frames.map((f) => f.box);
  for (const b of all) assert.ok(boxes.some((k) => k[0] <= b[0] && k[1] <= b[1] && k[2] >= b[2] && k[3] >= b[3]), `what changed at ${b} isn't in any picture's box`);
  assert.ok(film.bytes <= MAX_FRAMES * 20000);
  film.clear();
  assert.equal(film.frames.length, 0);
  // About ten seconds whatever the number of pictures, with no step too quick to see or too slow.
  assert.ok(stepMs(40) * 40 <= 11000 && stepMs(60) >= 150 && stepMs(3) <= 1000);
});
