import { Studio } from './studio.js';
import { PIGMENTS } from './schemes.js';
import { makeTitle, featureLine, madeFrom, line, keptNote } from './words.js';
import { pick, rand, gauss } from './util.js';
import * as sound from './sound.js';
import { guardEdges } from './edge-guard.js';

const $ = (id) => document.getElementById(id);

// Browser storage can be missing or throw (private windows, sandboxed frames), so every access is guarded.
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
};
const KEY = {
  brush: 'happy-accidents:brush',
  name: 'happy-accidents:artist',
  sound: 'happy-accidents:sound',
  gallery: 'happy-accidents:gallery',
  canvases: 'happy-accidents:canvases',
};

const canvas = $('canvas');
const stage = $('stage');
const easel = $('easel');
const lineEl = $('line');
const toolEl = $('tool');
const hintEl = $('hint');
const inFrame = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

// When the page runs inside the claude.ai artifact viewer, saving a file goes through the
// viewer's downloads capability; elsewhere a plain browser download does the job.
let downloads = null;
window.claude?.use?.('downloads').then(
  (d) => {
    downloads = d;
  },
  () => {},
);

function dataUrlBytes(url) {
  const bin = atob(url.slice(url.indexOf(',') + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ——— narration ———

let lineTimer = 0;
function narrate({ line: text, info }) {
  if (!text) return;
  lineEl.classList.add('swap');
  clearTimeout(lineTimer);
  lineTimer = setTimeout(() => {
    lineEl.textContent = text;
    toolEl.textContent = info || '';
    lineEl.classList.remove('swap');
  }, 180);
}

// ——— the studio ———

const bigScreen = Math.min(window.innerWidth, window.innerHeight) >= 600;
const scale = (window.devicePixelRatio || 1) >= 1.5 && bigScreen ? 1.5 : 1;
const studio = new Studio(canvas, {
  scale,
  onNarrate: narrate,
  onCanvas(s) {
    store.set(KEY.canvases, s.number);
    $('canvasNo').textContent = `Canvas No. ${s.number}`;
    $('schemeName').textContent = s.scheme.name;
  },
  onSplat(sp) {
    sound.splat(sp.R);
  },
  onBrush(kind, ms) {
    sound.brush(kind, ms);
  },
});

// ——— fitting the canvas to the screen ———

const wide = window.matchMedia('(min-width: 960px), (orientation: landscape) and (max-height: 600px)');
function fit() {
  if (!wide.matches) {
    easel.style.width = '';
    return;
  }
  const r = stage.getBoundingClientRect();
  const cs = getComputedStyle(stage);
  const availW = r.width - 12;
  const availH = r.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 14;
  const w = Math.max(260, Math.floor(Math.min(availW, (availH * 4) / 3)));
  easel.style.width = `${w}px`;
}
new ResizeObserver(fit).observe(stage);
wide.addEventListener?.('change', fit);
fit();

// ——— the palette ———

const OPTIONS = [{ id: 'surprise', name: 'Surprise me', hex: null }, ...PIGMENTS];
let loaded = store.get(KEY.brush, 'surprise');
if (!OPTIONS.some((o) => o.id === loaded)) loaded = 'surprise';

const paletteEl = $('palette');
const dabs = OPTIONS.map((o) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = o.id === 'surprise' ? 'dab surprise' : 'dab';
  b.setAttribute('role', 'radio');
  b.setAttribute('aria-label', o.name);
  b.title = o.code ? `${o.name} · ${o.code}` : o.name;
  if (o.hex) b.style.setProperty('--c', o.hex);
  b.dataset.id = o.id;
  b.addEventListener('click', () => {
    load(o.id, true);
    studio.keepWet();
  });
  b.addEventListener('keydown', (e) => {
    const i = OPTIONS.indexOf(o);
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = OPTIONS[(i + 1) % OPTIONS.length];
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = OPTIONS[(i - 1 + OPTIONS.length) % OPTIONS.length];
    if (next) {
      e.preventDefault();
      load(next.id, true);
      studio.keepWet();
    }
  });
  paletteEl.appendChild(b);
  return b;
});

function load(id, focus = false) {
  loaded = id;
  store.set(KEY.brush, id);
  const o = OPTIONS.find((p) => p.id === id);
  $('loadedName').textContent = id === 'surprise' ? 'Surprise me · new paint every splat' : o.code ? `${o.name} · ${o.code}` : o.name;
  for (const d of dabs) {
    const on = d.dataset.id === id;
    d.setAttribute('aria-checked', String(on));
    d.tabIndex = on ? 0 : -1;
    if (on && focus) d.focus();
  }
}
load(loaded);

const currentPigment = () => (loaded === 'surprise' ? pick(PIGMENTS) : PIGMENTS.find((p) => p.id === loaded));
// For accidents you didn't make: a loaded paint is used as is; on Surprise me, the accident picks a paint that suits it.
const accidentPigment = () => (loaded === 'surprise' ? undefined : currentPigment());

// ——— intro demo and first-time hint ———

let demoTimers = [];
let acted = false;
function userActed() {
  if (acted) return;
  acted = true;
  demoTimers.forEach(clearTimeout);
  demoTimers = [];
  hintEl.classList.add('gone');
}

// A mountain, a near bank (in the lower half of the lake, so it's big enough for the tree to find) and a tree on it.
// The first-time hint stays out of the way until the demo is over, then comes up with the painter's "Your turn".
function runDemo() {
  const steps = [
    ['mountain', 2100],
    ['bank', 4000, () => ({ y: studio.hy + (studio.H - studio.hy) * rand(0.5, 0.8) })],
    ['tree', 5800],
  ];
  for (const [hint, at, spot] of steps) demoTimers.push(setTimeout(() => studio.randomAccident({ hint, delay: 400, spot: spot?.() }), at));
  demoTimers.push(
    setTimeout(() => {
      narrate({ line: line('invite'), info: '' });
      hintEl.classList.remove('gone');
    }, 8600),
  );
}

// ——— painting with the pointer ———

let gesture = null;

function toCanvas(e) {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * studio.W, y: ((e.clientY - r.top) / r.height) * studio.H, t: e.timeStamp };
}

canvas.addEventListener('pointerdown', (e) => {
  // One finger paints at a time: another finger that comes down meanwhile is ignored, so it can't take over the first
  // one's paint or move its puddle.
  if (gesture) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  e.preventDefault();
  canvas.setPointerCapture?.(e.pointerId);
  userActed();
  cancelDone();
  const p = toCanvas(e);
  const pigment = currentPigment();
  gesture = { id: e.pointerId, start: p, cx: e.clientX, cy: e.clientY, pts: [p], moved: 0, pigment, drops: [] };
  gesture.poolTimer = setTimeout(() => {
    if (gesture && gesture.moved < 10) studio.startPool(gesture.start, gesture.pigment);
  }, 220);
});

canvas.addEventListener('pointermove', (e) => {
  if (!gesture || e.pointerId !== gesture.id) return;
  const p = toCanvas(e);
  gesture.moved = Math.max(gesture.moved, Math.hypot(e.clientX - gesture.cx, e.clientY - gesture.cy));
  const last = gesture.pts[gesture.pts.length - 1];
  gesture.pts.push(p);
  if (gesture.pts.length > 24) gesture.pts.shift();
  if (gesture.moved >= 10 && studio.pool) studio.endPool();
  // Paint flying off a fast brush leaves a trail of droplets.
  const speed = Math.hypot(p.x - last.x, p.y - last.y) / Math.max(1, p.t - last.t);
  if (gesture.moved >= 10 && speed > 1 && gesture.drops.length < 40 && Math.random() < 0.45) {
    const d = { x: p.x + gauss() * 5, y: p.y + gauss() * 5, r: rand(1, 3.4) };
    gesture.drops.push(d);
    studio.addDrop(d, gesture.pigment);
  }
});

function finishGesture(e, cancelled = false) {
  if (!gesture || e.pointerId !== gesture.id) return;
  const g = gesture;
  gesture = null;
  clearTimeout(g.poolTimer);
  studio.takeDrops();
  if (cancelled) {
    studio.endPool();
    return;
  }
  const p = toCanvas(e);
  if (studio.pool) {
    studio.commitPool();
    return;
  }
  if (g.moved >= 10) {
    // Velocity over roughly the last 60ms of the drag.
    let q = g.pts[0];
    for (let i = g.pts.length - 1; i >= 0; i--) {
      q = g.pts[i];
      if (p.t - q.t > 60) break;
    }
    const dt = Math.max(8, p.t - q.t);
    const vx = (p.x - q.x) / dt;
    const vy = (p.y - q.y) / dt;
    const speed = Math.hypot(vx, vy);
    const R = Math.min(64, Math.max(14, 16 + speed * 9 + rand(-3, 3)));
    studio.addSplat({ x: p.x, y: p.y, vx, vy, R, pigment: g.pigment, trail: g.drops });
  } else {
    studio.addSplat({ x: p.x, y: p.y, R: rand(11, 22), pigment: g.pigment });
  }
}

canvas.addEventListener('pointerup', (e) => finishGesture(e));
canvas.addEventListener('pointercancel', (e) => finishGesture(e, true));
// The canvas lets go of a pointer right after its pointerup. If it loses hold of one with no pointerup, the gesture ends
// there, so it can't keep the next one from painting.
canvas.addEventListener('lostpointercapture', (e) => finishGesture(e, true));
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
// A flick near the screen's side can set off Android's back gesture (or Chrome's swipe to go back), which takes the
// touch (pointercancel) and then goes Back, leaving the studio and the painting on the easel. A Back that comes while a
// finger is on the canvas, or within a second of the canvas's touch being taken, is a slip, and the painting stays as
// it was. The guard adds an extra history entry of its own only while a finger is on the canvas and for a second
// after, so at any other time a deliberate Back leaves in one press; the overlays' own steps (see stepOn() below) close
// the overlay on Back as before. Not inside another page's frame, for the same reason as the overlays.
guardEdges({ surfaces: [canvas], history: !inFrame });

// ——— actions ———

function oops() {
  userActed();
  cancelDone();
  studio.randomAccident({ pigment: accidentPigment() });
}

// True from Sign it in the sign form until the label is up: the signature is going on and the painting is about to
// be framed, so starting over, signing again, letting more accidents happen or opening the wall waits until then.
// (From the wall, Paint another on an older painting would start over under the signature, and it would never finish.)
let signing = false;

// Let it happen counts the accidents it makes itself, from wherever the canvas was when it started: on a fresh canvas
// it stops at 24 in all, and on a busy one (your own splats count too) it still adds at least 8.
let autoTimer = null;
let autoStart = 0;
const autoBtn = $('autoBtn');
function setAuto(on) {
  if (on && signing) return;
  clearTimeout(autoTimer);
  autoTimer = null;
  autoBtn.setAttribute('aria-pressed', String(on));
  autoBtn.textContent = on ? 'Stop' : 'Let it happen';
  if (on) {
    cancelDone();
    autoStart = studio.accidents;
    userActed();
    tickAuto(250);
  }
}
function tickAuto(delay) {
  autoTimer = setTimeout(() => {
    if (studio.accidents - autoStart >= Math.max(8, 24 - autoStart)) {
      setAuto(false);
      sayDone();
      return;
    }
    if (studio.active.length < 2) studio.randomAccident({ pigment: accidentPigment() });
    tickAuto(rand(1300, 2400));
  }, delay);
}

// When Let it happen has made its last accident, the painter says it might be done once everything has been painted
// in (or after 15 seconds at most), so the line isn't talked over by the last few splats. New canvas, Let it happen
// again, Sign it or another splat in the meantime calls it off.
let doneTimer = null;
function sayDone(gen = studio.gen, until = Date.now() + 15000) {
  doneTimer = setTimeout(() => {
    doneTimer = null;
    if (studio.gen !== gen) return;
    if (studio.busy && Date.now() < until) sayDone(gen, until);
    else narrate({ line: line('done'), info: '' });
  }, 200);
}
function cancelDone() {
  clearTimeout(doneTimer);
  doneTimer = null;
}

// A button that starts over asks first when there's paint that isn't on the gallery wall (all of it on an unsigned
// canvas, or whatever was added since signing): the first tap turns it into "Start over?" for three seconds, and only
// a tap on that goes ahead. Returns true when it's fine to start over.
const armed = new Map();
function disarm(btn, label) {
  clearTimeout(armed.get(btn));
  armed.delete(btn);
  btn.textContent = label;
}
function askFirst(btn, label) {
  const unsaved = studio.accidents > (studio.signed?.accidents ?? 0);
  if (unsaved && !armed.has(btn)) {
    btn.textContent = 'Start over?';
    armed.set(btn, setTimeout(() => disarm(btn, label), 3000));
    return false;
  }
  disarm(btn, label);
  return true;
}

const newBtn = $('newBtn');
function newCanvas() {
  if (signing || !askFirst(newBtn, 'New canvas')) return;
  setAuto(false);
  cancelDone();
  userActed();
  studio.newCanvas();
}

const soundBtn = $('soundBtn');
function setSound(on) {
  sound.setSound(on);
  store.set(KEY.sound, on);
  soundBtn.setAttribute('aria-pressed', String(on));
  // Reads as how things are now (a button saying just "Sound off" could be what it does), with aria-pressed to match.
  soundBtn.textContent = on ? 'Sound: on' : 'Sound: off';
}

$('oopsBtn').addEventListener('click', oops);
autoBtn.addEventListener('click', () => setAuto(!autoTimer));
newBtn.addEventListener('click', newCanvas);
$('signBtn').addEventListener('click', openSign);
$('galleryBtn').addEventListener('click', openGallery);
soundBtn.addEventListener('click', () => setSound(!sound.soundOn()));

// ——— overlays ———

// While an overlay is up, the page behind it is inert, so Tab, taps and screen readers stay in the overlay.
// One overlay can take over from another (the label once the signature is on, a painting opened from the wall);
// when the last one closes, focus goes back to whatever opened the first.
const app = $('app');
const overlays = [$('signSheet'), $('placard'), $('gallery')];
let returnFocus = null;
function openOverlay(el, focusEl) {
  returnFocus ??= document.activeElement;
  for (const o of overlays) o.hidden = o !== el;
  app.inert = true;
  stepOn();
  // Without scrolling: an overlay taller than the screen (the label, on a phone held sideways) opens at its top, showing
  // the painting, not scrolled down to the button that has focus.
  (focusEl || el.querySelector('button, input'))?.focus({ preventScroll: true });
}
function closeOverlay(el, focusEl = returnFocus) {
  el.hidden = true;
  app.inert = false;
  returnFocus = null;
  stepOff();
  focusEl?.focus?.();
}
// Escape, a tap outside and the phone's Back close the overlay on top; the label goes through leavePlacard().
function dismiss(el) {
  if (el === $('placard')) leavePlacard();
  else closeOverlay(el);
}
for (const o of overlays) {
  o.addEventListener('click', (e) => {
    if (e.target === o) dismiss(o);
  });
}
const openOverlayEl = () => overlays.find((o) => !o.hidden);

// The phone's Back button closes the overlay on top instead of leaving the page. Opening one adds a step to the history
// (one taking over from another keeps it), and closing it with a button, Escape or a tap outside takes the step off
// again. Going back is asynchronous, so until that lands, an overlay opened meanwhile waits for its own step.
// Not inside another page's frame (the claude.ai viewer): going back from there moves that whole page back.
const STEP = 'happy-accidents:overlay';
const onStep = () => history.state?.[STEP] === true;
let steppingOff = false;
function stepOn() {
  if (inFrame || steppingOff || onStep()) return;
  try {
    history.pushState({ [STEP]: true }, '');
  } catch {
    /* a frame that can't keep history: Back just leaves */
  }
}
function stepOff() {
  if (steppingOff || !onStep()) return;
  steppingOff = true;
  history.back();
}
window.addEventListener('popstate', () => {
  if (steppingOff) {
    steppingOff = false;
    if (openOverlayEl()) stepOn();
    return;
  }
  const open = openOverlayEl();
  if (open) dismiss(open);
});

// ——— signing ———

const artistName = $('artistName');
const artTitle = $('artTitle');

function openSign() {
  if (signing) return;
  setAuto(false);
  cancelDone();
  userActed();
  // Signed already, with nothing added since: its label comes up again instead of a second copy going on the wall.
  const done = studio.signed;
  const hung = done?.id && done.accidents === studio.accidents && readGallery().find((r) => r.id === done.id);
  if (hung) {
    showPlacard(hung, done.full);
    return;
  }
  const saved = store.get(KEY.name, '');
  artistName.value = typeof saved === 'string' ? saved : '';
  artTitle.value = makeTitle(studio.counts, studio.scheme.id);
  openOverlay($('signSheet'), artistName.value ? artTitle : artistName);
}

// Enter in the name field goes on to the title, the way the keyboard's Next key says; Enter in the title signs.
artistName.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.isComposing) return;
  e.preventDefault();
  artTitle.focus();
});

