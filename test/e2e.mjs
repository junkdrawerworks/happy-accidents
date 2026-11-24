// Paints in Chromium through the real page:  node test/e2e.mjs  (needs Playwright)
// Taps, flicks and pours paint on a phone-sized screen, checks that splats become things, that paint on an
// existing thing changes it, that two wet splats run together, that signing hangs the painting in the gallery
// (and it's still there after a reload), that nothing scrolls sideways, and that it still loads with the network off.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let body;
  try { body = await readFile(join(root, path === '/' ? 'index.html' : path)); } catch { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'text/html' });
  res.end(body);
}).listen(0);
const base = `http://localhost:${server.address().port}/`;

const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
page.on('requestfailed', (r) => problems.push('failed: ' + r.url()));
page.on('request', (r) => { if (!r.url().startsWith(base) && !r.url().startsWith('data:')) problems.push('left the site: ' + r.url()); });

const S = (fn, arg) => page.evaluate(fn, arg);
// The width of a JPEG, from its frame header.
const jpegWidth = (buf) => {
  for (let i = 2; i + 9 < buf.length && buf[i] === 0xff; i += 2 + buf.readUInt16BE(i + 2)) {
    if (buf[i + 1] >= 0xc0 && buf[i + 1] <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(buf[i + 1])) return buf.readUInt16BE(i + 7);
  }
  return 0;
};
// The ids of the paintings whose full-size pictures are kept (in IndexedDB), once the page has kept one.
const pictureIds = (p = page) => p.evaluate(() => new Promise((resolve, reject) => {
  const req = indexedDB.open('happy-accidents');
  req.onerror = () => reject(req.error);
  req.onsuccess = () => {
    const keys = req.result.transaction('pictures').objectStore('pictures').getAllKeys();
    keys.onsuccess = () => { req.result.close(); resolve(keys.result); };
  };
}));
const wallIds = () => S(() => JSON.parse(localStorage.getItem('happy-accidents:gallery')).map((r) => r.id));
const settle = () => page.waitForFunction(() => !window.happyAccidents.busy && !window.happyAccidents.active.length, null, { timeout: 20000 });
const total = () => S(() => Object.entries(window.happyAccidents.counts).filter(([k]) => k !== 'sky').reduce((a, [, n]) => a + n, 0));
const box = async () => page.locator('#canvas').boundingBox();
// From here on (until the next reload), every line the painter says is kept in window.said, emptied on each call.
const listen = () => S(() => {
  const st = window.happyAccidents;
  window.said = [];
  if (st.hooks.listening) return;
  const narrate = st.hooks.onNarrate;
  st.hooks.onNarrate = (n) => {
    window.said.push(n.line);
    narrate(n);
  };
  st.hooks.listening = true;
});

await page.goto(base);
await page.evaluate(() => document.fonts.ready);
assert.equal(await S(() => document.fonts.check('24px Caprasimo')), true, 'the display font loaded from fonts/');
await S(() => window.happyAccidents.skipIntro());

// On a phone the header line wraps, but the mood's name stays in one piece (not WINTER / HUSH).
for (const id of await S(async () => (await import('./src/schemes.js')).SCHEMES.map((s) => s.id))) {
  await S((id) => window.happyAccidents.newCanvas(id), id);
  assert.equal(await S(() => document.getElementById('schemeName').getClientRects().length), 1, `the mood's name is split across lines (${id})`);
}

await S(() => window.happyAccidents.newCanvas('golden-hour'));
await settle();

// A tap in the sky becomes something.
let b = await box();
let before = await total();
await page.mouse.click(b.x + b.width * 0.3, b.y + b.height * 0.2);
await page.waitForTimeout(200);
await settle();
assert.ok((await total()) > before, 'a tap turned into something');
assert.equal(await S(() => window.happyAccidents.accidents), 1);

// A flick: press, drag fast, let go.
before = await total();
await page.mouse.move(b.x + b.width * 0.55, b.y + b.height * 0.35);
await page.mouse.down();
for (let i = 1; i <= 6; i++) await page.mouse.move(b.x + b.width * (0.55 + i * 0.03), b.y + b.height * (0.35 - i * 0.015));
await page.mouse.up();
await page.waitForTimeout(200);
await settle();
assert.ok((await total()) > before, 'a flick turned into something');

// Press and hold: the paint pools and grows, then lands when you let go.
await page.mouse.move(b.x + b.width * 0.2, b.y + b.height * 0.85);
await page.mouse.down();
await page.waitForTimeout(900);
const poolR = await S(() => window.happyAccidents.pool && window.happyAccidents.pool.R);
assert.ok(poolR > 20, `holding pools the paint (R ${poolR})`);
await page.mouse.up();
await page.waitForTimeout(200);
await settle();
assert.equal(await S(() => window.happyAccidents.accidents), 3);

// Two wet splats that touch run together into one, and their paints mix like paint: yellow into blue is green,
// and green in the lake makes land.
before = await total();
await S(async () => {
  const { PIGMENTS } = await import('./src/schemes.js');
  const st = window.happyAccidents;
  const paint = (id) => PIGMENTS.find((p) => p.id === id);
  st.addSplat({ x: 640, y: st.hy + 200, R: 22, pigment: paint('cadmium-yellow'), delay: 800 });
  st.addSplat({ x: 660, y: st.hy + 205, R: 22, pigment: paint('phthalo-blue'), delay: 800 });
});
assert.equal(await S(() => window.happyAccidents.splats.filter((s) => s.state === 'merged').length), 1, 'the second splat ran into the first');
assert.equal(await S(() => window.happyAccidents.splats.find((s) => s.mixPigment).mixPigment.family), 'green', 'yellow and blue mixed into green');
await page.waitForTimeout(300);
assert.match(await page.textContent('#line'), /green/, 'the painter says what color it made');
await page.waitForTimeout(200);
await settle();
const made = await S(() => ['bank', 'island'].reduce((n, k) => n + (window.happyAccidents.counts[k] || 0), 0));
assert.ok(made >= 1, 'the green mix in the lake became land');

// Picking another paint keeps a fresh splat wet long enough to hit it again.
await S(async () => {
  const { PIGMENTS } = await import('./src/schemes.js');
  const st = window.happyAccidents;
  st.addSplat({ x: 300, y: st.hy * 0.3, R: 20, pigment: PIGMENTS[0], delay: 300 });
});
await page.click('[data-id="bright-red"]');
await page.waitForTimeout(900);
assert.equal(await S(() => window.happyAccidents.splats.filter((s) => s.state === 'wet').length), 1, 'the splat is still wet after picking a new paint');
await page.click('[data-id="surprise"]');
await page.waitForTimeout(2000);
await settle();

// Only your own last splat is held, once: browsing the palette while Let it happen runs doesn't leave its splats sitting
// wet and unpainted on the canvas (each pick used to put off every wet splat again, for as long as the picking went on).
await S(() => {
  const st = window.happyAccidents;
  window.wetFor = [];
  const resolve = st.resolve.bind(st);
  st.resolve = (sp) => {
    if (sp.state === 'wet') window.wetFor.push(Math.round(performance.now() - sp.born));
    return resolve(sp);
  };
});
await page.click('#autoBtn');
for (let i = 0; i < 10; i++) {
  await page.click(`.dab >> nth=${1 + i}`);
  await page.waitForTimeout(900);
}
if ((await page.getAttribute('#autoBtn', 'aria-pressed')) === 'true') await page.click('#autoBtn');
await page.click('[data-id="surprise"]');
await page.waitForTimeout(3000);
await settle();
const wetFor = await S(() => {
  delete window.happyAccidents.resolve;
  return window.wetFor;
});
assert.ok(wetFor.length >= 3, `Let it happen threw only ${wetFor.length} splats while the paints were picked`);
assert.ok(Math.max(...wetFor) <= 3000, `a splat stayed wet ${Math.max(...wetFor)} ms while paints were picked (${wetFor.join(', ')})`);

// One finger paints at a time: a finger that comes down while another is painting is ignored. Two fingers tapped
// together make one splat, where the first one landed, and a second finger can't move a puddle the first is pouring.
// And if the canvas loses hold of a finger without hearing it lift, the next touch still paints.
const cdp = await ctx.newCDPSession(page);
const finger = (u, v, id) => ({ x: b.x + b.width * u, y: b.y + b.height * v, id });
const touch = (type, touchPoints = []) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
const splatsAt = () => S(() => window.happyAccidents.splats.map((s) => Math.round(s.x)));
await S(() => window.happyAccidents.newCanvas('golden-hour'));
await settle();
b = await box();
await touch('touchStart', [finger(0.25, 0.3, 0)]);
await touch('touchStart', [finger(0.25, 0.3, 0), finger(0.75, 0.3, 1)]);
await touch('touchEnd');
await page.waitForTimeout(200);
assert.deepEqual(await splatsAt(), [300], 'a two-finger tap made one splat, where the first finger landed');
await S(() => window.happyAccidents.newCanvas('golden-hour'));
await settle();
await touch('touchStart', [finger(0.2, 0.8, 0)]);
await page.waitForTimeout(600);
await touch('touchStart', [finger(0.2, 0.8, 0), finger(0.8, 0.8, 1)]);
await page.waitForTimeout(500);
assert.equal(await S(() => Math.round(window.happyAccidents.pool?.x)), 240, 'a second finger moved the puddle the first was pouring');
await touch('touchEnd');
await page.waitForTimeout(200);
assert.deepEqual(await splatsAt(), [240], 'the puddle landed somewhere other than where the first finger poured it');
await settle();
await S(() => document.getElementById('canvas').addEventListener('pointerdown', (e) => (window.downId = e.pointerId), { once: true }));
await touch('touchStart', [finger(0.5, 0.3, 0)]);
await touch('touchMove', [finger(0.51, 0.3, 0)]); // the canvas has hold of the finger from its first move
await S(() => document.getElementById('canvas').releasePointerCapture(window.downId));
await touch('touchMove', [{ x: b.x + b.width * 0.5, y: b.y - 30, id: 0 }]);
await touch('touchEnd');
before = await S(() => window.happyAccidents.accidents);
await touch('touchStart', [finger(0.5, 0.3, 1)]);
await touch('touchEnd');
await page.waitForTimeout(200);
assert.equal(await S(() => window.happyAccidents.accidents), before + 1, 'after the canvas lost hold of a finger, the next touch didn’t paint');
assert.equal(await S(() => window.happyAccidents.pool), null, 'the lost finger left a puddle on the canvas');
await settle();

