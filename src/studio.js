// The studio owns the canvas: the scene, the painted elements, the splats waiting
// to be turned into something, the lake reflection, and the animation loop.
import { SCHEMES, PIGMENTS, pickScheme, moodsAfter } from './schemes.js';
import { TAU, rand, clamp, chance, pick, weighted } from './util.js';
import { rgba, darken, mix, mixPaint, familyOf, colorName } from './color.js';
import { makeSplat, renderSplat } from './splat.js';
import { decide, earthy, MAX_FLOCKS } from './decide.js';
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
  rock: ['van-dyke-brown', 'van-dyke-brown', 'yellow-ochre', 'sap-green'],
  island: ['sap-green', 'sap-green', 'van-dyke-brown', 'yellow-ochre'],
  stars: ['titanium-white', 'titanium-white', 'cadmium-yellow'],
  aurora: ['sap-green'],
};

// How much each mood likes each family of paint, for accidents that pick their own: Winter Hush its whites, greens and
// blues, Autumn Blaze its reds and yellows. (1 for a family not listed.)
const MOOD_PAINTS = {
  'winter-hush': { white: 2, green: 1.5, blue: 1.5, yellow: 0.4, red: 0.4 },
  'autumn-blaze': { red: 2.5, yellow: 2.5, white: 0.5 },
};
// Aims that grow trees: in a mood with no snow, an accident doesn't pick white for them (a snowy pine in Golden Hour).
const TREE_AIMS = new Set(['tree', 'treeline']);
const TREES = new Set(['evergreen', 'deciduous', 'bush']);

// A paint for an accident that picks its own, from ids (repeats weight the pick), as the mood likes them. noWhite: here
// white would only bring snow (to a tree, the cabin or the ground), so a mood with no snow doesn't pick it.
export function moodPaint(ids, scheme, noWhite = false) {
  const like = MOOD_PAINTS[scheme.id] || {};
  const paints = ids.map((id) => PIGMENTS.find((p) => p.id === id)).filter((p) => !(noWhite && p.family === 'white' && !scheme.snow));
  return weighted(paints.map((p) => [p, like[p.family] ?? 1]));
}

// The paint for an accident aimed at hint: one that suits it, and the mood.
export const paintFor = (hint, scheme, noWhite = TREE_AIMS.has(hint)) => moodPaint(PAINT_FOR[hint] || PAINT_FOR.cloud, scheme, noWhite);

// And the other way round: what a loaded paint can sensibly be aimed at.
// Any paint can be aimed at the cabin, if there is one (onCabin): it changes it.
const FITS = {
  white: ['cloud', 'mountain', 'sun', 'treeline', 'tree', 'water', 'stars', 'onCabin'],
  yellow: ['sun', 'cloud', 'tree', 'water', 'stars', 'onCabin'],
  red: ['cloud', 'tree', 'cabin', 'water', 'onCabin'],
  green: ['mountain', 'treeline', 'bank', 'tree', 'rock', 'island', 'aurora', 'onCabin'],
  blue: ['mountain', 'birds', 'treeline', 'tree', 'water', 'cloud', 'onCabin'],
  brown: ['mountain', 'birds', 'bank', 'cabin', 'cloud', 'tree', 'rock', 'island', 'onCabin'],
};
// Yellow Ochre makes land, so it can be aimed at the shore, a rock or an island as well; the brighter yellows can't.
const fitsFor = (pigment) => (earthy(pigment) ? [...FITS.yellow, 'bank', 'rock', 'island'] : FITS[pigment.family]);

// Things a splat can land on without touching them: the sky itself, light, weather and small marks.
const SEE_THROUGH = new Set(['sky', 'sunpath', 'signature', 'mist', 'aurora', 'stars', 'birds', 'ripples', 'rain', 'snowShower', 'foothills', 'waterfall', 'flowers']);

// Things floating on the lake, which land laid over them covers.
const AFLOAT = new Set(['sailboat', 'canoe', 'loons', 'glints', 'ripples']);

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

