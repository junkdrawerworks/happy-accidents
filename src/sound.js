// Soft, synthesized studio sounds: the damp pat of paint landing on canvas, the hush of a brush, a
// pen's scratch for the signature and a knock of wood when the label goes up. They're built from
// pink noise (softer than white noise) and a few low tones, with gentle onsets and the highs rolled
// off, so nothing clicks, cracks or hisses.
let ac = null;
let master = null;
let pink = null;
let enabled = false;

// Browsers only let audio start once the page has had a tap or a key press; a context made before that stays silent
// and complains in the console. So it's made in wake(), on the first one, never at load.
const mayStart = () => navigator.userActivation?.hasBeenActive ?? true;

function ensure() {
  if (ac) return true;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return false;
  ac = new Ctx();
  master = ac.createGain();
  master.gain.value = 0.8;
  // A gentle limiter, so a pile of splats at once never gets harsh.
  const soften = ac.createDynamicsCompressor();
  soften.threshold.value = -20;
  soften.knee.value = 12;
  soften.ratio.value = 4;
  soften.attack.value = 0.006;
  soften.release.value = 0.25;
  master.connect(soften).connect(ac.destination);
  // Two seconds of pink noise (Paul Kellet's filter), scaled to a peak of 1.
  const len = ac.sampleRate * 2;
  pink = ac.createBuffer(1, len, ac.sampleRate);
  const d = pink.getChannelData(0);
  let [b0, b1, b2, b3, b4, b5, b6] = [0, 0, 0, 0, 0, 0, 0];
  let peak = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
    peak = Math.max(peak, Math.abs(d[i]));
  }
  for (let i = 0; i < len; i++) d[i] /= peak;
  return true;
}

// Turned on with the Sound button or M, that tap or key starts it right away. Turned on at load (it was on last
// time), it waits for the first tap or key.
export function setSound(on) {
  enabled = on;
  if (on) wake();
}

export const soundOn = () => enabled;

// Called on every tap and key press, and when the page comes back into view. Safari can leave the audio 'interrupted'
// (after a phone call, Siri or the phone locking) as well as 'suspended'; either way it's started again.
export function wake() {
  if (!enabled || !mayStart() || !ensure()) return;
  if (ac.state !== 'running' && ac.state !== 'closed') ac.resume()?.catch?.(() => {});
}

function noise(t, stop, loop = false) {
  const src = ac.createBufferSource();
  src.buffer = pink;
  src.loop = loop;
  src.start(t, Math.random() * 1.5);
  src.stop(stop);
  return src;
}

function filter(type, freq, q) {
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}

// Paint landing on stretched canvas: a soft, muffled pat, the canvas giving a little underneath,
// and a quiet wet spread. Bigger splats are lower and a touch longer.
export function splat(size = 20) {
  if (!enabled || !ac) return;
  const t = ac.currentTime + 0.005;
  const big = Math.min(1, size / 50);
  const vary = 0.9 + Math.random() * 0.2;

  // The pat: low-passed pink noise that swells in over about 15 ms instead of snapping on.
  const lp = filter('lowpass', (1300 - big * 500) * vary, 0.5);
  lp.frequency.setValueAtTime((1300 - big * 500) * vary, t);
  lp.frequency.setTargetAtTime(380, t + 0.02, 0.07);
  const lp2 = filter('lowpass', 2000, 0.5);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.42 + big * 0.15, t + 0.015 + big * 0.01);
  g.gain.setTargetAtTime(0.0001, t + 0.02 + big * 0.01, 0.05 + big * 0.04);
  noise(t, t + 0.7).connect(lp).connect(lp2).connect(g).connect(master);

  // The canvas giving: a round, low thump with no click at the front.
  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime((115 - big * 35) * vary, t);
  osc.frequency.exponentialRampToValueAtTime(60, t + 0.16);
  const og = ac.createGain();
  og.gain.setValueAtTime(0.0001, t);
  og.gain.linearRampToValueAtTime(0.09 + big * 0.06, t + 0.012);
  og.gain.setTargetAtTime(0.0001, t + 0.02, 0.05);
  osc.connect(og).connect(master);
  osc.start(t);
  osc.stop(t + 0.5);

  // The wet spread: a quiet, sinking squelch just after the pat.
  const s = t + 0.018;
  const bp = filter('bandpass', 1000 * vary, 1.2);
  bp.frequency.setValueAtTime(1000 * vary, s);
  bp.frequency.exponentialRampToValueAtTime(420, s + 0.16);
  const wg = ac.createGain();
  wg.gain.setValueAtTime(0.0001, s);
  wg.gain.linearRampToValueAtTime(0.22, s + 0.03);
  wg.gain.setTargetAtTime(0.0001, s + 0.04, 0.05);
  noise(s, s + 0.5).connect(bp).connect(wg).connect(master);
}