// Paint on something that's already there changes it: white on a mountain is fresh snow.
await S(() => window.happyAccidents.newCanvas('golden-hour'));
await settle();
await S(async () => {
  const { PIGMENTS } = await import('./src/schemes.js');
  const st = window.happyAccidents;
  st.addSplat({ x: 900, y: st.hy - 220, R: 40, pigment: PIGMENTS[0], hint: 'mountain', delay: 50 });
});
await page.waitForTimeout(200);
await settle();
await S(async () => {
  const { PIGMENTS } = await import('./src/schemes.js');
  const st = window.happyAccidents;
  const m = st.elements.find((e) => e.kind === 'mountain');
  st.addSplat({ x: m.meta.peak[0], y: m.meta.peak[1] + m.meta.hgt * 0.3, R: 20, pigment: PIGMENTS.find((p) => p.id === 'titanium-white'), delay: 50 });
});
await page.waitForTimeout(200);
await settle();
assert.equal(await S(() => window.happyAccidents.counts.snowfall), 1, 'white paint on a mountain made fresh snow');

// A tree with no ground beside it (on an island, or at the tip of a bank) can't get company. Paint that isn't white or
// warm catches the light on it instead, just once, and the painter doesn't say a friend showed up.
await S(() => window.happyAccidents.newCanvas('golden-hour'));
await settle();
await S(async () => {
  const { PIGMENTS } = await import('./src/schemes.js');
  const st = window.happyAccidents;
  st.addSplat({ x: st.W * 0.5, y: st.hy + (st.H - st.hy) * 0.5, R: 40, pigment: PIGMENTS.find((p) => p.id === 'sap-green'), hint: 'tree', delay: 50 });
});
await page.waitForTimeout(200);
await settle();
await S(() => {
  const st = window.happyAccidents;
  st.mctx.clearRect(0, 0, st.mask.width, st.mask.height); // no ground anywhere beside the island's tree now
});
await listen();
for (let i = 0; i < 2; i++) {
  await S(async () => {
    const { PIGMENTS } = await import('./src/schemes.js');
    const st = window.happyAccidents;
    const tree = st.elements.find((e) => ['evergreen', 'deciduous', 'bush'].includes(e.kind));
    let spot = st.spotOn(tree);
    for (let k = 0; k < 30 && st.elementAt(spot.x, spot.y, spot.R) !== tree; k++) spot = st.spotOn(tree);
    st.addSplat({ ...spot, pigment: PIGMENTS.find((p) => p.id === 'phthalo-blue'), delay: 50 });
  });
  await page.waitForTimeout(200);
  await settle();
}
const lonely = await S(async () => {
  const { linesFor } = await import('./src/words.js');
  const company = [...linesFor('company'), ...linesFor('company', { auto: true })];
  return { glows: window.happyAccidents.counts.treeGlow || 0, company: window.said.filter((l) => company.includes(l)) };
});
assert.deepEqual(lonely.company, [], 'the painter said a tree got company, but no friend grew');
assert.equal(lonely.glows, 1, `light caught a tree with no ground beside it once, not again and again (${lonely.glows})`);

// At night it's the moon up there, and the painter calls it the moon: warm paint on it lights up the sky around it,
// and other paint drifts a cloud across it.
await S(() => window.happyAccidents.newCanvas('northern-night'));
await settle();
await S(async () => {
  const { PIGMENTS } = await import('./src/schemes.js');
  const st = window.happyAccidents;
  st.addSplat({ x: st.W * 0.3, y: st.hy * 0.3, R: 24, pigment: PIGMENTS.find((p) => p.id === 'titanium-white'), hint: 'sun', delay: 50 });
});
await page.waitForTimeout(200);
await settle();
await listen();
for (const id of ['cadmium-yellow', 'phthalo-blue']) {
  await S(async (id) => {
    const { PIGMENTS } = await import('./src/schemes.js');
    const st = window.happyAccidents;
    st.addSplat({ ...st.spotOn(st.elements.find((e) => e.kind === 'moon')), pigment: PIGMENTS.find((p) => p.id === id), delay: 50 });
  }, id);
  await page.waitForTimeout(200);
  await settle();
}
const night = await S(() => ({ said: window.said, glow: window.happyAccidents.counts.sunset || 0 }));
assert.equal(night.glow, 1, 'warm paint on the moon lit up the sky');
assert.ok(night.said.length >= 2 && night.said.every((l) => !/\bsun\b/.test(l)), `the painter called the moon the sun (${night.said.join(' / ')})`);

// Land laid over the lake covers whatever was floating there. A sailboat under the new ground can't go behind it (its
// sail would stand up out of the land), so it sails out to open water nearby, or with none near, it's gone; either way
// it never sits on the grass.
await S(() => window.happyAccidents.newCanvas('golden-hour'));
await settle();
await S(async () => {
  const { PIGMENTS } = await import('./src/schemes.js');
  const st = window.happyAccidents;
  st.addSplat({ x: st.W * 0.6, y: st.hy + (st.H - st.hy) * 0.5, R: 24, pigment: PIGMENTS.find((p) => p.id === 'titanium-white'), delay: 50 });
});
await page.waitForTimeout(200);
await settle();
const sailedFrom = await S(async () => {
  const { PIGMENTS } = await import('./src/schemes.js');
  const st = window.happyAccidents;
  const { meta } = st.elements.find((e) => e.kind === 'sailboat');
  st.addSplat({ x: meta.x, y: meta.y, R: 44, pigment: PIGMENTS.find((p) => p.id === 'sap-green'), hint: 'bank', delay: 50 });
  return { x: meta.x, y: meta.y };
});
await page.waitForTimeout(200);
await settle();
const ashore = await S((was) => {
  const st = window.happyAccidents;
  const boat = st.elements.find((e) => e.kind === 'sailboat');
  return { covered: st.isLand(was.x, was.y - 2), onLand: boat ? st.isLand(boat.meta.x, boat.meta.y - 2) : null, count: st.counts.sailboat };
}, sailedFrom);
assert.ok(ashore.covered, 'the land was laid over the sailboat');
assert.notEqual(ashore.onLand, true, 'the sailboat sat on the land laid over it');
if (ashore.onLand === null) assert.equal(ashore.count, 0, 'a sailboat that was taken away still counts');

// The paint's color decides what a splat becomes. Each check starts on a clean canvas and reports what got painted.
// where: { sky: 0..1 } is from the top of the canvas down to the horizon; { lake: 0..1 } from the horizon down;
// 'land' is a spot on a bank of Sap Green land laid down first.
async function paintWith(id, where, R, hint) {
  await S(() => window.happyAccidents.newCanvas('golden-hour'));
  await settle();
  if (where === 'land') {
    await S(async () => {
      const { PIGMENTS } = await import('./src/schemes.js');
      const st = window.happyAccidents;
      st.addSplat({ x: st.W * 0.2, y: st.hy + (st.H - st.hy) * 0.6, R: 40, pigment: PIGMENTS.find((p) => p.id === 'sap-green'), hint: 'bank', delay: 50 });
    });
    await page.waitForTimeout(200);
    await settle();
  }
  const before = await S(() => ({ ...window.happyAccidents.counts }));
  await S(async ({ id, where, R, hint }) => {
    const { PIGMENTS } = await import('./src/schemes.js');
    const st = window.happyAccidents;
    let x = st.W * (where.x ?? 0.5);
    let y = where.sky !== undefined ? where.sky * st.hy : st.hy + (where.lake ?? 0) * (st.H - st.hy);
    if (where === 'land') {
      const spots = st.elements.find((e) => e.kind === 'bank').meta.spots;
      [x, y] = spots[Math.floor(spots.length / 2)];
    }
    st.addSplat({ x, y, R, pigment: PIGMENTS.find((p) => p.id === id), hint, delay: 50 });
  }, { id, where, R, hint });
  await page.waitForTimeout(200);
  await settle();
  const after = await S(() => ({ ...window.happyAccidents.counts }));
  return Object.keys(after).filter((k) => (after[k] || 0) > (before[k] || 0));
}
const lastCloudLum = () => S(() => {
  const c = window.happyAccidents.elements.filter((e) => e.kind === 'cloud').pop().meta.light;
  return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
});

assert.ok((await paintWith('titanium-white', { lake: 0.4 }, 24)).includes('sailboat'), 'white out on the lake is a sailboat');
assert.ok((await paintWith('bright-red', { lake: 0.45 }, 20)).includes('canoe'), 'red on the lake is a canoe');
assert.ok((await paintWith('yellow-ochre', { x: 0.12, lake: 0.6 }, 36)).includes('bank'), 'ochre by the shore is land');
let kinds = await paintWith('van-dyke-brown', { sky: 0.25 }, 34);
assert.ok(kinds.includes('cloud') && (await lastCloudLum()) < 0.5, `brown high in the sky is a dark cloud, not a white one (${kinds})`);
kinds = await paintWith('titanium-white', { sky: 0.3, x: 0.3 }, 30);
assert.ok(kinds.includes('sun') || (kinds.includes('cloud') && (await lastCloudLum()) > 0.8), `white high in the sky is a white cloud or the sun (${kinds})`);
assert.deepEqual(await paintWith('van-dyke-brown', { sky: 0.3 }, 12), ['birds'], 'a small brown fleck up high is birds');
kinds = await paintWith('phthalo-blue', { sky: 0.8 }, 40);
assert.ok(kinds.length && kinds.every((k) => ['mountain', 'cloud', 'birds'].includes(k)), `blue low in the sky is a mountain, a cloud or birds (${kinds})`);
kinds = await paintWith('sap-green', 'land', 30, 'tree');
assert.ok(['evergreen', 'deciduous', 'bush'].some((k) => kinds.includes(k)), `green on land is a tree (${kinds})`);
kinds = await paintWith('titanium-white', 'land', 30, 'tree');
assert.ok(kinds.includes('treeSnow') || kinds.includes('deciduous'), `white on land is a snowy tree or a birch (${kinds})`);
kinds = await paintWith('phthalo-blue', 'land', 30, 'tree');
assert.ok(kinds.includes('evergreen'), `blue on land is a blue spruce (${kinds})`);

// Let it happen aims the loaded paint where it makes sense. Yellow Ochre makes land, so some of its accidents go to the
// shore; Cadmium Yellow doesn't, so none of its do.
const aimed = await S(async () => {
  const { PIGMENTS } = await import('./src/schemes.js');
  const st = window.happyAccidents;
  const hints = (id) =>
    Array.from({ length: 30 }, () => {
      st.newCanvas('golden-hour');
      return st.randomAccident({ pigment: PIGMENTS.find((p) => p.id === id) }).hint;
    });
  return { ochre: hints('yellow-ochre'), cadmium: hints('cadmium-yellow') };
});
assert.ok(aimed.ochre.includes('bank'), `Let it happen never aimed Yellow Ochre at the shore (${aimed.ochre})`);
assert.ok(!aimed.cadmium.includes('bank'), `Let it happen aimed Cadmium Yellow at the shore (${aimed.cadmium})`);