// A pile of layers drawn back to front onto a base, with the finished part kept as ready-made pictures, so a frame
// redraws only what's still being painted. Each unbroken run of finished layers is one picture (the first one with
// the base under it), and a frame draws those pictures and the layers still being painted between them. A layer
// being painted only has to stay under the layers above it that it overlaps, so it's drawn as high up the pile as
// that allows: a cloud that touches nothing above it goes over the top, and doesn't break the pile in two. When a
// layer finishes, the pictures on either side of it and the layer itself are put together into one; a picture is
// only drawn again layer by layer when the pile changes under it (a layer slips in among its layers or moves, or one
// of them is painted on again), and then about a canvas's worth of layers a frame, the rest drawn straight on until
// their turn comes. A layer is anything with a canvas and a bbox, drawn at its bbox at the studio's scale.
class Stack {
  constructor(k, width, height, base) {
    this.k = k;
    this.width = width;
    this.height = height;
    this.base = base;
    this.runs = [];
    this.spare = [];
  }

  // A blank picture, with the base on it if it's the first; box is where it has paint, in the canvas's own pixels.
  fresh(based) {
    const canvas = this.spare.pop() ?? Object.assign(document.createElement('canvas'), { width: this.width, height: this.height });
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.setTransform(this.k, 0, 0, this.k, 0, 0);
    const run = { canvas, ctx, based, kept: [], box: based ? [0, 0, this.width, this.height] : null };
    if (based) this.base(ctx);
    return run;
  }

  put(ctx, layer) {
    const { k } = this;
    ctx.drawImage(layer.canvas, layer.bbox.x, layer.bbox.y, layer.canvas.width / k, layer.canvas.height / k);
  }

  // Where a layer has paint, in the canvas's own pixels (a layer at a part-pixel place spreads into the pixel round it).
  boxOf(layer) {
    const { k } = this;
    const b = layer.bbox;
    return [Math.floor(b.x * k) - 1, Math.floor(b.y * k) - 1, Math.ceil(b.x * k + layer.canvas.width) + 1, Math.ceil(b.y * k + layer.canvas.height) + 1];
  }

  // Adds a layer to a picture.
  add(run, layer) {
    this.put(run.ctx, layer);
    run.kept.push({ layer, canvas: layer.canvas, bbox: layer.bbox });
    this.grow(run, this.boxOf(layer));
  }

  grow(run, [x0, y0, x1, y1]) {
    const box = [Math.max(0, x0), Math.max(0, y0), Math.min(this.width, x1), Math.min(this.height, y1)];
    run.box = run.box ? [Math.min(run.box[0], box[0]), Math.min(run.box[1], box[1]), Math.max(run.box[2], box[2]), Math.max(run.box[3], box[3])] : box;
  }