// Palette-knife work sounds a little grainier than a brush, but still soft.
const KNIFE = new Set(['mountain', 'rock', 'cabin', 'snowfall', 'rockSnow', 'roofSnow']);

// The brushes still sounding (their gains), so a fresh canvas can quiet them.
const brushing = new Set();

// A brush on canvas: soft swishes that swell in and ease out, one per stroke, with the tone
// rising and falling a little as the bristles drag. The signature is a pen, not a brush.
export function brush(kind, ms) {
  if (!enabled || !ac) return;
  if (kind === 'signature') return scratch(ms);
  const t = ac.currentTime + 0.01;
  const dur = Math.min(2.6, ms / 1000);
  const knife = KNIFE.has(kind);
  const f0 = knife ? 1150 : 700;
  const bp = filter('bandpass', f0, knife ? 0.9 : 0.6);
  const lp = filter('lowpass', knife ? 2600 : 1800, 0.5);
  bp.frequency.setValueAtTime(f0, t);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  const strokes = Math.max(2, Math.round(dur * 2.2));
  const len = dur / strokes;
  for (let i = 0; i < strokes; i++) {
    const s = t + i * len;
    const peak = (knife ? 0.15 : 0.11) * (0.75 + Math.random() * 0.5);
    g.gain.setTargetAtTime(peak, s, len * 0.16);
    g.gain.setTargetAtTime(0.0001, s + len * 0.55, len * 0.18);
    bp.frequency.setTargetAtTime(f0 * 1.25, s, len * 0.25);
    bp.frequency.setTargetAtTime(f0 * 0.85, s + len * 0.5, len * 0.25);
  }
  g.gain.setTargetAtTime(0.0001, t + dur, 0.06);
  const src = noise(t, t + dur + 0.5, true);
  src.connect(bp).connect(lp).connect(g).connect(master);
  brushing.add(g);
  src.onended = () => brushing.delete(g);
}

// How loud the pen's scratches get: about as loud as the brush, since a high sound carries more than a low one.
const SCRATCH = 0.1;

// A fine pen on canvas while the name goes on: short, dry scratches, a few a second the way a hand writes, high but
// with the very top rolled off so it never hisses.
function scratch(ms) {
  const t = ac.currentTime + 0.01;
  const dur = Math.min(2.4, ms / 1000);
  const hp = filter('highpass', 1600, 0.7);
  const bp = filter('bandpass', 3000, 1.2);
  const lp = filter('lowpass', 5200, 0.5);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  for (let s = t; s < t + dur - 0.06; ) {
    const len = 0.05 + Math.random() * 0.1;
    g.gain.setTargetAtTime(SCRATCH * (0.7 + Math.random() * 0.6), s, 0.008);
    g.gain.setTargetAtTime(0.0001, s + len * 0.7, 0.018);
    bp.frequency.setTargetAtTime(2500 + Math.random() * 1300, s, 0.02);
    s += len + 0.03 + Math.random() * 0.07;
  }
  g.gain.setTargetAtTime(0.0001, t + dur, 0.04);
  const src = noise(t, t + dur + 0.4, true);
  src.connect(hp).connect(bp).connect(lp).connect(g).connect(master);
  brushing.add(g);
  src.onended = () => brushing.delete(g);
}

// The label going up after a signing: one quiet knock of wood, like a frame touching the wall. A low, hollow body
// and a brighter tap on top, swelling in over 2 ms (no click) and gone in about a tenth of a second.
export function knock() {
  if (!enabled || !ac) return;
  const t = ac.currentTime + 0.01;
  for (const [type, f, peak, decay] of [['triangle', 196, 0.12, 0.045], ['sine', 452, 0.05, 0.028], ['sine', 1010, 0.02, 0.014]]) {
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.92, t + 0.12);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.002);
    g.gain.setTargetAtTime(0.0001, t + 0.004, decay);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.4);
  }
  // The tap of the wood itself: a few milliseconds of noise around 1.8 kHz.
  const bp = filter('bandpass', 1800, 1.4);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.08, t + 0.002);
  g.gain.setTargetAtTime(0.0001, t + 0.003, 0.006);
  noise(t, t + 0.1).connect(bp).connect(g).connect(master);
}

// Fades out every brush still going, over 80 ms (no click): the strokes it went with are gone with the old canvas.
export function hush() {
  if (!ac) return;
  const t = ac.currentTime;
  for (const g of brushing) {
    const v = g.gain.value;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(v, t);
    g.gain.linearRampToValueAtTime(0, t + 0.08);
  }
  brushing.clear();
}