// A thin strip of far shore is still ground a tree can be aimed at: a tree that Oops, Let it happen or the intro aims
// at the land finds it, instead of turning into a cloud because random tries all missed it.
const farTrees = await S(() => {
  const st = window.happyAccidents;
  const out = [];
  for (let i = 0; i < 20; i++) {
    st.newCanvas('golden-hour');
    const y = Math.ceil((st.hy + 50) / 4) * 4;
    st.addLand([[st.W * 0.8, y], [st.W * 0.9, y], [st.W * 0.9, y + 8], [st.W * 0.8, y + 8]]);
    const sp = st.randomAccident({ hint: 'tree' });
    out.push(sp.hint === 'tree' && st.isLand(sp.x, sp.y) ? 'on the shore' : sp.hint);
  }
  return out;
});
assert.deepEqual(farTrees.filter((t) => t !== 'on the shore'), [], 'a tree aimed at a thin strip of shore missed it');

// Let it happen counts what it adds itself, so on a canvas that already has plenty of accidents (your own splats count
// too) it still keeps going until it has added 8. (The count is set here rather than splashed 29 times.)
await S(() => window.happyAccidents.newCanvas('golden-hour'));
await settle();
await S(() => (window.happyAccidents.accidents = 29));
await page.click('#autoBtn');
await page.waitForFunction(() => window.happyAccidents.accidents > 29, null, { timeout: 5000 }).catch(() => assert.fail('Let it happen added nothing to a canvas with 29 accidents'));
assert.equal(await page.getAttribute('#autoBtn', 'aria-pressed'), 'true', 'Let it happen stopped straight away on a canvas with 29 accidents');
// The painter says it might be done once everything still going on has been painted in, so the line isn't talked over
// (here by a slow splat that lands just as Let it happen stops).
await S(async () => {
  const { PIGMENTS } = await import('./src/schemes.js');
  const st = window.happyAccidents;
  const btn = document.getElementById('autoBtn');
  new MutationObserver((_, obs) => {
    obs.disconnect();
    st.addSplat({ x: st.W * 0.3, y: st.hy * 0.3, R: 22, pigment: PIGMENTS.find((p) => p.id === 'titanium-white'), delay: 1500 });
  }).observe(btn, { attributes: true, attributeFilter: ['aria-pressed'] });
  st.accidents = 36; // one short of 8 more
});
await page.waitForFunction(() => document.getElementById('autoBtn').getAttribute('aria-pressed') === 'false', null, { timeout: 15000 });
assert.equal(await S(() => window.happyAccidents.accidents), 38, 'Let it happen should stop once it has added 8 to a busy canvas (and then the slow splat)');
assert.equal(await page.textContent('#autoBtn'), 'Let it happen');
await settle();
await page.waitForTimeout(800);
const doneLines = await S(async () => (await import('./src/words.js')).LINES.done);
assert.ok(doneLines.includes(await page.textContent('#line')), `the painter didn’t end on “that might be done” (${await page.textContent('#line')})`);

// Things painted near the edges stay on the canvas: the sun or moon from paint at the very top, the bush beside a
// cabin built at the edge of a bank, and the trees climbing a green mountain near a side.
const outside = await S(async () => {
  const { PIGMENTS } = await import('./src/schemes.js');
  const { makeSplat } = await import('./src/splat.js');
  const { decide } = await import('./src/decide.js');
  const st = window.happyAccidents;
  const paint = (id) => PIGMENTS.find((p) => p.id === id);
  const out = [];
  const off = (what, x0, x1, y0 = 0) => (x0 < 0 || x1 > st.W || y0 < 0) && out.push(`${what} at ${Math.round(x0)}..${Math.round(x1)}`);
  for (let i = 0; i < 12; i++) {
    st.newCanvas(i % 2 ? 'northern-night' : 'golden-hour');
    const x = i % 3 === 0 ? 4 : i % 3 === 1 ? st.W - 4 : st.W * 0.5;
    const { meta: m } = decide(st, makeSplat({ x, y: 6, R: 60, pigment: paint('titanium-white'), hint: 'sun' }))[0].make();
    off('the sun', m.x - m.r, m.x + m.r, m.y - m.r);
  }
  let cabins = 0;
  for (let i = 0; i < 16; i++) {
    st.newCanvas('golden-hour');
    const left = i % 2 === 0;
    st.lightDir = left ? 1 : -1; // the bush's shady side faces the near edge
    const bank = decide(st, makeSplat({ x: st.W * (left ? 0.1 : 0.9), y: st.hy + (st.H - st.hy) * 0.4, R: 40, pigment: paint('sap-green'), hint: 'bank' }))[0].make();
    const spot = bank.meta.spots.find(([sx, sy]) => (left ? sx < 60 : sx > st.W - 60) && st.isLand(sx, sy));
    if (!spot) continue;
    const plan = decide(st, makeSplat({ x: spot[0], y: spot[1], R: 30, pigment: paint('van-dyke-brown'), hint: 'cabin' }));
    if (plan[0].kind !== 'cabin') continue;
    cabins++;
    const cabin = plan[0].make();
    const bush = plan[1].make(cabin);
    off('a cabin’s bush', bush.meta.x, bush.meta.x);
  }
  for (let i = 0; i < 24; i++) {
    st.newCanvas('golden-hour');
    const plan = decide(st, makeSplat({ x: i % 2 ? 30 : st.W - 30, y: st.hy - st.H * 0.25, R: 50, pigment: paint('sap-green'), hint: 'mountain' }));
    const hill = plan[0].make();
    const trees = plan[1].make(hill);
    off('a green mountain’s trees', trees.bbox.x + trees.bbox.w / 2, trees.bbox.x + trees.bbox.w / 2);
  }
  return { out, cabins };
});
assert.ok(outside.cabins >= 8, `only ${outside.cabins} cabins were built at the edge of a bank`);
assert.deepEqual(outside.out, [], 'something was painted off the canvas');

// A cabin's layer leaves room for its chimney smoke instead of cutting it off flat. At golden hour a cabin has its
// lights on and smoke going from the start; on a misty morning, yellow on it does that. Nothing reaches the top edge.
// (The bank goes halfway down the lake. A cabin only fits less than 0.62 of the way down, and the bank's middle spot
// sits a little below the bank; from 0.55 it now and then landed past that and grew a tree, about 1 run in 100.)
for (const mood of ['golden-hour', 'misty-morning']) {
  await S((mood) => window.happyAccidents.newCanvas(mood), mood);
  await settle();
  await S(async () => {
    const { PIGMENTS } = await import('./src/schemes.js');
    const st = window.happyAccidents;
    st.addSplat({ x: st.W * 0.3, y: st.hy + (st.H - st.hy) * 0.5, R: 48, pigment: PIGMENTS.find((p) => p.id === 'sap-green'), hint: 'bank', delay: 50 });
  });
  await page.waitForTimeout(200);
  await settle();
  await S(async () => {
    const { PIGMENTS } = await import('./src/schemes.js');
    const st = window.happyAccidents;
    const spots = st.elements.find((e) => e.kind === 'bank').meta.spots;
    const [x, y] = spots[Math.floor(spots.length / 2)];
    st.addSplat({ x, y, R: 40, pigment: PIGMENTS.find((p) => p.id === 'van-dyke-brown'), hint: 'cabin', delay: 50 });
  });
  await page.waitForTimeout(200);
  await settle();
  if (mood === 'misty-morning') {
    await S(async () => {
      const { PIGMENTS } = await import('./src/schemes.js');
      const st = window.happyAccidents;
      const m = st.elements.find((e) => e.kind === 'cabin').meta;
      st.addSplat({ x: (m.x0 + m.x1) / 2, y: m.baseY - m.size * 0.2, R: 16, pigment: PIGMENTS.find((p) => p.id === 'cadmium-yellow'), delay: 50 });
    });
    await page.waitForTimeout(200);
    await settle();
  }
  const cabin = await S(() => {
    const c = window.happyAccidents.elements.find((e) => e.kind === 'cabin');
    if (!c) return null;
    const row = c.ctx.getImageData(0, 0, c.canvas.width, 1).data;
    let top = 0;
    for (let i = 3; i < row.length; i += 4) top = Math.max(top, row[i]);
    return { glow: c.meta.glow, top };
  });
  assert.ok(cabin, `a cabin was painted (${mood})`);
  assert.equal(cabin.glow, true, `the cabin's lights are on (${mood})`);
  assert.equal(cabin.top, 0, `the chimney smoke runs into the top edge of the cabin's layer (${mood})`);
}

// A swipe sideways is nobody's, so it can't run on into Chrome's swipe to go Back or Forward: the page doesn't
// overscroll, and the canvas takes every touch.
{
  const look = await S(() => ['html', 'body', '#canvas'].map((s) => { const c = getComputedStyle(document.querySelector(s)); return [c.overscrollBehaviorX, c.touchAction]; }));
  assert.deepEqual(look.slice(0, 2).map((l) => l[0]), ['none', 'none'], 'the page should not overscroll sideways');
  assert.equal(look[2][1], 'none', 'the canvas should take every touch');
}

// On a phone's touch screen the canvas keeps 24 px from the screen's sides, where Android's back gesture starts, at any
// phone width; with a mouse it keeps the page's 16 px gutter.
for (const [width, height, touch] of [[320, 568, true], [320, 700, true], [360, 740, true], [390, 844, true], [412, 915, true], [390, 844, false]]) {
  const ectx = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, serviceWorkers: 'block' });
  const p = await ectx.newPage();
  await p.goto(base);
  const r = await p.evaluate(() => { const r = document.getElementById('canvas').getBoundingClientRect(); return { left: r.left, right: innerWidth - r.right }; });
  if (touch) assert.ok(r.left >= 23.5 && r.right >= 23.5, `the canvas comes ${Math.min(r.left, r.right).toFixed(1)} px from the screen's side at ${width}x${height}`);
  else assert.deepEqual([r.left, r.right].map(Math.round), [16, 16], 'with a mouse the canvas keeps the page gutter');
  await ectx.close();
}

// Fits a phone: nothing scrolls sideways. Nor on a tablet, in the same stacked layout.
assert.equal(await S(() => document.documentElement.scrollWidth <= innerWidth), true, 'the page scrolls sideways on a phone');
for (const width of [600, 768, 959]) {
  await page.setViewportSize({ width, height: 1000 });
  assert.equal(await S(() => document.documentElement.scrollWidth <= innerWidth), true, `the page scrolls sideways at ${width} px wide`);
}

// A phone held sideways gets the side-by-side layout, packed to fit one screen: the whole canvas on the left, the
// palette and all four buttons beside it. The page itself doesn't scroll, so nothing needs a swipe on the canvas, which
// would paint. (Checked with the longest brush line, which takes three lines there.)
for (const [width, height] of [[844, 390], [667, 375]]) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(300);
  const sideways = await S(() => {
    const lineEl = document.getElementById('line');
    const toolEl = document.getElementById('tool');
    const was = [lineEl.textContent, toolEl.textContent];
    lineEl.textContent = 'Your turn. Tap, flick, or press and hold. Try hitting what’s already there, too.';
    toolEl.textContent = 'Round brush · Sap Green, Yellow Ochre, Van Dyke Brown · a touch of Alizarin Crimson';
    const at = (id) => document.getElementById(id).getBoundingClientRect();
    const inside = (r) => r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
    const canvas = at('canvas');
    const seen = {
      canvas: inside(canvas),
      offScreen: ['line', 'palette', 'oopsBtn', 'autoBtn', 'newBtn', 'signBtn'].filter((id) => !inside(at(id))),
      beside: at('palette').left >= canvas.right,
      scrolls: document.documentElement.scrollHeight > innerHeight || document.documentElement.scrollWidth > innerWidth,
    };
    [lineEl.textContent, toolEl.textContent] = was;
    return seen;
  });
  assert.deepEqual(sideways, { canvas: true, offScreen: [], beside: true, scrolls: false }, `held sideways at ${width} × ${height}`);
}

