// The studio owns the canvas: the scene, the painted elements, the splats waiting
// to be turned into something, the lake reflection, and the animation loop.
import { SCHEMES, PIGMENTS, pickScheme, moodsAfter } from './schemes.js';
import { TAU, rand, clamp, chance, pick, weighted } from './util.js';
import { rgba, darken, mix, mixPaint, familyOf, colorName } from './color.js';
import { makeSplat, renderSplat } from './splat.js';
import { decide, earthy } from './decide.js';
import { sky, signature, SIGNATURE_FONT } from './paint/index.js';
import { bristle, linePts } from './brush.js';
import { line, toolInfo, mixLine, LINES } from './words.js';

export const W = 1200;
export const H = 900;

// Things that change when paint lands on them.
const REACTIVE = new Set(['evergreen', 'deciduous', 'bush', 'mountain', 'sun', 'moon', 'cloud', 'cabin', 'rock']);

// Paints that suit each kind of accident, for when nobody has loaded the brush. Repeats weight the pick.
const PAINT_FOR = {
  cloud: ['titanium-white', 'titanium-white', 'titanium-white', 'alizarin-crimson', 'cadmium-yellow', 'van-dyke-brown', 'prussian-blue'],
  mountain: ['titanium-white', 'titanium-white', 'phthalo-blue', 'prussian-blue', 'van-dyke-brown', 'sap-green'],
  sun: ['cadmium-yellow', 'cadmium-yellow', 'indian-yellow', 'titanium-white'],
  birds: ['van-dyke-brown', 'prussian-blue'],
  treeline: ['sap-green', 'sap-green', 'phthalo-blue', 'titanium-white'],
  bank: ['sap-green', 'sap-green', 'van-dyke-brown', 'yellow-ochre'],
  tree: ['sap-green', 'sap-green', 'sap-green', 'phthalo-blue', 'titanium-white', 'bright-red', 'cadmium-yellow', 'indian-yellow', 'van-dyke-brown'],
  cabin: ['van-dyke-brown', 'van-dyke-brown', 'bright-red'],
  water: ['phthalo-blue', 'titanium-white', 'titanium-white', 'bright-red', 'cadmium-yellow'],
};

// And the other way round: what a loaded paint can sensibly be aimed at.
const FITS = {
  white: ['cloud', 'mountain', 'sun', 'treeline', 'tree', 'water'],
  yellow: ['sun', 'cloud', 'tree', 'water'],
  red: ['cloud', 'tree', 'cabin', 'water'],
  green: ['mountain', 'treeline', 'bank', 'tree'],
  blue: ['mountain', 'birds', 'treeline', 'tree', 'water', 'cloud'],
  brown: ['mountain', 'birds', 'bank', 'cabin', 'cloud', 'tree'],
};
// Yellow Ochre makes land, so it can be aimed at the shore as well; the brighter yellows can't.
const fitsFor = (pigment) => (earthy(pigment) ? [...FITS.yellow, 'bank'] : FITS[pigment.family]);

// Things a splat can land on without touching them: the sky itself, light, weather and small marks.
const SEE_THROUGH = new Set(['sky', 'sunpath', 'signature', 'mist', 'aurora', 'stars', 'birds', 'ripples', 'rain', 'foothills', 'waterfall', 'flowers']);

// Things floating on the lake, which land laid over them covers.
const AFLOAT = new Set(['sailboat', 'canoe', 'glints', 'ripples']);

// What the painter says about a step: its own line if it has one; otherwise the line for what was actually painted, which
// is usually the step's kind, but a step can fall back to something else (blue too near a mountain's foot for a
// waterfall paints mist, and the painter shouldn't announce a waterfall).
export const lineKey = (st, spec) => st.say ?? (spec.kind !== st.kind && LINES[spec.kind] ? spec.kind : st.kind);

// Paint flung off the picture lands just inside its edge, in by most of its own reach (never more than a fifth of the
// canvas), so the body of the splat is on the picture and not a sliver cut off at the side or sitting on the ledge.
// Paint landing well inside doesn't move. The droplets still fly off the way it was flung, and the trail stays put.
export function landInside(sp) {
  const reach = sp.R * sp.stretch * 0.6;
  const mx = Math.min(reach, W * 0.2);
  const my = Math.min(reach, H * 0.2);
  sp.x = clamp(sp.x, mx, W - mx);
  sp.y = clamp(sp.y, my, H - my);
  return sp;
}

const paintFor = (hint) => {
  const id = pick(PAINT_FOR[hint] || PAINT_FOR.cloud);
  return PIGMENTS.find((p) => p.id === id);
};