// The on-screen keyboard. Chrome and Firefox shrink the page for it (interactive-widget=resizes-content in the viewport
// tag), so the overlay's own scrolling keeps Sign it in reach. iOS Safari leaves the page full height under the keyboard,
// so there the sign form's overlay is fitted to what's still showing.
const signSheet = $('signSheet');
function fitSheet() {
  const vv = window.visualViewport;
  const covered = vv && !signSheet.hidden && vv.scale < 1.01 && vv.height < window.innerHeight - 1;
  signSheet.classList.toggle('kb', !!covered);
  signSheet.style.top = covered ? `${vv.offsetTop}px` : '';
  signSheet.style.height = covered ? `${vv.height}px` : '';
}
window.visualViewport?.addEventListener('resize', fitSheet);
window.visualViewport?.addEventListener('scroll', fitSheet);
new MutationObserver(fitSheet).observe(signSheet, { attributes: true, attributeFilter: ['hidden'] });

$('rerollBtn').addEventListener('click', () => {
  artTitle.value = makeTitle(studio.counts, studio.scheme.id);
});
$('cancelSign').addEventListener('click', () => closeOverlay($('signSheet')));

$('signForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (signing) return;
  signing = true;
  try {
    const name = artistName.value.trim() || 'Anonymous';
    const title = artTitle.value.trim() || makeTitle(studio.counts, studio.scheme.id);
    store.set(KEY.name, name);
    // The sheet steps aside so you can watch the signature go on; the label takes over from it after.
    $('signSheet').hidden = true;
    app.inert = false;
    narrate({ line: line('signature'), info: 'Liner brush · Bright Red' });
    await studio.sign(name);
    // Let anything still being painted finish before we frame it. The longest plans (a family of snowy pines in the
    // foreground) take about 12 seconds, so this waits up to 15.
    for (let i = 0; i < 150 && studio.busy; i++) await new Promise((r) => setTimeout(r, 100));
    const s = studio.summary();
    const full = studio.snapshot(studio.W * studio.k, 'image/jpeg', 0.92);
    const record = {
      id: `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`,
      title,
      artist: name,
      year: new Date().getFullYear(),
      date: new Date().toISOString(),
      img: studio.snapshot(720, 'image/jpeg', 0.85),
      accidents: s.accidents,
      seconds: s.seconds,
      scheme: s.scheme.name,
      number: s.number,
      features: featureLine(s.counts),
    };
    const hung = hang(record);
    // What's on the wall from this canvas, and how many accidents it had then (any that landed while it was being
    // signed are in the picture too).
    Object.assign(studio.signed, { id: record.id, full, accidents: s.accidents });
    showPlacard(record, full, 'signing', hung);
  } finally {
    signing = false;
    if (!openOverlayEl()) {
      returnFocus = null;
      stepOff();
    }
  }
});

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'happy-accident';
}