// With a notch at each side, as on an iPhone held sideways, nothing is drawn under it: not the page, not the gallery wall.
await page.setViewportSize({ width: 844, height: 390 });
const notched = await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, left: 47, right: 47, bottom: 21 } }).then(() => true, () => false);
if (notched) {
  await page.waitForTimeout(300);
  const clear = () => S(() => {
    const under = [];
    for (const sel of ['.top', '#canvas', '.tray', '.wall']) {
      const el = document.querySelector(sel);
      const r = el.getBoundingClientRect();
      if (el.closest('[hidden]')) continue;
      if (r.left < 47 || r.right > innerWidth - 47) under.push(`${sel} ${Math.round(r.left)}..${Math.round(r.right)}`);
    }
    return under;
  });
  assert.deepEqual(await clear(), [], 'the page sits under the notch');
  await page.keyboard.press('g');
  assert.deepEqual(await clear(), [], 'the gallery wall sits under the notch');
  await page.keyboard.press('Escape');
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 0, left: 0, right: 0, bottom: 0 } });
} else {
  console.log('(this Chromium can’t pretend to have a notch, so that check was skipped)');
}
await page.setViewportSize({ width: 390, height: 844 });

// On a phone, upright or sideways, the palette and buttons stay put while the painter talks: every line the painter can
// say (paints running together too) fits the room kept for it, and so does every brush line, whatever paint it names.
const stillPalette = () => S(async () => {
  const { LINES, mixLine, toolInfo } = await import('./src/words.js');
  const { PIGMENTS } = await import('./src/schemes.js');
  const flat = (v) => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(flat) : v && typeof v === 'object' ? Object.values(v).flatMap(flat) : []);
  const names = PIGMENTS.map((p) => p.name).sort((a, b) => b.length - a.length);
  const lines = flat(LINES);
  for (let i = 0; i < 6; i++) for (const n of [2, 3, 4]) lines.push(mixLine(names.slice(0, n), 'nearly black'));
  const tools = ['', toolInfo('wash')];
  for (const kind of [...Object.keys(LINES), 'rain']) for (const p of [undefined, ...PIGMENTS]) tools.push(toolInfo(kind, p));
  const lineEl = document.getElementById('line');
  const toolEl = document.getElementById('tool');
  const was = [lineEl.textContent, toolEl.textContent];
  const say = (line, tool) => { lineEl.textContent = line; toolEl.textContent = tool; };
  const tallest = (list, el, other) => list.reduce((best, t) => { other === 'line' ? say(t, '') : say('', t); const h = el.getBoundingClientRect().height; return h > best[0] ? [h, t] : best; }, [0, ''])[1];
  const longLine = tallest(lines, lineEl, 'line');
  const longTool = tallest(tools, toolEl, 'tool');
  const ys = new Set();
  const at = () => ['palette', 'oopsBtn'].map((id) => Math.round(document.getElementById(id).getBoundingClientRect().y)).join('/');
  for (const t of lines) for (const u of ['', longTool]) { say(t, u); ys.add(at()); }
  for (const u of tools) for (const t of ['', longLine]) { say(t, u); ys.add(at()); }
  say(...was);
  return [...ys];
});
for (const [width, height] of [[390, 844], [360, 740], [844, 390], [667, 375]]) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(300);
  const ys = await stillPalette();
  assert.equal(ys.length, 1, `at ${width} × ${height} the palette and buttons moved as the painter talked, to ${ys.join(', ')} px`);
}
await page.setViewportSize({ width: 390, height: 844 });

// Finger-sized targets on a phone (44 px, after Apple's Human Interface Guidelines and WCAG 2.2's 2.5.5 Target Size):
// upright, the header and tray buttons are 44 px tall, and so are the sign form's. The dabs of paint keep their size and
// place on the palette, and so do the buttons held sideways, but a finger landing just outside one still gets it.
for (const [width, height] of [[390, 844], [844, 390]]) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(300);
  const targets = await S((upright) => {
    const out = { short: [], missed: [], dab: null };
    const near = (el, dx, dy) => { const r = el.getBoundingClientRect(); const x = dx < 0 ? r.left - 3 : dx > 0 ? r.right + 3 : r.left + r.width / 2; const y = dy < 0 ? r.top - 3 : dy > 0 ? r.bottom + 3 : r.top + r.height / 2; return el.contains(document.elementFromPoint(x, y)); };
    for (const b of document.querySelectorAll('.top-actions button, .actions button')) {
      if (upright && b.getBoundingClientRect().height < 44) out.short.push(b.id);
      if (!upright && b.closest('.top-actions') && !(near(b, 0, -1) && near(b, 0, 1))) out.missed.push(b.id);
    }
    for (const d of document.querySelectorAll('.dab')) if (!(near(d, 0, -1) && near(d, 0, 1) && near(d, -1, 0) && near(d, 1, 0))) out.missed.push(d.getAttribute('aria-label'));
    const r = document.querySelector('.dab').getBoundingClientRect();
    out.dab = [Math.round(r.width), Math.round(r.height)];
    out.manipulation = getComputedStyle(document.getElementById('oopsBtn')).touchAction;
    return out;
  }, height > width);
  assert.deepEqual(targets, { short: [], missed: [], dab: [32, 28], manipulation: 'manipulation' }, `tap targets at ${width} × ${height}`);
}
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
await page.keyboard.press('s');
assert.deepEqual(await S(() => [...document.querySelectorAll('#signSheet button')].filter((b) => b.getBoundingClientRect().height < 44).map((b) => b.textContent)), [], 'the sign form’s buttons are 44 px tall');
await page.keyboard.press('Escape');

// Space is Oops, M turns the sound on and off (and remembers it), and Ctrl+Z gets a word about there being no undo.
await S(() => document.activeElement?.blur());
before = await S(() => window.happyAccidents.accidents);
await page.keyboard.press(' ');
assert.equal(await S(() => window.happyAccidents.accidents), before + 1, 'Space should make an accident');
assert.match(await page.getAttribute('#soundBtn', 'title'), /\(M\)/, 'the sound button names its key, like the others');
await page.keyboard.press('m');
assert.deepEqual([await page.textContent('#soundBtn'), await S(() => localStorage.getItem('happy-accidents:sound'))], ['Sound: on', 'true'], 'M should turn the sound on');
await page.keyboard.press('m');
assert.deepEqual([await page.textContent('#soundBtn'), await S(() => localStorage.getItem('happy-accidents:sound'))], ['Sound: off', 'false'], 'M again should turn it off');
await page.waitForTimeout(1500);
await settle();
await page.keyboard.press('Control+z');
await page.waitForTimeout(400);
assert.ok((await S(async () => (await import('./src/words.js')).LINES.undo)).includes(await page.textContent('#line')), 'Ctrl+Z should get the line about there being no undo');

// The S key opens the sign form without typing an "s" into it.
const watchTyping = () => S(() => {
  window.typed = [];
  for (const id of ['artistName', 'artTitle']) document.getElementById(id).addEventListener('input', (e) => window.typed.push(`${id}: ${e.data}`));
});
await watchTyping();
await page.keyboard.press('s');
assert.equal(await page.isHidden('#signSheet'), false, 'S opens the sign form');
assert.equal(await page.getByRole('dialog', { name: 'Sign your painting' }).count(), 1, 'the sign form is a dialog named for its heading');
assert.equal(await page.getByRole('textbox', { name: 'Title', exact: true }).count(), 1, 'the title field is named just Title');
assert.equal(await S(() => document.activeElement.id), 'artistName', 'with no name saved yet, S starts in the name field');
assert.deepEqual(await S(() => window.typed), [], 'pressing S typed into the sign form');
await page.keyboard.press('Escape');

// The on-screen keyboard doesn't cover Sign it. Chrome shrinks the page for it (the viewport tag asks it to); iOS Safari
// leaves the page full height and only the visible part (window.visualViewport) shrinks, which is pretended here: a
// 336 px keyboard and its 44 px bar over a 390 × 844 phone. Enter in the name field goes on to the title.
{
  const kctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
  await kctx.addInitScript(() => {
    const vv = new EventTarget();
    Object.assign(vv, { width: 390, height: 844, offsetTop: 0, offsetLeft: 0, scale: 1 });
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
  });
  const p = await kctx.newPage();
  await p.goto(base);
  await p.waitForFunction(() => window.happyAccidents?.skipIntro);
  await p.evaluate(() => window.happyAccidents.skipIntro());
  assert.match(await p.getAttribute('meta[name=viewport]', 'content'), /interactive-widget=resizes-content/, 'the viewport tag asks for the page to shrink for the keyboard');
  assert.deepEqual(await p.evaluate(() => ['autocapitalize', 'autocorrect', 'spellcheck', 'enterkeyhint'].map((a) => document.getElementById('artistName').getAttribute(a))), ['words', 'off', 'false', 'next'], 'the name field asks the keyboard for capitals and no corrections');
  await p.tap('#signBtn');
  await p.focus('#artistName');
  const keyboard = (height) => p.evaluate((height) => { window.visualViewport.height = height; window.visualViewport.dispatchEvent(new Event('resize')); }, height);
  await keyboard(844 - 336 - 44);
  const seen = await p.evaluate(() => {
    const bottom = (sel) => Math.round(document.querySelector(sel).getBoundingClientRect().bottom);
    const top = Math.round(document.querySelector('.sheet').getBoundingClientRect().top);
    return { top: top >= 0, title: bottom('#artTitle') <= 464, signIt: bottom('#signForm button[type=submit]') <= 464 };
  });
  assert.deepEqual(seen, { top: true, title: true, signIt: true }, 'with the keyboard up, the sign form is in the part of the screen still showing');
  await p.keyboard.press('Enter');
  assert.deepEqual(await p.evaluate(() => [document.activeElement.id, document.getElementById('signSheet').hidden]), ['artTitle', false], 'Enter in the name field goes on to the title');
  await keyboard(844);
  assert.equal(await p.evaluate(() => document.getElementById('signSheet').style.height), '', 'with the keyboard down, the overlay is full height again');
  await kctx.close();
}