  // Draws a picture onto ctx pixel for pixel, only where it has paint (and inside clip, if there is one).
  show(ctx, run, clip) {
    let [x0, y0, x1, y1] = run.box ?? [0, 0, 0, 0];
    if (clip) [x0, y0, x1, y1] = [Math.max(x0, clip[0]), Math.max(y0, clip[1]), Math.min(x1, clip[2]), Math.min(y1, clip[3])];
    if (x1 <= x0 || y1 <= y0) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(run.canvas, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
    ctx.restore();
  }

  // Whether a picture's layers are the layers from index at: the same ones, at the same places, in the same order.
  holds(run, layers, at) {
    if (at + run.kept.length > layers.length) return false;
    return run.kept.every((r, i) => {
      const l = layers[at + i];
      return r.layer === l && r.canvas === l.canvas && r.bbox === l.bbox;
    });
  }

  // The order to draw in: the finished layers as they are, and each layer being painted as high as it can go, just
  // under the first layer above it that it overlaps (or the place that one went to, if it's being painted too). Layers
  // that don't overlap can be drawn in either order and come out the same.
  order(layers, live) {
    const n = layers.length;
    const busy = layers.map(live);
    const boxes = layers.map((l) => this.boxOf(l));
    const meets = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
    const at = new Array(n);
    for (let i = n - 1; i >= 0; i--) {
      if (!busy[i]) continue;
      let a = n;
      for (let j = i + 1; j < a; j++) if (meets(boxes[i], boxes[j])) a = Math.min(a, busy[j] ? at[j] : j);
      at[i] = a;
    }
    const out = [];
    const before = Array.from({ length: n + 1 }, () => []);
    for (let i = 0; i < n; i++) if (busy[i]) before[at[i]].push(layers[i]);
    for (let s = 0; s <= n; s++) {
      for (const l of before[s]) out.push({ layer: l, live: true });
      if (s < n && !busy[s]) out.push({ layer: layers[s], live: false });
    }
    return out;
  }

  // How layers s to e (not including e) are drawn: from last frame's pictures where they still fit, put together
  // where they meet; a layer no picture has is added to one, while there's budget left (so no one frame puts a whole
  // pile of layers into pictures), and drawn straight onto the canvas after that, to be added in a later frame.
  segment(layers, s, e, based, old, taken, budget) {
    const fits = (r, at) => !taken.has(r) && r.kept.length <= e - at && this.holds(r, layers, at);
    const out = [];
    // The picture being added to, while it's the last thing drawn.
    let run = null;
    let i = s;
    if (based) {
      for (const r of old) if (r.based && fits(r, s) && (!run || r.kept.length > run.kept.length)) run = r;
      if (run) taken.add(run);
      else {
        run = this.fresh(true);
        budget.left -= this.width * this.height;
      }
      out.push(run);
      i += run.kept.length;
    }
    while (i < e) {
      const piece = old.find((r) => !r.based && r.kept.length && r.kept[0].layer === layers[i] && fits(r, i));
      if (piece) {
        taken.add(piece);
        i += piece.kept.length;
        if (!run) {
          run = piece;
          out.push(piece);
          continue;
        }
        this.show(run.ctx, piece);
        run.kept.push(...piece.kept);
        if (piece.box) this.grow(run, piece.box);
        this.spare.push(piece.canvas);
      } else if (budget.left > 0) {
        if (!run) {
          run = this.fresh(false);
          out.push(run);
        }
        budget.left -= layers[i].canvas.width * layers[i].canvas.height;
        this.add(run, layers[i++]);
      } else {
        out.push(layers[i++]);
        run = null;
      }
    }
    return out;
  }

  // Draws the pile onto ctx; with clip ([x0, y0, x1, y1] in ctx's own pixels), only inside it.
  draw(ctx, layers, live, clip = null) {
    const items = this.order(layers, live);
    const flat = items.map((it) => it.layer);
    const old = this.runs;
    const taken = new Set();
    // About a canvas's worth of layers can go into pictures each frame.
    const budget = { left: this.width * this.height };
    const plan = [];
    const n = items.length;
    let i = 0;
    while (i < n || !plan.length) {
      if (i < n && plan.length && items[i].live) {
        plan.push(items[i++].layer);
        continue;
      }
      let j = i;
      while (j < n && !items[j].live) j++;
      plan.push(...this.segment(flat, i, j, !plan.length, old, taken, budget));
      i = j;
    }
    const runs = plan.filter((p) => p.kept);
    // Pictures nobody needs any more are kept blank for next time (a couple of them).
    for (const r of old) if (!runs.includes(r) && !taken.has(r)) this.spare.push(r.canvas);
    this.spare.length = Math.min(this.spare.length, 2);
    this.runs = runs;
    if (clip) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.beginPath();
      ctx.rect(clip[0], clip[1], clip[2] - clip[0], clip[3] - clip[1]);
      ctx.clip();
      ctx.setTransform(this.k, 0, 0, this.k, 0, 0);
    }
    for (const p of plan) {
      if (p.kept) this.show(ctx, p, clip);
      else this.put(ctx, p);
    }
    if (clip) ctx.restore();
  }
}

// How many strips of the lake (two pixels high each) one frame paints again, at most: about a third of the lake.
const LAKE_STRIPS = 64;