// Where the label on show was opened from: 'signing' right after the signature went on, 'wall' for a painting opened
// on the gallery wall, or null (the painting on the easel, signed earlier). A painting from the wall goes back to the
// wall, where it was scrolled to.
let placardFrom = null;
let wallAt = { scroll: 0, id: null };
// hung is what hang() said, right after a signing.
function showPlacard(record, src, from = null, hung = null) {
  if (!from && !$('gallery').hidden) {
    from = 'wall';
    wallAt = { scroll: $('gallery').scrollTop, id: record.id };
  }
  placardFrom = from;
  $('keepBtn').textContent = from === 'wall' ? 'Back to the wall' : 'Back to the easel';
  const img = $('placardImg');
  img.src = src || record.img;
  img.alt = `${record.title}, a landscape painting by ${record.artist}`;
  $('plArtist').textContent = record.artist;
  $('plTitle').textContent = record.title;
  $('plYear').textContent = record.year;
  $('plNote').textContent = madeFrom(record.accidents, record.seconds);
  $('plFeatures').textContent = record.features;
  $('plCredit').textContent = `Collection of the artist · Canvas No. ${record.number} · ${record.scheme}`;
  const canSave = !inFrame || !!downloads;
  const saveBtn = $('downloadBtn');
  saveBtn.hidden = !canSave;
  saveBtn.textContent = 'Download image';
  saveBtn.onclick = () => saveImage(src || record.img, `${slug(record.title)}.jpg`);
  $('saveHint').hidden = canSave;
  const note = hung ? keptNote(hung, canSave) : '';
  $('keptNote').textContent = note;
  $('keptNote').hidden = !note;
  disarm(anotherBtn, 'Paint another');
  openOverlay($('placard'), anotherBtn);
}