// Sign it: the label shows and the painting goes up in the gallery. Anything still being painted when you sign is
// finished before the painting is framed, even something slow (here a splat that stays wet for eight seconds, longer
// than the wait used to last), and until then New canvas, Sign it, Let it happen and the gallery wall wait, from the
// buttons or the keys. (Paint another on an older painting from the wall would start over under the signature.)
await S(async () => {
  const { PIGMENTS } = await import('./src/schemes.js');
  const st = window.happyAccidents;
  st.addSplat({ x: st.W * 0.7, y: st.hy * 0.3, R: 20, pigment: PIGMENTS[0], delay: 8000 });
  window.framedBusy = [];
  const snapshot = st.snapshot.bind(st);
  st.snapshot = (...args) => {
    window.framedBusy.push(st.busy);
    return snapshot(...args);
  };
});
const accidentsSigned = await S(() => window.happyAccidents.accidents);
// (Once the painting is up, the page asks the browser to keep the wall: counted here.)
await S(() => {
  window.askedToKeep = 0;
  navigator.storage.persisted = async () => false;
  navigator.storage.persist = async () => ++window.askedToKeep > 0 && false;
});
await page.click('#signBtn');
await page.fill('#artistName', 'Robin');
await page.fill('#artTitle', 'Test Pattern at Otter Cove');
await page.click('#signForm button[type=submit]');
// While the signature goes on, the canvas takes no new paint: not a tap, not Oops, not Space, not Enter on the canvas.
// (New paint kept the wait for the paint to dry going, and the picture was framed with it half-painted.)
b = await box();
await page.mouse.click(b.x + b.width * 0.3, b.y + b.height * 0.25);
await page.touchscreen.tap(b.x + b.width * 0.6, b.y + b.height * 0.7);
await page.click('#oopsBtn');
await page.keyboard.press(' ');
await page.focus('#canvas');
await page.keyboard.press('Enter');
assert.equal(await page.isHidden('#placard'), true, 'the label came up before the paint during the signature was tried');
await page.waitForTimeout(400);
assert.equal(await S(() => window.happyAccidents.accidents), accidentsSigned, 'paint went on the canvas while the signature went on');
const canvasNo = await page.textContent('#canvasNo');
await page.click('#newBtn');
assert.equal(await page.textContent('#canvasNo'), canvasNo, 'New canvas waits while the painting is being signed');
await page.click('#signBtn');
assert.equal(await page.isHidden('#signSheet'), true, 'Sign it waits while the painting is being signed');
await page.click('#autoBtn');
assert.equal(await page.getAttribute('#autoBtn', 'aria-pressed'), 'false', 'Let it happen waits while the painting is being signed');
await page.click('#galleryBtn');
assert.equal(await page.isHidden('#gallery'), true, 'Gallery waits while the painting is being signed');
for (const key of ['n', 's', 'a', 'g']) await page.keyboard.press(key);
assert.equal(await page.textContent('#canvasNo'), canvasNo, 'N waits while the painting is being signed');
assert.equal(await page.isHidden('#signSheet'), true, 'S waits while the painting is being signed');
assert.equal(await page.getAttribute('#autoBtn', 'aria-pressed'), 'false', 'A waits while the painting is being signed');
assert.equal(await page.isHidden('#gallery'), true, 'G waits while the painting is being signed');
await page.waitForSelector('#placard:not([hidden])', { timeout: 30000 });
assert.deepEqual(await S(() => window.framedBusy), [false, false], 'the painting was framed while paint on it was still going on');
assert.equal(await page.textContent('#plTitle'), 'Test Pattern at Otter Cove');
assert.equal(await page.textContent('#plArtist'), 'Robin');
// A title in a right-to-left script keeps the year after it, not pulled round in front of it ("2026 ,title").
assert.equal(await page.getAttribute('#plTitle', 'dir'), 'auto');
assert.equal(await S(() => document.getElementById('plArtist').localName), 'bdi', 'the artist’s name on the label isn’t set apart from the text around it');
assert.ok(await S(() => {
  const t = document.getElementById('plTitle');
  const was = t.textContent;
  t.textContent = 'غروب فوق البحيرة';
  const after = document.getElementById('plYear').getBoundingClientRect().left > t.getBoundingClientRect().right;
  t.textContent = was;
  return after;
}), 'an Arabic title put the year in front of it on the label');
assert.match(await page.textContent('#plNote'), new RegExp(`from ${accidentsSigned} happy accidents`));
assert.equal(await S(() => window.happyAccidents.accidents), accidentsSigned, 'paint went on the canvas while the signature went on');
assert.equal(await S(() => window.happyAccidents.signed.accidents), accidentsSigned, 'the label and the easel disagree on how many accidents were signed');
assert.equal(await S(() => window.askedToKeep), 1, 'hanging the first painting didn’t ask the browser to keep the wall');
assert.equal(await S(() => document.getElementById('app').inert), true, 'the page behind the label is out of reach');
await page.click('#keepBtn');
assert.equal(await page.textContent('#galleryCount'), '1');
assert.equal(await S(() => document.getElementById('app').inert), false);
assert.equal(await S(() => document.activeElement.id), 'signBtn', 'after the label, focus goes back to Sign it');
// Back at the easel the painter says it's on the wall, instead of still saying to sign it.
await page.waitForTimeout(300);
const hungLines = await S(async () => (await import('./src/words.js')).LINES.hung);
assert.ok(hungLines.includes(await page.textContent('#line')), `after signing, the painter said “${await page.textContent('#line')}”`);

// Sign it again with nothing new on the canvas brings its label back up, instead of hanging a second copy.
await page.click('#signBtn');
await page.waitForSelector('#placard:not([hidden])', { timeout: 5000 }).catch(() => assert.fail('Sign it again with nothing new didn’t bring the label back'));
assert.equal(await page.isHidden('#signSheet'), true, 'Sign it again with nothing new opened the sign form');
assert.equal(await page.textContent('#plTitle'), 'Test Pattern at Otter Cove');
assert.equal(await S(() => JSON.parse(localStorage.getItem('happy-accidents:gallery')).length), 1, 'signing again with nothing new hung a second copy');
await page.click('#keepBtn');
assert.equal(await page.textContent('#galleryCount'), '1');

// Held sideways, the label opens showing the whole framed painting, signature corner and all, with its three buttons
// beside it, in one screen and not scrolled down. (Upright too, where the buttons are under it.)
for (const [width, height] of [[844, 390], [667, 375], [390, 844]]) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(300);
  await page.click('#signBtn');
  await page.waitForSelector('#placard:not([hidden])', { timeout: 5000 });
  const seen = await S(() => {
    const inside = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth; };
    const frame = document.querySelector('.frame').getBoundingClientRect();
    return {
      scrolled: document.getElementById('placard').scrollTop,
      frame: frame.top >= 0 && frame.bottom <= innerHeight,
      offScreen: ['placardImg', 'anotherBtn', 'keepBtn', 'downloadBtn'].filter((id) => !inside(id)),
      short: ['anotherBtn', 'keepBtn', 'downloadBtn'].filter((id) => document.getElementById(id).getBoundingClientRect().height < 44),
    };
  });
  assert.deepEqual(seen, { scrolled: 0, frame: true, offScreen: [], short: [] }, `the label at ${width} × ${height}`);
  await page.click('#keepBtn');
}
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);

// The painting time on the label counts only while the page is showing: time spent on another tab doesn't go on it.
// (Here the canvas has been showing 10 seconds, then the page is hidden for 3.)
{
  const [whileHidden, after] = await S(async () => {
    const st = window.happyAccidents;
    const show = (on) => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => !on });
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (on ? 'visible' : 'hidden') });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    const startedAt = st.startedAt;
    st.startedAt = Date.now() - 10000;
    show(false);
    await new Promise((r) => setTimeout(r, 3000));
    const hidden = st.summary().seconds;
    show(true);
    delete document.hidden;
    delete document.visibilityState;
    const shown = st.summary().seconds;
    st.startedAt = startedAt;
    return [hidden, shown];
  });
  assert.ok(whileHidden <= 11 && after <= 11, `time the page was hidden went on the label (${whileHidden} s while hidden, ${after} s after)`);
}

// Paint added after signing isn't on the wall, so New canvas asks first.
await page.click('#oopsBtn');
await page.waitForTimeout(200);
await settle();
await page.click('#newBtn');
assert.equal(await page.textContent('#newBtn'), 'Start over?', 'New canvas asks first when paint was added after signing');
assert.equal(await page.textContent('#canvasNo'), canvasNo, 'the first tap of New canvas kept the painting');

// So does Paint another on a painting opened from the wall: the first tap asks, and only a second one starts over.
await page.click('#galleryBtn');
await page.click('.wall-open');
await page.click('#anotherBtn');
assert.equal(await page.textContent('#anotherBtn'), 'Start over?', 'Paint another on a painting from the wall asks first when the easel has paint that isn’t hung');
assert.equal(await page.textContent('#canvasNo'), canvasNo, 'the first tap of Paint another kept the painting');
await page.click('#anotherBtn');
assert.notEqual(await page.textContent('#canvasNo'), canvasNo, 'a second tap of Paint another starts over');
assert.equal(await page.isHidden('#placard'), true);

// The gallery survives a reload, and the canvas numbers carry on from where they were.
const lastNo = Number((await page.textContent('#canvasNo')).match(/\d+/)[0]);
await page.reload();
await page.evaluate(() => document.fonts.ready);
assert.equal(await page.textContent('#galleryCount'), '1', 'the signed painting is still in the gallery after a reload');
assert.equal(await page.textContent('#canvasNo'), `Canvas No. ${lastNo + 1}`, 'the canvas numbers started over after a reload');
await page.keyboard.press('g');
assert.equal(await page.locator('.wall-item').count(), 1);
// Opened from the wall after the reload, the painting is its full-size picture (the canvas's 1200 px at this screen's
// scale), not the wall's 720 px copy, and that's what Download saves.
await page.click('.wall-open');
await page.waitForFunction(() => document.getElementById('placardImg').naturalWidth === 1200, null, { timeout: 5000 }).catch(async () => assert.fail(`a painting opened from the wall after a reload is ${await S(() => document.getElementById('placardImg').naturalWidth)} px wide, not 1200`));
{
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#downloadBtn')]);
  assert.equal(jpegWidth(await readFile(await dl.path())), 1200, 'Download from the wall didn’t save the full-size picture');
}
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');

// Where IndexedDB is refused (a private window, a page opened from disk in some browsers), the painting still hangs,
// and opened from the wall it shows and downloads the wall's 720 px copy.
{
  const ictx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, serviceWorkers: 'block' });
  await ictx.addInitScript(() => Object.defineProperty(window, 'indexedDB', { get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } }));
  const p = await ictx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(base);
  await p.evaluate(() => window.happyAccidents.skipIntro());
  await p.evaluate(() => window.happyAccidents.randomAccident());
  await p.waitForTimeout(200);
  await p.waitForFunction(() => !window.happyAccidents.busy && !window.happyAccidents.active.length, null, { timeout: 20000 });
  await p.keyboard.press('s');
  await p.click('#signForm button[type=submit]');
  await p.waitForSelector('#placard:not([hidden])', { timeout: 30000 });
  await p.reload();
  await p.keyboard.press('g');
  await p.click('.wall-open');
  await p.waitForFunction(() => document.getElementById('placardImg').complete, null, { timeout: 5000 });
  assert.equal(await p.evaluate(() => document.getElementById('placardImg').naturalWidth), 720, 'with IndexedDB refused, the painting from the wall didn’t show its wall copy');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#downloadBtn')]);
  assert.equal(jpegWidth(await readFile(await dl.path())), 720);
  assert.deepEqual(errors, [], 'problems with IndexedDB refused');
  await ictx.close();
}