// How many more splats a wet splat takes in before it's full: after that, the next one to hit it is a splat of its own,
// so paint fired at one spot doesn't all run into one big muddy splat.
export const MAX_HITS = 12;
// And the painter says what a splat's paints made at most once a second, so the lines can be read.
const MIX_LINE_GAP = 1000;

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
    this.stack = new Stack(this.k, canvas.width, canvas.height, (c) => c.drawImage(this.paper, 0, 0, W, H));
    this.weave = this.ctx.createPattern(this.makeWeave(), 'repeat');
    this.number = 0;
    // Where strokes have gone on the layers since the canvas was last drawn, as [x0, y0, x1, y1].
    this.painted = [];
    this.lakeDue = new Map();
    this.lakeNext = 0;
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
      // A phone short of memory can throw away a hidden page's canvases: back on screen, it all comes from the layers.
      if (!document.hidden) this.redrawAll();
    });
    canvas.addEventListener('contextrestored', () => this.redrawAll());
    this.redrawAll();
  }

  // The next frame draws the whole canvas again, and the lake and the ready-made pictures with it.
  redrawAll() {
    this.whole = true;
    this.stack.runs = [];
    if (this.reflStack) this.reflStack.runs = [];
    if (this.water) this.reflDirty = true;
    if (this.elements.length) this.kick();
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
    this.reflStack = new Stack(this.k, this.refl.width, this.refl.height, (c) => c.drawImage(this.paper, 0, 0, W, H));
    this.reflDirty = true;
    // The lake, painted from the reflection whenever that changes, into a layer of its own that starts on a whole pixel
    // of the canvas, so it lands on the canvas exactly as if it had been painted there.
    const top = Math.floor(this.hy * this.k);
    const water = document.createElement('canvas');
    water.width = this.canvas.width;
    water.height = Math.max(1, this.canvas.height - top);
    this.water = { kind: 'water', canvas: water, ctx: water.getContext('2d'), top, bbox: { x: 0, y: top / this.k, w: W, h: water.height / this.k } };
    this.waterTex = this.makeWaterTexture();
    // The lake is the reflection in strips two pixels high, each one nudged sideways by the ripples (and stretched a
    // little, so the nudge never shows an edge); sy is the row of the reflection it shows.
    this.strips = [];
    for (let y = this.hy; y < H; y += 2) {
      const d = y - this.hy;
      const amp = 0.4 + d * 0.012;
      this.strips.push({ y, sy: clamp(this.hy - d - 2, 0, this.refl.height / this.k - 2), off: Math.sin(d * 0.23) * amp + Math.sin(d * 0.071 + 1.3) * amp * 0.7 });
    }
    // The strips due to be painted again, and from where to where across.
    this.lakeDue = new Map();
    this.lakeNext = 0;
    this.number += 1;
    this.whole = true;
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
  // one of the spots it finds. Between from and to of the way down from the horizon (0) to the bottom (1), when given;
  // otherwise anywhere but the strip along the horizon.
  findLand(from = 0.08, to = null) {
    const y0 = this.hy + (H - this.hy) * from;
    const y1 = to === null ? H * 0.97 : this.hy + (H - this.hy) * to;
    for (let i = 0; i < 80; i++) {
      const x = rand(W * 0.03, W * 0.97);
      const y = rand(y0, y1);
      if (this.isLand(x, y)) return { x, y };
    }
    const mw = this.mask.width;
    const top = Math.ceil(y0 / 4);
    const rows = Math.floor(y1 / 4) - top;
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

  // A spot on open water in the middle of the lake, down to `to` of the way from the horizon (0) to the bottom (1).
  findWater(to = 0.8) {
    for (let i = 0; i < 60; i++) {
      const x = rand(W * 0.3, W * 0.7);
      const y = rand(this.hy + (H - this.hy) * 0.1, this.hy + (H - this.hy) * to);
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
    if (spec.reflect) this.dirtyReflection(b);
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
    if (target.reflect) this.dirtyReflection(target.bbox);
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

  // A splat hits the canvas. If it lands in paint that's still wet, the two run together, unless that paint is full.
  land(sp, delay) {
    sp.gen = this.gen;
    sp.landed = performance.now();
    const wet = this.splats.find(
      (s) =>
        s.state === 'wet' &&
        s.gen === this.gen &&
        (s.merged?.length || 0) < MAX_HITS &&
        Math.hypot(s.x - sp.x, s.y - sp.y) < (s.R * s.stretch + sp.R * sp.stretch) * 0.7,
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
    a.mixSay = () => {
      if (names.length > 1) this.hooks.onNarrate?.({ line: mixLine(names, colorName(rgb), still ? main.name : undefined), info: '', kind: 'merge' });
      else this.say('merge', 'merge');
    };
    this.sayMix(a, t0);
    this.kick();
  }

  // What a splat's paints made, said at once, or, if the painter spoke about this splat less than a second ago, once the
  // second is up and only if it's still wet then (so the line is about the paints as they are by then).
  sayMix(a, now) {
    const wait = (a.mixSaidAt ?? -Infinity) + MIX_LINE_GAP - now;
    if (wait <= 0) {
      a.mixSaidAt = now;
      a.mixSay();
      return;
    }
    if (a.mixTimer) return;
    a.mixTimer = setTimeout(() => {
      a.mixTimer = 0;
      if (a.state === 'wet' && a.gen === this.gen) this.sayMix(a, performance.now());
    }, wait);
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
      const ids = PIGMENTS.map((p) => p.id);
      if (spot) return this.addSplat({ ...motion, pigment: opts.pigment ?? moodPaint(ids, this.scheme, TREES.has(t.kind) || t.kind === 'cabin'), ...spot, auto: true });
    }

    const fits = opts.pigment ? fitsFor(opts.pigment) : null;
    let hint = opts.hint ?? this.pickHint(fits, opts.pigment);
    // The cabin, if there is one, with paint for something it hasn't had yet: snow on the roof, its lights, a garden.
    if (hint === 'onCabin') {
      const cabin = this.elements.find((e) => e.kind === 'cabin');
      if (cabin) return this.addSplat({ ...motion, pigment: opts.pigment ?? this.paintForCabin(cabin), ...this.spotOn(cabin), auto: true });
      hint = 'cloud';
    }
    // A cabin is painted from a round splat, not a flung one.
    if (hint === 'cabin') motion.vx = motion.vy = 0;
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
    // In a mood with no snow, white that would land on a tree (the top of a tall pine, up in the sky), the cabin or the
    // ground would only bring snow, so the accident picks another paint.
    const noWhite = TREE_AIMS.has(hint) || (!opts.pigment && !this.scheme.snow && this.onTreeOrGround({ ...spot, ...(hint === opts.hint ? opts.spot : null) }));
    const pigment = opts.pigment ?? paintFor(hint, this.scheme, noWhite);
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

  // Whether paint at this spot would land on a tree, the cabin or the ground.
  onTreeOrGround({ x, y, R }) {
    const hit = this.elementAt(x, y, R);
    return TREES.has(hit?.kind) || hit?.kind === 'cabin' || (y > this.hy && this.isLand(x, Math.min(H - 4, y + R * 0.3)));
  }

  // What the cabin hasn't had yet, and a paint that gives it: snow on the roof (white, in a mood with snow), its lights
  // (warm paint), or once they're on, a garden (in a paint that makes bright flowers). With a paint loaded, only what
  // that paint can give: snow on the roof needs white, so the cabin isn't aimed at for it again and again in vain.
  cabinLeft(t, pigment = null) {
    const left = [];
    if (this.scheme.snow && !t.touched?.has('snow') && (!pigment || pigment.family === 'white')) left.push(['titanium-white']);
    if (!t.meta.glow) left.push(['cadmium-yellow', 'indian-yellow', 'bright-red']);
    else if (!t.touched?.has('garden')) left.push(['bright-red', 'cadmium-yellow', 'phthalo-blue']);
    return left;
  }

  paintForCabin(t) {
    const left = this.cabinLeft(t);
    return moodPaint(left.length ? pick(left) : PIGMENTS.map((p) => p.id), this.scheme);
  }

  pickHint(fits, pigment = null) {
    const c = (k) => this.count(k);
    const land = this.findLand() !== null;
    const { night } = this.scheme;
    const cabin = this.elements.find((e) => e.kind === 'cabin');
    const ok = ([hint]) => !fits || fits.includes(hint);
    return weighted([
      ['cloud', c('cloud') < 3 ? 2.2 : 0.7],
      ['mountain', c('mountain') === 0 ? 3.5 : c('mountain') < 3 ? 1.1 : 0],
      ['sun', this.has('sun') || this.has('moon') ? 0 : 0.7],
      ['birds', c('birds') < MAX_FLOCKS ? 0.45 : 0],
      ['treeline', c('treeline') < 2 ? 1.3 : 0.25],
      ['bank', c('bank') < 2 ? 2.8 : c('bank') < 4 ? 1 : 0.25],
      ['tree', land ? 3.2 + c('bank') * 0.3 : 0],
      ['cabin', land && !this.has('cabin') ? 0.5 : 0],
      ['onCabin', cabin?.meta && this.cabinLeft(cabin, pigment).length ? 0.8 : 0],
      ['water', 0.6],
      ['rock', c('rock') < 3 ? 0.35 : 0],
      ['island', c('island') < 2 ? 0.3 : 0],
      ['stars', night && c('stars') < 3 ? 0.5 : 0],
      ['aurora', night && !this.has('aurora') ? 0.6 : 0],
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
      case 'tree': {
        const p = this.findLand();
        return p && { ...p, R: rand(20, 46) };
      }
      case 'cabin': {
        // On land where a cabin fits (not right up front, where it would be huge), clear of the trees if it can be.
        let p = null;
        for (let i = 0; i < 12 && !p; i++) {
          const q = this.findLand(0.1, 0.52);
          if (!q) break;
          const there = this.elementAt(q.x, q.y, 20);
          if (!there || !REACTIVE.has(there.kind) || i === 11) p = q;
        }
        return p && { ...p, R: rand(18, 32) };
      }
      case 'water': {
        const p = this.findWater();
        return p && { ...p, R: rand(12, 30) };
      }
      case 'rock': {
        const p = this.findWater(0.72);
        return p && { ...p, R: rand(10, 18) };
      }
      case 'island': {
        const p = this.findWater(0.6);
        return p && { ...p, R: rand(30, 44) };
      }
      case 'stars':
        return { x: rand(W * 0.08, W * 0.92), y: rand(0.06, 0.4) * hy, R: rand(10, 13) };
      case 'aurora':
        return { x: rand(W * 0.15, W * 0.85), y: rand(0.15, 0.5) * hy, R: rand(28, 42) };
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
    return this.active.length > 0 || this.lakeDue.size > 0 || this.splats.some((s) => s.state === 'wet' || s.state === 'absorbing');
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
      // Where this frame's strokes went: a step can say (the sky's wash goes on a row at a time); otherwise anywhere on
      // the layer.
      let box = null;
      while (el.i < target) {
        const op = el.ops[el.i++];
        op(el.ctx);
        const b = op.box ?? el.bbox;
        box = box ? [Math.min(box[0], b.x), Math.min(box[1], b.y), Math.max(box[2], b.x + b.w), Math.max(box[3], b.y + b.h)] : [b.x, b.y, b.x + b.w, b.y + b.h];
      }
      if (box) {
        const b = el.bbox;
        box = [Math.max(box[0], b.x), Math.max(box[1], b.y), Math.min(box[2], b.x + b.w), Math.min(box[3], b.y + b.h)];
        this.painted.push(box);
        if (el.reflect && el.depth <= 0.5) this.dirtyReflection({ x: box[0], y: box[1], w: box[2] - box[0], h: box[3] - box[1] });
      }
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

    const animating = this.active.length || this.pool || this.lakeDue.size || this.splats.some((s) => now - s.born < 240 || s.tintT0 || s.state === 'fading' || s.state === 'absorbing');
    if (animating) requestAnimationFrame(this.frame);
    else {
      this.running = false;
      this.lastFrame = null;
    }
  }

  // Part of the reflection needs painting again (the whole of it, once reflDirty is true).
  dirtyReflection(b) {
    if (this.reflDirty === true) return;
    const r = this.reflDirty || [Infinity, Infinity, -Infinity, -Infinity];
    this.reflDirty = [Math.min(r[0], b.x), Math.min(r[1], b.y), Math.max(r[2], b.x + b.w), Math.max(r[3], b.y + b.h)];
  }

  // The reflection is everything above the horizon that reflects; live is the layers still being painted. Only the
  // part that changed is painted again, and the strips of the lake that mirror it are due to be painted again too.
  buildReflection(live) {
    const { k } = this;
    const part = this.reflDirty === true ? [0, 0, W, H] : this.reflDirty;
    this.reflDirty = false;
    const r = this.rctx;
    r.setTransform(k, 0, 0, k, 0, 0);
    const clip = [Math.floor(part[0] * k) - 1, Math.floor(part[1] * k) - 1, Math.ceil(part[2] * k) + 1, Math.ceil(part[3] * k) + 1];
    this.reflStack.draw(r, this.elements.filter((el) => el.reflect && el.depth <= 0.5), (el) => live.has(el.canvas), clip);
    // A strip can be moved and stretched up to about 30 px sideways.
    this.strips.forEach((st, i) => {
      if (st.sy >= part[3] + 1 || st.sy + 2 <= part[1] - 1) return;
      const due = this.lakeDue.get(i);
      this.lakeDue.set(i, due ? [Math.min(due[0], part[0] - 30), Math.max(due[1], part[2] + 30)] : [part[0] - 30, part[2] + 30]);
    });
  }

  // Paints the next strips of the lake that are due: up to LAKE_STRIPS of them in a row, so a change across the whole
  // sky reaches the lake over a few frames instead of holding one up. It goes down the lake from where the last frame
  // stopped, and back to the horizon at the bottom, so strips far from the horizon get their turn even while something
  // near it keeps changing. Returns the part of the canvas painted again, or null.
  paintLake() {
    const { hy, k } = this;
    let first = Infinity;
    let nearest = Infinity;
    for (const i of this.lakeDue.keys()) {
      nearest = Math.min(nearest, i);
      if (i >= this.lakeNext) first = Math.min(first, i);
    }
    if (first === Infinity) first = nearest;
    let last = first;
    let [left, right] = this.lakeDue.get(first);
    while (last - first + 1 < LAKE_STRIPS && this.lakeDue.has(last + 1)) {
      last += 1;
      const [l, r] = this.lakeDue.get(last);
      left = Math.min(left, l);
      right = Math.max(right, r);
    }
    for (let i = first; i <= last; i++) this.lakeDue.delete(i);
    this.lakeNext = last + 1;
    const top = this.water.top;
    const cw = this.water.canvas.width;
    const ch = this.water.canvas.height;
    const x0 = clamp(Math.floor(left * k), 0, cw);
    const x1 = clamp(Math.ceil(right * k), 0, cw);
    const y0 = clamp(Math.floor((this.strips[first].y - 1) * k) - top, 0, ch);
    const y1 = clamp(Math.ceil((this.strips[last].y + 4) * k) - top, 0, ch);
    if (x1 <= x0 || y1 <= y0) return null;
    const ctx = this.water.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(x0, y0, x1 - x0, y1 - y0);
    ctx.beginPath();
    ctx.rect(x0, y0, x1 - x0, y1 - y0);
    ctx.clip();
    ctx.setTransform(k, 0, 0, k, 0, -top);
    // Every strip that reaches into that part, not only the due ones, so the part is whole.
    const lo = (y0 + top) / k;
    const hi = (y1 + top) / k;
    const src = this.refl;
    for (const { y, sy, off } of this.strips) {
      if (y + 2.3 < lo - 1 || y > hi + 1) continue;
      ctx.drawImage(src, 0, sy * k, W * k, 2 * k, off - 8, y, W + 16, 2.3);
    }
    // Then the water's own color and lines over it.
    const g = ctx.createLinearGradient(0, hy, 0, H);
    g.addColorStop(0, rgba(this.scheme.water, 0.12));
    g.addColorStop(1, rgba(this.scheme.water, 0.5));
    ctx.fillStyle = g;
    ctx.fillRect(0, hy, W, H - hy);
    ctx.drawImage(this.waterTex, 0, hy, W, H - hy);
    ctx.restore();
    return [x0 / k, (y0 + top) / k, x1 / k, (y1 + top) / k];
  }

  // Where each splat, droplet and trail is drawn, as [x0, y0, x1, y1] (with room for a splat's pop as it lands).
  splatBoxes() {
    const out = [];
    const add = (x, y, r) => out.push([x - r, y - r, x + r, y + r]);
    for (const s of this.pool ? [...this.splats, this.pool] : this.splats) {
      add(s.x, s.y, s.ext * 1.25 + 2);
      for (const d of s.trail || []) add(d.x, d.y, d.r + 2);
    }
    for (const d of this.drops) add(d.x, d.y, d.r + 2);
    return out;
  }

  // What needs drawing again since the last frame: where strokes went on the layers, the part of the lake painted
  // again, and the splats where they are now and where they were. All of it (null) when the pile of layers has
  // changed other than by new layers coming in (new ones are blank): one taken away or moved, or a new canvas.
  changed(layers, lake, shown) {
    const before = this.drawn ?? [];
    let j = 0;
    let moved = false;
    for (const l of layers) {
      if (j < before.length && before[j].layer === l) moved ||= before[j++].bbox !== l.bbox;
    }
    this.drawn = layers.map((layer) => ({ layer, bbox: layer.bbox }));
    if (this.whole || moved || j < before.length) return null;
    const boxes = [...shown, ...(this.shown ?? [])];
    if (lake) boxes.push(lake);
    boxes.push(...this.painted);
    if (!boxes.length) return [];
    return boxes.reduce((a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
  }

  // Draws the canvas: only the part that changed since the last frame, from the stack's ready-made pictures and the
  // layers still being painted; the rest of the canvas is already right.
  render(now, opts = {}) {
    const { ctx, k } = this;
    const live = new Set(this.active.map((a) => a.canvas));
    if (this.reflDirty) this.buildReflection(live);
    const lake = this.lakeDue.size ? this.paintLake() : null;
    // The lake goes in between what's above the horizon and what's on it or in front of it.
    const layers = [];
    let water = false;
    for (const el of this.elements) {
      if (!water && el.depth >= 0) {
        layers.push(this.water);
        water = true;
      }
      layers.push(el);
    }
    if (!water) layers.push(this.water);
    const shown = opts.splats === false ? [] : this.splatBoxes();
    const area = this.changed(layers, lake, shown);
    this.whole = false;
    this.shown = shown;
    this.painted = [];
    let clip = null;
    if (area) {
      if (!area.length) return;
      clip = [Math.floor(area[0] * k) - 2, Math.floor(area[1] * k) - 2, Math.ceil(area[2] * k) + 2, Math.ceil(area[3] * k) + 2];
      clip = [Math.max(0, clip[0]), Math.max(0, clip[1]), Math.min(this.canvas.width, clip[2]), Math.min(this.canvas.height, clip[3])];
      if (clip[2] <= clip[0] || clip[3] <= clip[1]) return;
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (clip) {
      ctx.beginPath();
      ctx.rect(clip[0], clip[1], clip[2] - clip[0], clip[3] - clip[1]);
      ctx.clip();
    }
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    // The lake is drawn from its own layer every frame, so painting it again never breaks up the pictures around it.
    this.stack.draw(ctx, layers, (l) => l === this.water || live.has(l.canvas), clip);

    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = this.weave;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    if (opts.splats !== false) {
      for (const s of this.splats) this.drawSplat(ctx, s, now);
      if (this.pool) this.drawSplat(ctx, this.pool, now);
      for (const d of this.drops) {
        ctx.fillStyle = rgba(d.color);
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
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