async function saveImage(src, filename) {
  const btn = $('downloadBtn');
  if (downloads) {
    try {
      await downloads.save({ filename, data: dataUrlBytes(src) });
      btn.textContent = 'Saved';
    } catch (err) {
      if (err?.code === 'declined' || err?.code === 'rate_limited') return;
      btn.hidden = true;
      $('saveHint').hidden = false;
    }
    return;
  }
  const a = document.createElement('a');
  a.href = src;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Right after signing nothing is lost, so this starts over at once; on an older painting opened from the wall, the
// easel may hold paint that isn't hung yet, so it asks first, like New canvas.
const anotherBtn = $('anotherBtn');
anotherBtn.addEventListener('click', () => {
  if (!askFirst(anotherBtn, 'Paint another')) return;
  setAuto(false);
  placardFrom = null;
  studio.newCanvas();
  closeOverlay($('placard'), canvas);
});
$('keepBtn').addEventListener('click', leavePlacard);

// Back to the wall for a painting opened there; otherwise back to the easel. Right after a signing, the painter says
// it's up on the wall, so the line from while the signature went on doesn't stay up under a painting already signed.
function leavePlacard() {
  const from = placardFrom;
  placardFrom = null;
  if (from === 'wall') {
    backToWall();
    return;
  }
  closeOverlay($('placard'));
  if (from === 'signing') narrate({ line: line('hung'), info: '' });
}

// ——— the gallery wall ———

function readGallery() {
  const list = store.get(KEY.gallery, []);
  // Every painting this has hung has its picture with it; anything else that got in (a hand edit, a bad write) is skipped.
  return Array.isArray(list) ? list.filter((r) => r && typeof r === 'object' && typeof r.img === 'string') : [];
}

// Hangs a newly signed painting, newest first, keeping the 12 newest. When the browser won't take that many, the
// oldest come down until it does, and when it won't keep any, the wall stays as it was. Says whether the new painting
// was kept, and how many older ones came down beyond the usual 12th.
function hang(record) {
  const list = [record, ...readGallery()].slice(0, 12);
  const room = list.length;
  while (list.length && !store.set(KEY.gallery, list)) list.pop();
  updateCount();
  return { kept: list.length > 0, dropped: list.length ? room - list.length : 0 };
}

function updateCount() {
  const n = readGallery().length;
  $('galleryCount').textContent = n ? String(n) : '';
}

function openGallery() {
  if (signing) return;
  setAuto(false);
  renderWall();
  openOverlay($('gallery'), $('closeGallery'));
  markScrolled();
}

// The wall's heading (with Close) stays at the top as the paintings scroll, and gets a background once they're under it.
const galleryEl = $('gallery');
const markScrolled = () => galleryEl.classList.toggle('scrolled', galleryEl.scrollTop > 4);
galleryEl.addEventListener('scroll', markScrolled, { passive: true });

// The wall takes over from the label again (on the same step in the history), scrolled back to where it was, with
// focus on the painting that was opened.
function backToWall() {
  renderWall();
  const wallEl = $('gallery');
  openOverlay(wallEl, $('closeGallery'));
  wallEl.scrollTop = wallAt.scroll;
  [...$('wallGrid').querySelectorAll('.wall-open')].find((b) => b.dataset.id === wallAt.id)?.focus({ preventScroll: true });
}

function renderWall() {
  const list = readGallery();
  const grid = $('wallGrid');
  grid.replaceChildren();
  $('wallEmpty').hidden = list.length > 0;
  for (const rec of list) {
    const li = document.createElement('li');
    li.className = 'wall-item';
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'wall-open';
    open.setAttribute('aria-label', `Open ${rec.title}`);
    open.dataset.id = rec.id;
    const img = document.createElement('img');
    img.src = rec.img;
    img.alt = '';
    img.loading = 'lazy';
    open.appendChild(img);
    open.addEventListener('click', () => showPlacard(rec));
    const meta = document.createElement('div');
    meta.className = 'wall-meta';
    const p = document.createElement('p');
    const cite = document.createElement('cite');
    cite.textContent = rec.title;
    p.append(cite, `${rec.artist}, ${new Date(rec.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'quiet';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => {
      if (remove.dataset.armed) {
        store.set(
          KEY.gallery,
          readGallery().filter((r) => r.id !== rec.id),
        );
        updateCount();
        renderWall();
        $('closeGallery').focus();
        return;
      }
      remove.dataset.armed = '1';
      remove.textContent = 'Remove it?';
      setTimeout(() => {
        delete remove.dataset.armed;
        remove.textContent = 'Remove';
      }, 3000);
    });
    meta.append(p, remove);
    li.append(open, meta);
    grid.appendChild(li);
  }
}

$('closeGallery').addEventListener('click', () => closeOverlay($('gallery')));

// ——— keyboard ———

// Letter keys, pressed on their own. Shift or Caps Lock doesn't matter: the hints show them as capitals.
const shortcuts = new Map([
  ['a', () => setAuto(!autoTimer)],
  ['s', openSign],
  ['n', newCanvas],
  ['g', openGallery],
  ['m', () => setSound(!sound.soundOn())],
]);

window.addEventListener('keydown', (e) => {
  const open = openOverlayEl();
  if (open) {
    if (e.key === 'Escape') dismiss(open);
    return;
  }
  if (e.target.closest?.('input, textarea')) return;
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    narrate({ line: line('undo'), info: '' });
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const onButton = e.target.closest?.('button');
  const shortcut = shortcuts.get(e.key?.toLowerCase());
  if (e.key === ' ' && !onButton) {
    e.preventDefault();
    oops();
  } else if (e.key === 'Enter' && e.target === canvas) {
    oops();
  } else if (shortcut) {
    // The key does its job and nothing else: S moves focus into the sign form during this keydown,
    // and the browser would then type the "s" into it.
    e.preventDefault();
    shortcut();
  }
});

// ——— start ———

// Keep a copy for painting offline. Not inside the claude.ai viewer or a file opened from disk, where it isn't allowed.
if ('serviceWorker' in navigator && !inFrame && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

window.addEventListener('pointerdown', sound.wake, true);
// By the standard (and in Safari), a touch only lets audio start once the finger lifts, so the very first tap needs this.
window.addEventListener('pointerup', sound.wake, true);
window.addEventListener('keydown', sound.wake, true);

setSound(store.get(KEY.sound, false) === true);
updateCount();
// Canvas numbers carry on from the last visit, so no two paintings on the wall share one.
const lastCanvas = store.get(KEY.canvases, 0);
studio.number = Number.isInteger(lastCanvas) && lastCanvas > 0 ? lastCanvas : 0;
studio.newCanvas();
runDemo();

// Exposed for tinkering from the console, and for test/e2e.mjs and tools/screenshots.mjs.
window.happyAccidents = studio;
studio.skipIntro = userActed;