// Shift (or Caps Lock) doesn't stop the letter keys: the key hints show them as capitals.
await page.keyboard.press('Shift+G');
assert.equal(await page.isHidden('#gallery'), false, 'Shift+G opens the gallery');
await page.keyboard.press('Escape');

// A full wall on a phone: two paintings to a row, long titles kept to two lines, and Close still in reach at the bottom.
{
  const wctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
  const p = await wctx.newPage();
  await p.goto(base);
  await p.waitForFunction(() => window.happyAccidents?.skipIntro);
  await p.evaluate(() => {
    window.happyAccidents.skipIntro();
    const img = window.happyAccidents.snapshot(240, 'image/jpeg', 0.8);
    const list = Array.from({ length: 12 }, (_, i) => ({ id: `w${i}`, title: 'The Midnight Homestead at Stillwater Crossing, Early October', artist: 'Wilhelmina Featherstonehaugh', year: 2026, date: new Date(2026, 10, i + 1).toISOString(), img, accidents: 9, seconds: 80, scheme: 'Golden Hour', number: i + 1, features: 'Features a cabin.' }));
    localStorage.setItem('happy-accidents:gallery', JSON.stringify(list));
  });
  await p.tap('#galleryBtn');
  const wall = await p.evaluate(() => {
    const items = [...document.querySelectorAll('.wall-item')].map((li) => li.getBoundingClientRect());
    const cite = document.querySelector('.wall-meta cite');
    const o = document.getElementById('gallery');
    o.scrollTop = o.scrollHeight;
    const close = document.getElementById('closeGallery').getBoundingClientRect();
    return {
      perRow: items.filter((r) => Math.abs(r.top - items[0].top) < 1).length,
      titleLines: Math.round(cite.getBoundingClientRect().height / parseFloat(getComputedStyle(cite).lineHeight)),
      closeAtBottom: document.elementFromPoint(close.left + close.width / 2, close.top + close.height / 2)?.id,
      sideways: document.documentElement.scrollWidth > innerWidth,
      short: [...document.querySelectorAll('#gallery button.quiet')].filter((b) => b.getBoundingClientRect().height < 44).length,
    };
  });
  assert.deepEqual(wall, { perRow: 2, titleLines: 2, closeAtBottom: 'closeGallery', sideways: false, short: 0 }, 'twelve paintings on the wall on a phone (Close and Remove 44 px tall)');
  await wctx.close();
}

// The phone's Back button closes the overlay on top instead of leaving the page: the gallery wall, a painting opened
// from it, and the sign form. Closing one with its own button takes its step off the history again.
const goBack = async (id) => {
  await S(() => history.back());
  await page.waitForFunction((id) => document.getElementById(id)?.hidden !== false, id);
  assert.equal(await S(() => window.stillHere), true, `Back from #${id} left the page`);
};
await S(() => (window.stillHere = true));
await page.keyboard.press('g');
await goBack('gallery');
await page.keyboard.press('g');
await page.click('.wall-open');
assert.equal(await page.textContent('#keepBtn'), 'Back to the wall', 'a painting opened from the wall should offer to go back to it');
await goBack('placard');
assert.equal(await page.isHidden('#gallery'), false, 'Back from a painting opened from the wall should go back to the wall');
await goBack('gallery');
await page.keyboard.press('s');
await goBack('signSheet');
await page.click('#galleryBtn');
await page.click('#closeGallery');
await page.waitForFunction(() => history.state === null, null, { timeout: 5000 });   // and with no flick going on, no edge guard entry either (see below)

// A Back that comes while a finger is on the canvas, or just after the browser took a touch from it (as Android's back
// gesture does when a flick near the screen's side is taken for it), is taken for a slip: the studio stays, with the
// painting as it was. A second later, Back leaves in one press, as it always has, and an overlay still closes on Back.
// The guard's extra history entry goes on when a finger touches the canvas and comes off a second after it lifts.
{
  const gctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
  const p = await gctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(base + 'icon.svg');   // somewhere to go Back to
  await p.goto(base);
  await p.waitForFunction(() => window.happyAccidents?.skipIntro);
  await p.evaluate(() => window.happyAccidents.skipIntro());
  await p.tap('#line');   // a first tap, off the canvas
  const guarded = () => p.evaluate(() => history.state?.__edgeGuard === true);
  const gallery = () => p.evaluate(() => [!document.getElementById('gallery').hidden, history.state?.['happy-accidents:overlay'] === true]);
  assert.equal(await guarded(), false, 'no extra history entry before the canvas is touched');
  const quiet = () => p.waitForFunction(() => !window.happyAccidents.busy && !window.happyAccidents.active.length, null, { timeout: 20000 });
  const painting = () => p.evaluate(() => JSON.stringify([window.happyAccidents.accidents, window.happyAccidents.counts, window.happyAccidents.elements.length]));
  const inStudio = async (what) => {
    await p.waitForTimeout(300);
    assert.equal(p.url(), base, what);
  };
  const b = await p.locator('#canvas').boundingBox();
  const at = { x: b.x + b.width * 0.5, y: b.y + b.height * 0.3 };
  // Back in the middle of a flick: the flick carries on, and letting go lands it.
  await quiet();
  const before = await p.evaluate(() => window.happyAccidents.accidents);
  await p.mouse.move(at.x, at.y); await p.mouse.down();
  assert.equal(await guarded(), true, 'a finger down on the canvas adds the extra entry');
  await p.mouse.move(at.x + 40, at.y + 10, { steps: 4 });
  await p.goBack();
  await inStudio('Back in the middle of a flick should stay in the studio');
  await p.mouse.move(at.x + 80, at.y + 20, { steps: 2 }); await p.mouse.up();
  await p.waitForFunction((n) => window.happyAccidents.accidents > n, before, { timeout: 5000 }).catch(() => assert.fail('the flick across a Back should still land'));
  await quiet();
  await p.waitForTimeout(1300);
  assert.equal(await guarded(), false, 'a second after the finger lifts, the extra entry is gone again');
  // The browser takes the touch, then a Back follows.
  const was = await painting();
  const cdp = await gctx.newCDPSession(p);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await p.goBack();
  await inStudio('Back just after the touch was taken should stay in the studio');
  await quiet();
  assert.equal(await painting(), was, 'the painting should be as it was');
  await p.waitForTimeout(1300);
  assert.equal(await guarded(), false, 'and the entry goes once the second after the taken touch is up');
  // The gallery opened within a second of a flick, while the guard's entry is still on, takes that entry over as its
  // own step: it stays open when the second is up, Back closes it, and no extra entry is left under it.
  await p.mouse.move(at.x, at.y); await p.mouse.down(); await p.mouse.move(at.x + 60, at.y + 15, { steps: 3 }); await p.mouse.up();
  await p.tap('#galleryBtn');
  assert.deepEqual(await gallery(), [true, true], 'the gallery opens just after a flick, with its own step');
  await p.waitForTimeout(1300);
  assert.deepEqual(await gallery(), [true, true], 'and is still open, on its own step, when the guard\'s second is up');
  await p.goBack();
  await p.waitForFunction(() => document.getElementById('gallery').hidden, null, { timeout: 5000 });
  await inStudio('Back from the gallery wall opened just after a flick should close it');
  assert.equal(await p.evaluate(() => history.state), null, 'no entry is left under the gallery opened just after a flick');
  await quiet();
  // An overlay opened with no flick going on still closes on Back, and then Back with none open leaves in one press.
  await p.waitForTimeout(1300);
  await p.tap('#galleryBtn');
  assert.deepEqual(await gallery(), [true, true], 'the gallery opens with its own step');
  await p.goBack();
  await p.waitForFunction(() => document.getElementById('gallery').hidden, null, { timeout: 5000 });
  await inStudio('Back from the gallery wall should close it');
  assert.equal(await p.evaluate(() => history.state), null, 'with the gallery shut and no flick going on, no extra entry is left');
  await p.goBack();
  await p.waitForURL(/icon\.svg$/, { timeout: 5000 }).catch(() => assert.fail('Back a while after a touch was taken should leave in one press'));
  // A tap on the canvas, the wall opened within the second and closed with its button: one Back leaves, as it would
  // have without the tap.
  await p.goForward();
  await p.waitForFunction(() => window.happyAccidents?.skipIntro);
  await p.evaluate(() => window.happyAccidents.skipIntro());
  await p.tap('#line');
  await p.tap('#canvas', { position: { x: b.width * 0.5, y: b.height * 0.3 } });
  await p.tap('#galleryBtn');
  assert.deepEqual(await gallery(), [true, true], 'the gallery opens just after a tap on the canvas, on its own step');
  await p.tap('#closeGallery');
  await p.waitForFunction(() => history.state === null, null, { timeout: 5000 });
  await p.goBack();
  await p.waitForURL(/icon\.svg$/, { timeout: 5000 }).catch(() => assert.fail('after a tap and the wall opened and closed, one Back should leave'));
  assert.deepEqual(errors, []);
  await gctx.close();
}

// Inside another page's frame (the claude.ai viewer), overlays leave the history alone: going back from in there would
// move the whole page back.
const host = await browser.newPage({ viewport: { width: 420, height: 900 } });
await host.setContent(`<iframe src="${base}" style="width:390px;height:844px;border:0"></iframe>`);
const framed = host.frames()[1];
await framed.waitForFunction(() => window.happyAccidents?.skipIntro);
await framed.evaluate(() => window.happyAccidents.skipIntro());
const pagesBack = await host.evaluate(() => history.length);
await framed.click('#galleryBtn');
assert.equal(await framed.isHidden('#gallery'), false, 'the gallery opens in a frame');
assert.equal(await host.evaluate(() => history.length), pagesBack, 'opening the gallery in a frame added a step to the page’s history');
await host.close();

// With the name remembered, S starts in the title field, still without an "s" added to the title.
await watchTyping();
await page.keyboard.press('s');
assert.equal(await S(() => document.activeElement.id), 'artTitle', 'with a name saved, S starts in the title field');
assert.equal(await page.inputValue('#artistName'), 'Robin');
assert.deepEqual(await S(() => window.typed), [], 'pressing S typed into the title');
await page.keyboard.press('Escape');