export class Studio {
  constructor(canvas, hooks = {}) {
    this.canvas = canvas;
    this.W = W;
    this.H = H;
    this.k = hooks.scale ?? 1;
    canvas.width = Math.round(W * this.k);
    canvas.height = Math.round(H * this.k);
    this.ctx = canvas.getContext('2d');
    this.hooks = hooks;
    this.mask = document.createElement('canvas');
    this.mask.width = W / 4;
    this.mask.height = H / 4;
    this.mctx = this.mask.getContext('2d', { willReadFrequently: true });
    const pix = document.createElement('canvas');
    pix.width = 1;
    pix.height = 1;
    this.pix = pix.getContext('2d', { willReadFrequently: true });
    this.paper = this.makePaper();
    this.weave = this.ctx.createPattern(this.makeWeave(), 'repeat');
    this.number = 0;
    // The moods used so far this round (see pickScheme).
    this.moodsUsed = [];
    this.gen = 0;
    this.elements = [];
    this.active = [];
    this.splats = [];
    this.pool = null;
    this.drops = [];
    this.running = false;
    this.frame = this.frame.bind(this);
    // The painting time on the label counts only while the page is showing: time spent hidden (another tab, the phone
    // locked, the canvas left overnight) moves the start along by as much.
    this.hiddenAt = document.hidden ? Date.now() : null;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.hiddenAt = Date.now();
      else if (this.hiddenAt !== null) {
        this.startedAt += Date.now() - Math.max(this.hiddenAt, this.startedAt);
        this.hiddenAt = null;
      }
    });
  }

  layer(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * this.k));
    c.height = Math.max(1, Math.ceil(h * this.k));
    return c;
  }

  // ——— setup ———

  newCanvas(schemeId) {
    this.gen += 1;
    // A mood asked for by name (from the console, or a test) leaves the round of moods as it was.
    const asked = schemeId && SCHEMES.find((s) => s.id === schemeId);
    if (asked) this.scheme = asked;
    else {
      this.scheme = pickScheme(this.scheme?.id ?? this.moodsUsed.at(-1), this.moodsUsed);
      this.moodsUsed = moodsAfter(this.moodsUsed, this.scheme.id);
    }
    this.hy = Math.round(H * rand(0.5, 0.6));
    this.lightDir = chance(0.5) ? -1 : 1;
    this.haze = this.scheme.haze;
    this.elements = [];
    this.active = [];
    this.splats = [];
    this.pool = null;
    this.lastHand = null;
    this.drops = [];
    this.counts = {};
    this.reserved = new Set();
    this.accidents = 0;
    this.signed = null;
    this.startedAt = Date.now();
    this.seq = 0;
    this.mctx.clearRect(0, 0, this.mask.width, this.mask.height);
    this.refl = this.layer(W, this.hy + 2);
    this.rctx = this.refl.getContext('2d');
    this.reflDirty = true;
    this.waterTex = this.makeWaterTexture();
    this.number += 1;
    this.addElement(sky(this));
    this.say('wash', 'wash');
    this.hooks.onCanvas?.(this);
    this.kick();
  }

  makePaper() {
    const c = this.layer(W, H);
    const x = c.getContext('2d');
    x.scale(this.k, this.k);
    x.fillStyle = '#f2efe6';
    x.fillRect(0, 0, W, H);
    for (let i = 0; i < 2500; i++) {
      x.fillStyle = `rgba(${chance(0.5) ? '255,255,255' : '120,110,90'},${rand(0.02, 0.06)})`;
      x.fillRect(rand(W), rand(H), rand(1, 3), rand(1, 3));
    }
    return c;
  }

  makeWeave() {
    const c = document.createElement('canvas');
    c.width = 96;
    c.height = 96;
    const x = c.getContext('2d');
    x.fillStyle = '#fff';
    x.fillRect(0, 0, 96, 96);
    for (let i = 0; i < 96; i += 2) {
      x.fillStyle = `rgba(90,80,70,${rand(0.05, 0.35)})`;
      x.fillRect(0, i, 96, 1);
      x.fillStyle = `rgba(90,80,70,${rand(0.05, 0.35)})`;
      x.fillRect(i, 0, 1, 96);
    }
    return c;
  }

  makeWaterTexture() {
    const h = H - this.hy;
    const c = this.layer(W, h);
    const x = c.getContext('2d');
    x.scale(this.k, this.k);
    const { waterLine, water } = this.scheme;
    for (let i = 0; i < 220; i++) {
      const y = rand(0, h);
      const len = rand(20, 220) * (0.4 + y / h);
      const sx = rand(-50, W);
      const lightLine = chance(0.45);
      bristle(x, linePts(sx, y, sx + len, y + rand(-1, 1), 12), {
        width: rand(1.5, 4),
        count: 2,
        color: lightLine ? waterLine : darken(water, 0.35),
        alpha: lightLine ? rand(0.04, 0.12) : rand(0.06, 0.16),
        taper: 0.4,
      });
    }
    // the faint shine where far water meets the horizon
    for (let sx = -20; sx < W; sx += rand(60, 200)) {
      const len = rand(40, 180);
      bristle(x, linePts(sx, 1.2, sx + len, 1.2, 20), { width: 1.6, count: 2, color: waterLine, alpha: 0.35, taper: 0.4 });
    }
    return c;
  }

  // ——— queries used by the decision logic ———

  count(kind) {
    return this.counts[kind] || 0;
  }

  has(kind) {
    return this.reserved.has(kind) || this.count(kind) > 0;
  }

  reserve(kind) {
    this.reserved.add(kind);
  }

  isLand(x, y) {
    const mx = clamp(Math.floor(x / 4), 0, W / 4 - 1);
    const my = clamp(Math.floor(y / 4), 0, H / 4 - 1);
    return this.mctx.getImageData(mx, my, 1, 1).data[3] > 100;
  }

  // New ground, outlined by pts. Anything floating where there's ground now (a canoe, glints, ripples) moves to just
  // behind the land's layer, at depth, so the land covers it instead of it sitting on the grass. A sailboat would
  // still show its sail over the top, as if it stood on the land, so it sails out to the nearest open water instead,
  // or, with none near, it's gone.
  addLand(pts, depth) {
    const m = this.mctx;
    m.save();
    m.scale(0.25, 0.25);
    m.fillStyle = '#000';
    m.beginPath();
    pts.forEach(([x, y], i) => (i ? m.lineTo(x, y) : m.moveTo(x, y)));
    m.closePath();
    m.fill();
    m.restore();
    if (depth === undefined) return;
    for (const el of [...this.elements]) {
      if (!AFLOAT.has(el.kind) || el.depth < depth || !el.meta || !this.isLand(el.meta.x, el.meta.y - 2)) continue;
      if (el.kind === 'sailboat') this.sailAside(el);
      else el.depth = depth - 0.5;
    }
  }

  sailAside(el) {
    const { x, y, size } = el.meta;
    const open = (nx) => nx > size && nx < W - size && [-0.9, -0.45, 0, 0.45, 0.9].every((f) => !this.isLand(nx + f * size, y - 2));
    for (let d = size * 0.6; d < size * 5; d += size * 0.3) {
      const dx = [d, -d].find((v) => open(x + v));
      if (dx === undefined) continue;
      el.bbox = { ...el.bbox, x: el.bbox.x + dx };
      el.meta.x += dx;
      return;
    }
    this.elements = this.elements.filter((e) => e !== el);
    this.counts.sailboat -= 1;
  }

  // What's painted at a point: the frontmost element whose paint is actually there.
  // Samples a small ring as well as the center, so a splat on a thin-needled tree still counts.
  elementAt(x, y, r = 0) {
    const pts = [[x, y]];
    for (let i = 0; i < 6; i++) pts.push([x + Math.cos((i / 6) * TAU) * r * 0.5, y + Math.sin((i / 6) * TAU) * r * 0.5]);
    const tally = new Map();
    pts.forEach(([px, py], i) => {
      const el = this.topAt(px, py);
      if (el) tally.set(el, (tally.get(el) || 0) + (i ? 1 : 2.5));
    });
    let best = null;
    let most = 0;
    for (const [el, n] of tally) {
      if (n > most) {
        best = el;
        most = n;
      }
    }
    return best;
  }

  topAt(x, y) {
    for (let i = this.elements.length - 1; i >= 0; i--) {
      const el = this.elements[i];
      if (SEE_THROUGH.has(el.kind)) continue;
      if (el.depth < 0 && y > this.hy) continue;
      const b = el.bbox;
      if (x < b.x || y < b.y || x >= b.x + b.w || y >= b.y + b.h) continue;
      if (el.kind === 'sun' || el.kind === 'moon') {
        if (Math.hypot(x - el.meta.x, y - el.meta.y) <= el.meta.r * 1.3) return el;
        continue;
      }
      if (this.alphaAt(el, x, y) > 90) return el;
    }
    return null;
  }

  // The sky's own color at a point (under anything painted on it), from its layer.
  skyAt(x, y) {
    const el = this.elements.find((e) => e.kind === 'sky');
    if (!el) return null;
    const p = this.pix;
    p.clearRect(0, 0, 1, 1);
    p.drawImage(el.canvas, Math.floor((clamp(x, 0, W - 1) - el.bbox.x) * this.k), Math.floor((clamp(y, 0, el.bbox.h - 1) - el.bbox.y) * this.k), 1, 1, 0, 0, 1, 1);
    const d = p.getImageData(0, 0, 1, 1).data;
    return d[3] ? [d[0], d[1], d[2]] : null;
  }

  alphaAt(el, x, y) {
    const p = this.pix;
    p.clearRect(0, 0, 1, 1);
    p.drawImage(el.canvas, Math.floor((x - el.bbox.x) * this.k), Math.floor((y - el.bbox.y) * this.k), 1, 1, 0, 0, 1, 1);
    return p.getImageData(0, 0, 1, 1).data[3];
  }

  // A random point on the ground. Random tries find a big bank at once; a thin far one (a strip of shore that's 1% of
  // the lake) can slip through all of them, so then it looks over the whole land mask, every second pixel, and picks
  // one of the spots it finds.
  findLand() {
    const y0 = this.hy + (H - this.hy) * 0.08;
    for (let i = 0; i < 80; i++) {
      const x = rand(W * 0.03, W * 0.97);
      const y = rand(y0, H * 0.97);
      if (this.isLand(x, y)) return { x, y };
    }
    const mw = this.mask.width;
    const top = Math.ceil(y0 / 4);
    const rows = Math.floor((H * 0.97) / 4) - top;
    if (rows <= 0) return null;
    const d = this.mctx.getImageData(0, top, mw, rows).data;
    const found = [];
    for (let my = 0; my < rows; my += 2) {
      for (let mx = Math.ceil((W * 0.03) / 4); mx < (W * 0.97) / 4; mx += 2) {
        if (d[(my * mw + mx) * 4 + 3] > 100) found.push([mx, my + top]);
      }
    }
    if (!found.length) return null;
    const [mx, my] = pick(found);
    return { x: mx * 4 + 2, y: my * 4 + 2 };
  }

  findWater() {
    for (let i = 0; i < 60; i++) {
      const x = rand(W * 0.3, W * 0.7);
      const y = rand(this.hy + (H - this.hy) * 0.1, this.hy + (H - this.hy) * 0.8);
      if (!this.isLand(x, y)) return { x, y };
    }
    return null;
  }

  // ——— narration ———

  // In this canvas's mood, and for paint the toy threw itself (auto) or someone threw.
  say(key, kind, pigment, auto = false) {
    const ctx = { scheme: this.scheme?.id, auto };
    this.hooks.onNarrate?.({ line: line(key, ctx) || line(kind, ctx), info: toolInfo(kind, pigment, key), kind });
  }

  // ——— elements ———

  addElement(spec) {
    const b = this.clampBox(spec.bbox);
    const canvas = this.layer(b.w, b.h);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(this.k, 0, 0, this.k, -b.x * this.k, -b.y * this.k);
    const el = { ...spec, bbox: b, canvas, ctx, i: 0, t0: performance.now(), dur: spec.dur ?? 1400, done: false, seq: this.seq++ };
    this.elements.push(el);
    this.elements.sort((a, c) => a.depth - c.depth || a.seq - c.seq);
    this.active.push(el);
    this.counts[spec.kind] = (this.counts[spec.kind] || 0) + 1;
    // A bare tree or a birch is still a deciduous tree to the titles and to decide(); only the label tells them apart.
    if (spec.meta?.bare) this.counts[spec.meta.birch ? 'birch' : 'bare'] = (this.counts[spec.meta.birch ? 'birch' : 'bare'] || 0) + 1;
    if (spec.reflect) this.reflDirty = true;
    this.hooks.onBrush?.(spec.kind, el.dur);
    this.kick();
    return el;
  }

  // Paint more into an element that's already on the canvas (snow on a tree, a sunset in the sky).
  paintOnto(target, spec) {
    const el = {
      kind: spec.kind,
      ops: spec.ops,
      ctx: target.ctx,
      canvas: target.canvas,
      bbox: target.bbox,
      depth: target.depth,
      reflect: target.reflect,
      i: 0,
      t0: performance.now(),
      dur: spec.dur ?? 1200,
      done: false,
    };
    this.active.push(el);
    this.counts[spec.kind] = (this.counts[spec.kind] || 0) + 1;
    if (target.reflect) this.reflDirty = true;
    this.hooks.onBrush?.(spec.kind, el.dur);
    this.kick();
    return el;
  }

  clampBox({ x, y, w, h }) {
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(W, Math.ceil(x + w));
    const y1 = Math.min(H, Math.ceil(y + h));
    return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
  }

  // ——— splats ———

  addSplat(spec) {
    const sp = landInside(makeSplat(spec));
    // Thrown by the toy itself (Oops, Let it happen, the intro), not by someone: the painter doesn't say "you hit him".
    sp.auto = !!spec.auto;
    if (!sp.auto) this.lastHand = sp;
    renderSplat(sp, this.k);
    this.land(sp, spec.delay ?? rand(450, 850));
    return sp;
  }

  // A splat hits the canvas. If it lands in paint that's still wet, the two run together.
  land(sp, delay) {
    sp.gen = this.gen;
    sp.landed = performance.now();
    const wet = this.splats.find(
      (s) => s.state === 'wet' && s.gen === this.gen && Math.hypot(s.x - sp.x, s.y - sp.y) < (s.R * s.stretch + sp.R * sp.stretch) * 0.7,
    );
    this.splats.push(sp);
    this.accidents += 1;
    this.hooks.onSplat?.(sp);
    if (wet) this.merge(wet, sp);
    else {
      sp.state = 'wet';
      this.dryIn(sp, delay);
    }
    this.kick();
  }

  merge(a, b) {
    b.state = 'merged';
    b.parent = a;
    if (!b.auto) a.auto = false;
    a.merged = [...(a.merged || []), b];
    const parts = [a, ...a.merged];
    const areas = parts.map((p) => p.R * p.R * p.stretch);
    const total = areas.reduce((s, v) => s + v, 0);
    a.center = {
      x: parts.reduce((s, p, i) => s + p.x * areas[i], 0) / total,
      y: parts.reduce((s, p, i) => s + p.y * areas[i], 0) / total,
    };
    a.effR = Math.sqrt(parts.reduce((s, p) => s + p.R * p.R, 0));
    // The colors run together too, the way paint does: yellow into blue makes green. The mix,
    // not either paint, decides what it becomes.
    const rgb = mixPaint(parts.map((p, i) => [p.pigment.rgb, areas[i]]));
    const main = parts[areas.indexOf(Math.max(...areas))].pigment;
    const names = [...new Set(parts.map((p) => p.pigment.name))];
    a.mixPigment = { ...main, id: names.length > 1 ? 'mix' : main.id, name: names.join(' and '), family: familyOf(rgb), rgb };
    // Each part runs toward the new color while it's still wet.
    const t0 = performance.now();
    for (const p of parts) {
      p.tintFrom = p.color || p.pigment.rgb;
      p.tintTo = rgb;
      p.tintT0 = t0;
    }
    this.dryIn(a, rand(800, 1100));
    // A lot of one paint and a little of another can stay the first paint's color: the painter says it's still that.
    const still = familyOf(rgb) === familyOf(main.rgb) && colorName(rgb) === colorName(main.rgb);
    if (names.length > 1) this.hooks.onNarrate?.({ line: mixLine(names, colorName(rgb), still ? main.name : undefined), info: '', kind: 'merge' });
    else this.say('merge', 'merge');
    this.kick();
  }

  // A wet splat is read (and painted in) after ms.
  dryIn(sp, ms) {
    clearTimeout(sp.timer);
    sp.due = performance.now() + ms;
    sp.timer = setTimeout(() => this.resolve(sp), ms);
  }

  // Your last splat stays wet a moment longer while you reach for another color, so the next one can run into it. Only
  // your own (never one from Oops, Let it happen or the intro), only once, and never more than a few seconds after it
  // landed, so browsing the palette can't leave paint sitting unread on the canvas.
  keepWet(ms = 1800) {
    const hand = this.lastHand;
    if (!hand || hand.keptWet || hand.gen !== this.gen) return;
    hand.keptWet = true;
    const sp = hand.parent ?? hand;
    if (sp.state !== 'wet') return;
    const now = performance.now();
    const until = Math.min(now + ms, hand.landed + 2600);
    if (until > sp.due) this.dryIn(sp, until - now);
  }

  resolve(sp) {
    if (sp.gen !== this.gen || sp.state !== 'wet') return;
    let plan = [];
    try {
      plan = decide(this, sp);
    } catch (err) {
      console.error(err);
    }
    sp.state = 'absorbing';
    this.runPlan(sp, plan, 0);
  }

  runPlan(sp, plan, i) {
    if (sp.gen !== this.gen) return;
    if (i >= plan.length) {
      sp.state = 'fading';
      this.kick();
      return;
    }
    const st = plan[i];
    let spec = null;
    try {
      spec = st.make(plan[i - 1]?.spec);
    } catch (err) {
      console.error(err);
    }
    if (!spec) {
      this.runPlan(sp, plan, i + 1);
      return;
    }
    st.spec = spec;
    if (!st.quiet) this.say(lineKey(st, spec), spec.kind, sp.mixPigment || sp.pigment, sp.auto);
    const el = spec.onto ? this.paintOnto(spec.onto, spec) : this.addElement(spec);
    spec.el = el;
    el.onProgress = (t) => {
      sp.alpha = Math.min(sp.alpha, 1 - clamp(((i + t) / plan.length) * 1.4, 0, 1));
    };
    el.onDone = () => this.runPlan(sp, plan, i + 1);
  }

  startPool(pt, pigment) {
    this.pool = makeSplat({ x: pt.x, y: pt.y, R: 14, pigment });
    this.pool.t0 = performance.now();
    renderSplat(this.pool, this.k);
    this.kick();
  }

  endPool() {
    const p = this.pool;
    this.pool = null;
    this.kick();
    return p;
  }

  // The held-down puddle becomes a real splat, shape and all.
  commitPool() {
    const sp = this.pool;
    if (!sp) return null;
    this.pool = null;
    this.lastHand = sp;
    this.land(sp, rand(350, 650));
    return sp;
  }

  // Droplets flung off the brush mid-drag, shown until the splat lands and takes them over.
  addDrop(d, pigment) {
    this.drops.push({ ...d, color: pigment.rgb });
    this.kick();
  }

  takeDrops() {
    const d = this.drops;
    this.drops = [];
    return d;
  }

  // An accident nobody asked for. hint nudges it toward something the painting could use.
  // With a paint given, it only aims where that color makes sense; without one, it picks a
  // paint that suits what it's aiming at. spot, if given, overrides part of where it lands ({ y } for the intro's bank).
  randomAccident(opts = {}) {
    const ang = rand(TAU);
    const speed = chance(0.5) ? rand(0.2, 1.6) : 0;
    const motion = { vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, delay: opts.delay };

    // Now and then, land right on something that's already painted and see what it does to it.
    const targets = this.elements.filter((e) => REACTIVE.has(e.kind));
    if (!opts.hint && targets.length > 2 && chance(0.28)) {
      const t = pick(targets);
      const spot = this.spotOn(t);
      if (spot) return this.addSplat({ ...motion, pigment: opts.pigment ?? pick(PIGMENTS), ...spot, auto: true });
    }

    const fits = opts.pigment ? fitsFor(opts.pigment) : null;
    let hint = opts.hint ?? this.pickHint(fits);
    let spot = null;
    // Otherwise look for open space, so the painting keeps growing.
    for (let i = 0; i < 8 && !spot; i++) {
      const s = this.spotFor(hint);
      if (s && (i === 7 || !this.elementAt(s.x, s.y, s.R))) spot = s;
    }
    if (!spot) {
      hint = fits && !fits.includes('cloud') ? 'mountain' : 'cloud';
      spot = this.spotFor(hint);
    }
    const pigment = opts.pigment ?? paintFor(hint);
    return this.addSplat({ ...motion, pigment, ...spot, ...(hint === opts.hint ? opts.spot : null), hint, auto: true });
  }

  // A point that's actually on an element.
  spotOn(t) {
    const m = t.meta;
    if (!m) return null;
    switch (t.kind) {
      case 'mountain':
        return { x: m.peak[0] + rand(-40, 40), y: m.peak[1] + m.hgt * rand(0.15, 0.4), R: rand(16, 30) };
      case 'sun':
      case 'moon':
        return { x: m.x, y: m.y, R: rand(14, 22) };
      case 'cloud':
        return { x: m.x + rand(-0.2, 0.2) * m.w, y: m.baseY - m.h * 0.4, R: rand(16, 26) };
      case 'cabin':
        return { x: (m.x0 + m.x1) / 2, y: m.baseY - m.size * 0.2, R: rand(14, 22) };
      case 'rock':
        return { x: m.x, y: m.y - m.hh * 0.5, R: rand(12, 18) };
      default:
        return m.baseY ? { x: m.x, y: m.baseY - m.size * rand(0.35, 0.6), R: rand(14, 24) } : null;
    }
  }

  pickHint(fits) {
    const c = (k) => this.count(k);
    const land = this.findLand() !== null;
    const ok = ([hint]) => !fits || fits.includes(hint);
    return weighted([
      ['cloud', c('cloud') < 3 ? 2.2 : 0.7],
      ['mountain', c('mountain') === 0 ? 3.5 : c('mountain') < 3 ? 1.1 : 0],
      ['sun', this.has('sun') || this.has('moon') ? 0 : 0.7],
      ['birds', 0.45],
      ['treeline', c('treeline') < 2 ? 1.3 : 0.25],
      ['bank', c('bank') < 2 ? 2.8 : c('bank') < 4 ? 1 : 0.25],
      ['tree', land ? 3.2 + c('bank') * 0.3 : 0],
      ['cabin', land && !this.has('cabin') ? 0.5 : 0],
      ['water', 0.6],
    ].map((e) => (ok(e) ? e : [e[0], 0])));
  }

  spotFor(hint) {
    const hy = this.hy;
    switch (hint) {
      case 'cloud':
        return { x: rand(W * 0.05, W * 0.95), y: rand(0.08, 0.6) * hy, R: rand(24, 44) };
      case 'mountain':
        return { x: rand(W * 0.12, W * 0.88), y: hy - rand(0.16, 0.42) * H, R: rand(30, 55) };
      case 'sun':
        return { x: W * (this.lightDir < 0 ? rand(0.12, 0.38) : rand(0.62, 0.88)), y: rand(0.2, 0.5) * hy, R: rand(20, 30) };
      case 'birds':
        return { x: rand(W * 0.15, W * 0.85), y: rand(0.15, 0.55) * hy, R: rand(10, 15) };
      case 'treeline':
        return { x: rand(W * 0.1, W * 0.9), y: hy + rand(-0.015, 0.015) * H, R: rand(24, 44) };
      case 'bank': {
        const left = chance(0.5);
        return { x: left ? rand(W * 0.03, W * 0.26) : rand(W * 0.74, W * 0.97), y: hy + rand(0.12, 0.85) * (H - hy), R: rand(26, 48) };
      }
      case 'tree':
      case 'cabin': {
        const p = this.findLand();
        return p && { ...p, R: rand(20, 46) };
      }
      case 'water': {
        const p = this.findWater();
        return p && { ...p, R: rand(12, 30) };
      }
      default:
        return null;
    }
  }

  // ——— signing ———

  async sign(name) {
    try {
      await Promise.race([document.fonts.load(`44px ${SIGNATURE_FONT}`), new Promise((r) => setTimeout(r, 1500))]);
    } catch {
      /* fall back to whatever script face is available */
    }
    this.elements = this.elements.filter((e) => e.kind !== 'signature');
    this.counts.signature = 0;
    // The signature looks at the painting under each corner to find one it can be read on: the painting as it is now,
    // without an earlier signature or any wet paint.
    this.render(performance.now(), { splats: false });
    const el = this.addElement(signature(this, name, (b) => this.pixelsUnder(b)));
    // How many accidents it had when signed: paint added after that isn't on the gallery wall.
    this.signed = { name, at: Date.now(), accidents: this.accidents };
    return new Promise((resolve) => {
      el.onDone = () => resolve();
    });
  }

  // The painting's pixels under a box, as [r, g, b], from a small copy of it (32 across, up to 64 down).
  pixelsUnder({ x, y, w, h }) {
    const cw = 32;
    const ch = clamp(Math.round((cw * h) / w), 4, 64);
    this.sampler ??= Object.assign(document.createElement('canvas'), { width: cw, height: 64 }).getContext('2d', { willReadFrequently: true });
    const c = this.sampler;
    c.clearRect(0, 0, cw, 64);
    c.drawImage(this.canvas, x * this.k, y * this.k, w * this.k, h * this.k, 0, 0, cw, ch);
    const d = c.getImageData(0, 0, cw, ch).data;
    const out = [];
    for (let i = 0; i < d.length; i += 4) out.push([d[i], d[i + 1], d[i + 2]]);
    return out;
  }

  get busy() {
    return this.active.length > 0 || this.splats.some((s) => s.state === 'wet' || s.state === 'absorbing');
  }

  summary() {
    return {
      counts: { ...this.counts },
      accidents: this.accidents,
      seconds: Math.max(1, Math.round(((this.hiddenAt === null ? Date.now() : Math.max(this.hiddenAt, this.startedAt)) - this.startedAt) / 1000)),
      scheme: this.scheme,
      number: this.number,
    };
  }

  snapshot(width = W * this.k, type = 'image/jpeg', quality = 0.9) {
    this.render(performance.now(), { splats: false });
    const c = document.createElement('canvas');
    c.width = Math.round(width);
    c.height = Math.round((width * H) / W);
    c.getContext('2d').drawImage(this.canvas, 0, 0, c.width, c.height);
    this.render(performance.now());
    return c.toDataURL(type, quality);
  }

  // ——— loop ———

  kick() {
    if (!this.running) {
      this.running = true;
      requestAnimationFrame(this.frame);
    }
  }

  frame(now) {
    for (const el of this.active) {
      const t = Math.min(1, (now - el.t0) / el.dur);
      const target = Math.min(el.ops.length, Math.ceil(t * el.ops.length));
      while (el.i < target) el.ops[el.i++](el.ctx);
      if (el.reflect) this.reflDirty = true;
      el.onProgress?.(t);
      if (el.i >= el.ops.length) el.done = true;
    }
    const finished = this.active.filter((e) => e.done);
    this.active = this.active.filter((e) => !e.done);
    // A finished element lets go of its callbacks before the next step runs: they hold the splat it came from (its
    // rendered canvas, any parts that ran into it and the flick's trail), and the element stays on the canvas.
    for (const el of finished) {
      el.ops = null;
      const done = el.onDone;
      el.onDone = el.onProgress = null;
      done?.(el);
    }

    const dt = Math.min(64, now - (this.lastFrame ?? now));
    this.lastFrame = now;
    for (const s of this.splats) {
      if (s.state === 'fading') s.alpha -= dt / 350;
      else if (s.parent) s.alpha = s.parent.alpha;
      if (s.tintT0) {
        const t = clamp((now - s.tintT0) / 700, 0, 1);
        s.color = mix(s.tintFrom, s.tintTo, t * t * (3 - 2 * t));
        renderSplat(s, this.k);
        if (t >= 1) s.tintT0 = null;
      }
    }
    this.splats = this.splats.filter((s) => s.alpha > 0.01);

    if (this.pool) {
      const R = 14 + 58 * (1 - Math.exp(-(now - this.pool.t0) / 1600));
      if (R - this.pool.renderedR > 0.8) {
        this.pool.R = R;
        renderSplat(this.pool, this.k);
      }
    }

    this.render(now);

    const animating = this.active.length || this.pool || this.splats.some((s) => now - s.born < 240 || s.tintT0 || s.state === 'fading' || s.state === 'absorbing');
    if (animating) requestAnimationFrame(this.frame);
    else {
      this.running = false;
      this.lastFrame = null;
    }
  }

  buildReflection() {
    const r = this.rctx;
    r.setTransform(this.k, 0, 0, this.k, 0, 0);
    r.drawImage(this.paper, 0, 0, W, H);
    for (const el of this.elements) {
      if (!el.reflect || el.depth > 0.5) continue;
      r.drawImage(el.canvas, el.bbox.x, el.bbox.y, el.canvas.width / this.k, el.canvas.height / this.k);
    }
    this.reflDirty = false;
  }

  drawWater(ctx) {
    const { hy, k } = this;
    if (this.reflDirty) this.buildReflection();
    const src = this.refl;
    const maxSy = src.height / k - 2;
    for (let y = hy; y < H; y += 2) {
      const d = y - hy;
      const sy = clamp(hy - d - 2, 0, maxSy);
      const amp = 0.4 + d * 0.012;
      const off = Math.sin(d * 0.23) * amp + Math.sin(d * 0.071 + 1.3) * amp * 0.7;
      ctx.drawImage(src, 0, sy * k, W * k, 2 * k, off - 8, y, W + 16, 2.3);
    }
    const g = ctx.createLinearGradient(0, hy, 0, H);
    g.addColorStop(0, rgba(this.scheme.water, 0.12));
    g.addColorStop(1, rgba(this.scheme.water, 0.5));
    ctx.fillStyle = g;
    ctx.fillRect(0, hy, W, H - hy);
    ctx.drawImage(this.waterTex, 0, hy, W, H - hy);
  }

  render(now, opts = {}) {
    const { ctx, k } = this;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.paper, 0, 0, W, H);
    let water = false;
    for (const el of this.elements) {
      if (!water && el.depth >= 0) {
        this.drawWater(ctx);
        water = true;
      }
      ctx.drawImage(el.canvas, el.bbox.x, el.bbox.y, el.canvas.width / k, el.canvas.height / k);
    }
    if (!water) this.drawWater(ctx);

    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = this.weave;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    if (opts.splats === false) return;
    for (const s of this.splats) this.drawSplat(ctx, s, now);
    if (this.pool) this.drawSplat(ctx, this.pool, now);
    for (const d of this.drops) {
      ctx.fillStyle = rgba(d.color);
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, TAU);
      ctx.fill();
    }
  }

  drawSplat(ctx, s, now) {
    const age = now - s.born;
    let pop = 1;
    if (age < 200) {
      const t = age / 200;
      pop = 0.35 + 0.65 * (1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2));
    }
    ctx.save();
    ctx.globalAlpha = clamp(s.alpha, 0, 1);
    ctx.translate(s.x, s.y);
    ctx.scale(pop, pop);
    ctx.drawImage(s.canvas, -s.ext, -s.ext, s.ext * 2, s.ext * 2);
    ctx.restore();
    if (s.trail?.length) {
      ctx.save();
      ctx.globalAlpha = clamp(s.alpha, 0, 1);
      ctx.fillStyle = rgba(s.color || s.pigment.rgb);
      for (const d of s.trail) {
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}