// Keyboard focus stays with the overlays: Tab doesn't wander into the page behind the gallery, and closing a painting
// opened from the wall goes back to the Gallery button that opened the wall.
await page.focus('#galleryBtn');
await page.keyboard.press('Enter');
assert.equal(await page.isHidden('#gallery'), false);
for (let i = 0; i < 5; i++) {
  await page.keyboard.press('Tab');
  assert.equal(await S(() => document.getElementById('app').contains(document.activeElement)), false, 'Tab went from the gallery to the page behind it');
}
await page.focus('.wall-open');
await page.keyboard.press('Enter');
assert.equal(await page.isHidden('#placard'), false);
assert.equal(await page.isHidden('#gallery'), true);
await page.keyboard.press('Escape');
assert.equal(await page.isHidden('#gallery'), false, 'Escape on a painting opened from the wall goes back to the wall');
assert.equal(await S(() => document.activeElement.className), 'wall-open', 'back on the wall, focus is on the painting that was open');
await page.keyboard.press('Escape');
assert.equal(await S(() => document.activeElement.id), 'galleryBtn', 'closing the wall goes back to Gallery');

// Junk in storage (a hand edit, a bad write) doesn't stop the wall opening or hang as a broken painting, and a stored
// name that isn't text stays out of the name field.
await S(() => {
  const hung = JSON.parse(localStorage.getItem('happy-accidents:gallery'));
  localStorage.setItem('happy-accidents:gallery', JSON.stringify([null, 1, 'x', {}, ...hung]));
  localStorage.setItem('happy-accidents:artist', '{"x":1}');
  localStorage.setItem('happy-accidents:canvases', '"lots"');
});
await page.reload();
await page.evaluate(() => document.fonts.ready);
assert.equal(await page.textContent('#galleryCount'), '1', 'junk in storage counted as paintings');
assert.equal(await page.textContent('#canvasNo'), 'Canvas No. 1', 'a canvas count that isn’t a number should start the count again');
await page.keyboard.press('g');
assert.equal(await page.isHidden('#gallery'), false, 'the gallery opens with junk in storage');
assert.equal(await page.locator('.wall-item').count(), 1, 'only the real painting hangs');
await page.keyboard.press('Escape');
await page.keyboard.press('s');
assert.equal(await page.inputValue('#artistName'), '', 'a stored name that isn’t text stays out of the name field');

// Left blank, the name signs as Anonymous, as the field's placeholder says, instead of the form refusing to send.
await page.click('#signForm button[type=submit]');
await page.waitForSelector('#placard:not([hidden])', { timeout: 30000 });
assert.equal(await page.textContent('#plArtist'), 'Anonymous', 'a blank name didn’t sign as Anonymous');
await page.click('#keepBtn');
// The blank name is remembered as blank, not as Anonymous, so the next Sign it starts in the empty name field.
assert.equal(await S(() => localStorage.getItem('happy-accidents:artist')), '""', 'a blank name was saved as a name');
await S(() => window.happyAccidents.randomAccident());
await page.waitForTimeout(200);
await settle();
await page.keyboard.press('s');
assert.equal(await page.inputValue('#artistName'), '', 'after signing with a blank name, the name field came back filled in');
assert.equal(await S(() => document.activeElement.id), 'artistName', 'after signing with a blank name, Sign it didn’t start in the name field');
await page.keyboard.press('Escape');

// The wall keeps the 12 newest: the 13th signing takes the oldest down, and the badge stays at 12. (The 12 already up
// are copies of the one there, hung by hand, rather than signed one by one.) Then, when the browser won't keep that
// many, the oldest come down until it will, and the label says so; and when it won't keep any (site data blocked, or
// no room at all), the label says this one won't go up, and the wall stays as it was.
const signAgain = async () => {
  await S(() => window.happyAccidents.newCanvas('golden-hour'));
  await S(() => window.happyAccidents.randomAccident());
  await page.waitForTimeout(200);
  await settle();
  await page.keyboard.press('s');
  await page.click('#signForm button[type=submit]');
  await page.waitForSelector('#placard:not([hidden])', { timeout: 30000 });
};
const wall = () => S(() => JSON.parse(localStorage.getItem('happy-accidents:gallery')).map((r) => r.title));
await S(() => {
  const [rec] = JSON.parse(localStorage.getItem('happy-accidents:gallery'));
  localStorage.setItem('happy-accidents:gallery', JSON.stringify(Array.from({ length: 12 }, (_, i) => ({ ...rec, id: `old${i}`, title: `Painting ${12 - i}` }))));
});
await signAgain();
let hungNow = await wall();
assert.equal(hungNow.length, 12, 'the wall should keep 12');
assert.equal(hungNow[0], await page.textContent('#plTitle'), 'the new painting goes up first');
assert.ok(!hungNow.includes('Painting 1') && hungNow.includes('Painting 2'), `the 13th signing should take the oldest down (${hungNow})`);
assert.equal(await page.isHidden('#keptNote'), true, 'a usual 13th signing has nothing to say under the label');
assert.equal(await page.textContent('#galleryCount'), '12');
// Only the paintings on the wall keep a full-size picture: the new one does, and the ones that came down don't.
await page.waitForTimeout(300);
{
  const [ids, kept] = [await wallIds(), await pictureIds()];
  assert.ok(kept.includes(ids[0]), 'the new painting’s full-size picture wasn’t kept');
  assert.deepEqual(kept.filter((id) => !ids.includes(id)), [], 'pictures of paintings that came down were kept');
}
await page.click('#keepBtn');
// A painting opened from far down the wall goes back to the wall, scrolled to where it was, from its button or Back,
// and the after-signing button is back to the easel again.
assert.equal(await page.textContent('#keepBtn'), 'Back to the easel');
await page.keyboard.press('g');
const wallScroll = await S(() => {
  const g = document.getElementById('gallery');
  g.scrollTop = g.scrollHeight;
  return g.scrollTop;
});
assert.ok(wallScroll > 200, `the wall of 12 should scroll on a phone (${wallScroll})`);
for (const how of ['button', 'Back']) {
  await page.locator('.wall-open').last().click();
  assert.equal(await page.textContent('#keepBtn'), 'Back to the wall');
  if (how === 'button') await page.click('#keepBtn');
  else await S(() => history.back());
  await page.waitForFunction(() => !document.getElementById('gallery').hidden, null, { timeout: 5000 });
  assert.equal(await page.isHidden('#placard'), true);
  assert.ok(Math.abs((await S(() => document.getElementById('gallery').scrollTop)) - wallScroll) < 2, `back on the wall (by ${how}), it wasn't scrolled to where it was`);
}
await page.click('#closeGallery');
await page.waitForFunction(() => history.state === null, null, { timeout: 5000 }).catch(() => assert.fail('going from the wall to a painting and back left an extra step in the history'));
await S(() => {
  window.realSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    if (k === 'happy-accidents:gallery' && JSON.parse(v).length > 5) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    return window.realSetItem.call(this, k, v);
  };
});
await signAgain();
assert.equal((await wall()).length, 5);
assert.equal(await page.isHidden('#keptNote'), false, 'the label didn’t say older paintings came down');
assert.match(await page.textContent('#keptNote'), /the seven oldest paintings came down/);
assert.equal(await page.textContent('#galleryCount'), '5');
await page.click('#keepBtn');
await S(() => {
  Storage.prototype.setItem = function () {
    throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
  };
});
hungNow = await wall();
await signAgain();
assert.equal(await page.isHidden('#keptNote'), false, 'the label didn’t say the browser isn’t keeping the painting');
assert.match(await page.textContent('#keptNote'), /This browser isn’t keeping paintings, so this one won’t go up on the wall\. Download it to keep it\./);
assert.deepEqual(await wall(), hungNow, 'the wall changed when the browser wouldn’t keep the new painting');
assert.equal(await page.textContent('#galleryCount'), '5');
await S(() => (Storage.prototype.setItem = window.realSetItem));
await page.click('#keepBtn');
await page.waitForTimeout(300);
assert.deepEqual(await S(async () => (await import('./src/words.js')).LINES.unkept), [await page.textContent('#line')], 'after a signing the browser wouldn’t keep, the painter didn’t say it isn’t on the wall');

// On the wall, Remove asks first: the first tap turns it into "Remove it?", and only a second one takes the painting
// down. A painting opened there downloads as a JPEG named for its title.
await page.keyboard.press('g');
await page.locator('.wall-item .quiet').first().click();
assert.equal(await page.locator('.wall-item .quiet').first().textContent(), 'Remove it?');
assert.equal(await page.locator('.wall-item').count(), 5, 'the first tap of Remove took the painting down');
const removed = await page.locator('.wall-open').first().getAttribute('data-id');
assert.ok((await pictureIds()).includes(removed), 'the painting about to be removed had no full-size picture kept');
await page.locator('.wall-item .quiet').first().click();
assert.equal(await page.locator('.wall-item').count(), 4, 'the second tap of Remove didn’t take the painting down');
await page.waitForTimeout(300);
assert.ok(!(await pictureIds()).includes(removed), 'Remove left the painting’s full-size picture behind');
assert.equal(await page.textContent('#galleryCount'), '4');
assert.equal((await wall()).length, 4);
assert.deepEqual(await S(() => [document.querySelector('.wall-meta cite').dir, document.querySelectorAll('.wall-meta bdi').length]), ['auto', 4], 'the titles and names on the wall aren’t set apart from the dates beside them');
await page.locator('.wall-open').first().click();
const [saved] = await Promise.all([page.waitForEvent('download'), page.click('#downloadBtn')]);
assert.equal(saved.suggestedFilename(), `${(await wall())[0].toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.jpg`, 'the download is named for the painting');
// Where the browser can hand a picture to the share sheet (phones; pretended here), the button says Save or share and
// shares the full-size painting as one JPEG named for it. Closing the sheet does nothing, and if sharing goes wrong
// any other way, the picture downloads instead. Where it can't share, the button says Download image.
await page.keyboard.press('Escape');
await S(() => {
  window.shared = [];
  window.shareFails = null;
  navigator.canShare = (data) => data?.files?.length === 1 && data.files[0] instanceof File;
  navigator.share = async (data) => {
    window.shared.push({ title: data.title, files: await Promise.all(data.files.map(async (f) => ({ name: f.name, type: f.type, width: (await createImageBitmap(f)).width }))) });
    if (window.shareFails) throw new DOMException('Not this time.', window.shareFails);
  };
});
await page.locator('.wall-open').first().click();
assert.equal(await page.textContent('#downloadBtn'), 'Save or share', 'where pictures can be shared, the button doesn’t say so');
await page.waitForFunction(() => document.getElementById('placardImg').naturalWidth === 1200, null, { timeout: 5000 });
await page.click('#downloadBtn');
await page.waitForFunction(() => window.shared.length === 1, null, { timeout: 5000 });
assert.deepEqual(await S(() => window.shared[0]), { title: (await wall())[0], files: [{ name: saved.suggestedFilename(), type: 'image/jpeg', width: 1200 }] }, 'Save or share didn’t share the full-size painting as one JPEG');
{
  let downloaded = 0;
  const count = () => downloaded++;
  page.on('download', count);
  await S(() => (window.shareFails = 'AbortError'));
  await page.click('#downloadBtn');
  await page.waitForFunction(() => window.shared.length === 2, null, { timeout: 5000 });
  await page.waitForTimeout(500);
  assert.equal(downloaded, 0, 'closing the share sheet downloaded the picture anyway');
  page.off('download', count);
}
await S(() => (window.shareFails = 'NotAllowedError'));
await Promise.all([page.waitForEvent('download', { timeout: 5000 }), page.click('#downloadBtn')]).catch(() => assert.fail('when sharing went wrong, the picture didn’t download instead'));
await S(() => {
  delete navigator.canShare;
  delete navigator.share;
});
await page.keyboard.press('Escape');
await page.locator('.wall-open').first().click();
assert.equal(await page.textContent('#downloadBtn'), 'Download image');
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');
assert.equal(await page.isHidden('#gallery'), true);

// With sound saved on, nothing tries to start audio before the first tap or key (the browser refuses and says so in
// the console); the first tap starts it.
const audioComplaints = [];
page.on('console', (m) => { if (/AudioContext/.test(m.text())) audioComplaints.push(m.text()); });
await ctx.addInitScript(() => {
  const Real = window.AudioContext;
  if (Real) window.AudioContext = class extends Real { constructor(...args) { super(...args); (window.audioContexts ||= []).push(this); } };
});
await S(() => localStorage.setItem('happy-accidents:sound', 'true'));
await page.reload();
await page.evaluate(() => document.fonts.ready);
assert.equal(await page.textContent('#soundBtn'), 'Sound: on');
await S(() => window.happyAccidents.randomAccident());
await page.waitForTimeout(500);
assert.equal(await S(() => (window.audioContexts || []).length), 0, 'audio was started before a tap or a key');
assert.deepEqual(audioComplaints, [], 'the console complained about audio');
b = await box();
await page.touchscreen.tap(b.x + b.width * 0.5, b.y + b.height * 0.3);
await page.waitForFunction(() => window.audioContexts?.[0]?.state === 'running', null, { timeout: 10000 });

// Works offline once it has been opened: it opens, paints, signs and hangs the painting on the wall.
await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 });
assert.deepEqual(problems, [], 'problems while painting');
problems.length = 0;
await ctx.setOffline(true);
await page.reload();
await page.waitForFunction(() => window.happyAccidents && window.happyAccidents.elements.length > 0, null, { timeout: 15000 });
assert.equal(await page.title(), 'Happy Accidents');
await page.evaluate(() => document.fonts.ready);
await S(() => window.happyAccidents.skipIntro());
await S(() => window.happyAccidents.randomAccident());
await page.waitForTimeout(200);
await settle();
const hungOnline = Number(await page.textContent('#galleryCount'));
await page.keyboard.press('s');
await page.click('#signForm button[type=submit]');
await page.waitForSelector('#placard:not([hidden])', { timeout: 30000 });
await page.click('#keepBtn');
await page.keyboard.press('g');
assert.equal(await page.locator('.wall-item').count(), hungOnline + 1, 'the painting signed offline isn’t on the wall');
await page.keyboard.press('Escape');
await ctx.setOffline(false);

// With JavaScript off, the page says what it needs on the first screen, not below an easel that does nothing.
const noScript = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
const plain = await noScript.newPage();
await plain.goto(base);
const note = await plain.locator('.noscript').boundingBox();
assert.ok(note && note.y + note.height <= 844, `the note about JavaScript is below the first screen (${JSON.stringify(note)})`);
await noScript.close();

assert.deepEqual(problems, [], 'problems while painting offline, or since');
// Offline, checked the junkdrawer house kit's way, from a server that answers like GitHub Pages: a browser may keep
// each file for ten minutes, and asks again by its ETag. `net` is the connection: 'up', 'down' (the server drops every
// connection) or 'stalled' (a plane's or a train's wifi: it takes each request and holds on to it). With `release`
// set it serves the next release. The server's own switches are needed because the browser's offline switch can't
// make a stall, and in some Chromium builds it doesn't stop the service worker's own requests.
{
  const { createServer } = await import('node:http');
  const { readFile } = await import('node:fs/promises');
  const { join, extname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { createHash } = await import('node:crypto');
  const root = fileURLToPath(new URL('..', import.meta.url));
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
  let net = 'up', release = false;
  const held = [];
  const server = createServer((req, res) => {
    if (net === 'down') { req.socket.destroy(); return; }
    if (net === 'stalled') { held.push([req, res]); return; }
    serve(req, res);
  }).listen(0);
  async function serve(req, res) {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    let body;
    try { body = await readFile(join(root, path)); } catch { res.writeHead(404); res.end(); return; }
    if (release && path === '/sw.js') body = Buffer.from(String(body).replace(/const FILES = '[0-9a-f]*'/, "const FILES = 'next'"));
    if (release && path === '/index.html') body = Buffer.concat([body, Buffer.from('<!-- the next release -->\n')]);
    const etag = `"${createHash('sha1').update(body).digest('hex').slice(0, 16)}"`;
    const head = { etag, 'cache-control': 'max-age=600', 'content-type': TYPES[extname(path)] || 'text/html' };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, head); res.end(); return; }
    res.writeHead(200, head);
    res.end(body);
  }
  const base = `http://localhost:${server.address().port}/`;
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', e => problems.push(e.message));
  await page.goto(base);
  await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 15000 });
  const title = await page.title();
  // It can be installed: Chromium has nothing to say against the manifest, its icons or the worker. That takes full
  // Chromium (the headless shell says nothing about any page) with a profile on disk (a private window can't install
  // anything). A page with no manifest is checked first, to see the check can see.
  {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const dir = mkdtempSync(join(tmpdir(), 'happy-accidents-'));
    const full = await pw.chromium.launchPersistentContext(dir, { channel: 'chromium' }).catch(() => null);
    if (full) {
      try {
        const p = full.pages()[0] || (await full.newPage());
        const errors = async (url) => {
          await p.goto(url);
          await p.waitForTimeout(500);
          return (await (await full.newCDPSession(p)).send('Page.getInstallabilityErrors')).installabilityErrors.map((e) => e.errorId);
        };
        assert.ok((await errors(base + 'LICENSE')).includes('no-manifest'), 'the install check can’t see a page with no manifest');
        await p.goto(base);
        await p.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 15000 });
        assert.deepEqual(await errors(base), [], 'Chromium says the game can’t be installed');
      } finally {
        await full.close();
        rmSync(dir, { recursive: true, force: true });
      }
    } else console.log('(there’s no full Chromium here, so the install check was skipped)');
  }
  // The page opened from a link with a query string (a shared link's ?fbclid=…), kept in the copy under its plain
  // address: see the release below.
  await page.goto(base + '?x=1');
  await page.goto(base);

  // Works offline once it has been opened.
  net = 'down';
  await ctx.setOffline(true);
  await page.reload();
  assert.equal(await page.title(), title, 'the page did not open offline');
  await ctx.setOffline(false);

  // On a connection that's up but not answering, it opens from the copy too, after the worker's few seconds' wait for
  // the network: the page and every file it loads (were any of them left waiting on the network, it wouldn't open).
  net = 'stalled';
  const t0 = Date.now();
  await page.reload({ timeout: 10000 }).catch(() => {});
  const took = Date.now() - t0;
  assert.ok(took < 8000, `the page took ${took} ms to open on a stalled connection`);
  assert.equal(await page.title(), title, 'the page did not open on a stalled connection');
  net = 'up';
  for (const [req, res] of held.splice(0)) serve(req, res);

  // A new release: every file in the new copy comes from the server, though the browser still has its own copies of
  // the old ones for ten minutes. (The next release changes index.html, and so FILES in sw.js, as a real one does.)
  release = true;
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  for (const end = Date.now() + 10000; !(await page.evaluate(async () => !!(await (await caches.match('index.html'))?.text())?.includes('<!-- the next release -->')));) {
    assert.ok(Date.now() < end, "the new release's offline copy kept the old index.html");
    await new Promise(r => setTimeout(r, 100));
  }
  // With the network down, the page opens from the new release's copy, not from an old page kept under ?x=1 (which
  // would run the old index.html with the new release's files).
  net = 'down';
  await ctx.setOffline(true);
  await page.reload();
  assert.equal(await page.evaluate(() => [...document.childNodes].some((n) => n.nodeType === Node.COMMENT_NODE && n.data.includes('the next release'))), true, 'offline after a release, the page opened from an old copy kept under its query string');
  assert.deepEqual(await page.evaluate(async () => (await (await caches.open((await caches.keys())[0])).keys()).map((r) => r.url).filter((u) => u.includes('?'))), [], 'the copy kept a page under its query string');
  await ctx.setOffline(false);
  net = 'up';
  assert.deepEqual(problems, [], 'problems while offline or on a stalled connection');
  await ctx.close();
  server.close();

  // sw.js changes whenever a file it keeps does, so a release replaces the whole offline copy at once: FILES in sw.js
  // is a fingerprint of every file in SHELL (sha1 of each, in the list's order, an address like './' read as its
  // index.html; the first 8 hex of the sha1 of those).
  const sw = await readFile(join(root, 'sw.js'), 'utf8');
  const shell = [...sw.match(/SHELL = \[([^\]]*)\]/)[1].replace(/\/\/.*/g, '').matchAll(/'([^']*)'/g)].map(m => m[1]);
  const all = createHash('sha1');
  for (const f of shell) all.update(createHash('sha1').update(await readFile(join(root, f.endsWith('/') ? f + 'index.html' : f))).digest());
  const files = all.digest('hex').slice(0, 8);
  assert.equal(sw.match(/const FILES = '([0-9a-f]*)'/)?.[1], files, `a file sw.js keeps for offline has changed: set FILES in sw.js to '${files}'`);
}

// The single-file build opens from disk and paints, with nothing in the console and nothing fetched from anywhere.
{
  execSync('node scripts/build.mjs', { cwd: root, stdio: 'ignore' });
  const fctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });
  const p = await fctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('request', (r) => { if (!/^(file|data):/.test(r.url())) errors.push('fetched ' + r.url()); });
  await p.goto(pathToFileURL(join(root, 'dist/happy-accidents.html')).href);
  await p.waitForFunction(() => window.happyAccidents?.skipIntro);
  await p.evaluate(() => window.happyAccidents.skipIntro());
  const fb = await p.locator('#canvas').boundingBox();
  await p.mouse.click(fb.x + fb.width * 0.3, fb.y + fb.height * 0.2);
  await p.waitForFunction(() => window.happyAccidents.accidents === 1 && !window.happyAccidents.busy && !window.happyAccidents.active.length, null, { timeout: 20000 });
  assert.ok(await p.evaluate(() => Object.keys(window.happyAccidents.counts).some((k) => k !== 'sky')), 'a tap in the single-file build turned into nothing');
  assert.deepEqual(errors, [], 'problems in the single-file build opened from disk');
  await fctx.close();
}

await browser.close();
server.close();
console.log('all good');
