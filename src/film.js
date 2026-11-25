// Watch it again: a flipbook of how the painting on the easel came about. Each time something finishes painting, the
// studio keeps a small picture of the canvas (without any wet paint) and where it changed; after signing, the label
// plays them back on its frame, each thing wiping in where it was painted, in the order it went on.
// Only the canvas on the easel has one, and only in memory: New canvas starts a new one.

// The most pictures one canvas keeps. A long canvas that reaches it drops every second picture (the first and the
// newest stay) and from then on keeps one chance in two, then one in four, so the pictures stay spread evenly over the
// whole painting, between about half this and this many.
export const MAX_FRAMES = 60;
// How wide each picture is, in pixels (the canvas is 4:3), and its JPEG quality: 20 to 50 KB each (a busy painting
// takes more), so a whole film is a megabyte or two.
export const FRAME_WIDTH = 560;
export const FRAME_QUALITY = 0.72;
// About how long the replay takes, in ms, and how long one thing takes to wipe in, at most and at least.
const PLAY_MS = 10000;
const STEP_MAX = 900;
const STEP_MIN = 160;

const union = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];

export class Film {
  constructor(max = MAX_FRAMES) {
    this.max = max;
    this.clear();
  }

  clear() {
    // Each picture is { box: [x0, y0, x1, y1], pic }: where the canvas changed since the picture before (in the
    // canvas's own units), and the picture (a Blob, once it's made).
    this.frames = [];
    this.stride = 1;
    this.chances = 0;
    this.box = null;
    this.armed = false;
  }

  // Something finished painting in box.
  changed(box) {
    this.box = this.box ? union(this.box, box) : [...box];
    this.armed = true;
  }

  // A chance to take a picture of what changed since the last one. Returns the new frame, for its picture to be put in,
  // or null when there's nothing new or this chance is one the film skips (it's been thinned); then what changed waits
  // for the next picture. force takes one whenever anything has changed (the signature, just before the label).
  next(force = false) {
    if (!this.box || (!this.armed && !force)) return null;
    this.armed = false;
    if (!force && this.chances++ % this.stride) return null;
    const frame = { box: this.box, pic: null };
    this.box = null;
    this.frames.push(frame);
    if (this.frames.length > this.max) this.thin();
    return frame;
  }

  // Drops every second picture, keeping the first and the newest; what changed in a dropped one goes with the next.
  thin() {
    const last = this.frames.length - 1;
    const kept = [];
    let carry = null;
    this.frames.forEach((f, i) => {
      if (i % 2 === 1 && i !== last) {
        carry = carry ? union(carry, f.box) : f.box;
        return;
      }
      if (carry) f.box = union(carry, f.box);
      carry = null;
      kept.push(f);
    });
    this.frames = kept;
    this.stride *= 2;
  }

  // The pictures that are ready, in order.
  get ready() {
    return this.frames.filter((f) => f.pic);
  }

  // How much memory the pictures take, in bytes.
  get bytes() {
    return this.frames.reduce((n, f) => n + (f.pic?.size || 0), 0);
  }
}

// How long each thing takes to wipe in, for n of them, in ms.
export const stepMs = (n) => Math.max(STEP_MIN, Math.min(STEP_MAX, PLAY_MS / Math.max(1, n)));

// Plays frames on the canvas out, from the bare paper (start, a picture of it) to the last picture. W and H are the
// size of the painting the boxes are in. Each thing wipes in across where it changed (down the canvas for the sky's
// wash and anything else as wide as the canvas), softly, while everything else that changed fades in under it; with
// reduced motion, each picture just fades in. Returns a promise that settles when it's done or stopped: stop() on the
// returned object stops it.
export function play(out, frames, { start, W, H, reduced = false }) {
  const ctx = out.getContext('2d');
  const cw = out.width;
  const ch = out.height;
  const s = cw / W;
  const spare = document.createElement('canvas');
  spare.width = cw;
  spare.height = ch;
  const sctx = spare.getContext('2d');
  let stopped = false;
  let wake = null;
  const sleep = (ms) =>
    new Promise((resolve) => {
      const t = setTimeout(() => ((wake = null), resolve()), ms);
      wake = () => (clearTimeout(t), (wake = null), resolve());
    });
  const nextFrame = () =>
    new Promise((resolve) => {
      const id = requestAnimationFrame((now) => ((wake = null), resolve(now)));
      wake = () => (cancelAnimationFrame(id), (wake = null), resolve(performance.now()));
    });
  const decode = (blob) => createImageBitmap(blob).catch(() => null);

  const ease = (t) => t * t * (3 - 2 * t);
  // One picture coming in over the last: the last as it was, then the new one in its box, wiped in up to p, then all of
  // it at fade (so whatever changed outside the box comes in too, by the end).
  const draw = (from, to, box, p, fade) => {
    ctx.globalAlpha = 1;
    ctx.drawImage(from, 0, 0, cw, ch);
    if (!reduced && p > 0) {
      const [x0, y0, x1, y1] = box.map((v) => v * s);
      const down = x1 - x0 >= cw * 0.9;
      const len = down ? y1 - y0 : x1 - x0;
      const edge = Math.max(12, len * 0.25);
      const at = (down ? y0 : x0) - edge + (len + edge) * p;
      sctx.globalCompositeOperation = 'source-over';
      sctx.clearRect(0, 0, cw, ch);
      sctx.drawImage(to, 0, 0, cw, ch);
      sctx.globalCompositeOperation = 'destination-in';
      const g = down ? sctx.createLinearGradient(0, at, 0, at + edge) : sctx.createLinearGradient(at, 0, at + edge, 0);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      sctx.fillStyle = g;
      sctx.fillRect(x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4);
      ctx.drawImage(spare, 0, 0);
    }
    if (fade > 0) {
      ctx.globalAlpha = fade;
      ctx.drawImage(to, 0, 0, cw, ch);
      ctx.globalAlpha = 1;
    }
  };

  const run = async () => {
    const paper = document.createElement('canvas');
    paper.width = cw;
    paper.height = ch;
    const pctx = paper.getContext('2d');
    pctx.fillStyle = '#f2efe6';
    pctx.fillRect(0, 0, cw, ch);
    if (start) pctx.drawImage(start, 0, 0, cw, ch);
    ctx.drawImage(paper, 0, 0);
    const ms = stepMs(frames.length);
    let from = paper;
    let coming = decode(frames[0].pic);
    await sleep(350);
    for (let i = 0; i < frames.length && !stopped; i++) {
      const to = await coming;
      coming = i + 1 < frames.length ? decode(frames[i + 1].pic) : null;
      if (stopped) {
        to?.close?.();
        break;
      }
      if (!to) continue;
      const t0 = performance.now();
      for (;;) {
        const now = await nextFrame();
        if (stopped) break;
        const t = Math.min(1, (now - t0) / ms);
        draw(from, to, frames[i].box, reduced ? 0 : ease(Math.min(1, t / 0.8)), reduced ? ease(t) : t * t * t);
        if (t >= 1) break;
      }
      if (from !== paper) from.close?.();
      from = to;
    }
    if (from !== paper) from.close?.();
    (await coming)?.close?.();
    if (!stopped) await sleep(700);
  };
  const done = run().catch(() => {});
  return {
    done,
    stop() {
      stopped = true;
      wake?.();
    },
  };
}

// Save the replay: the replay recorded as it plays on the label, as a short video to keep or send. Only where the
// browser can record a canvas (MediaRecorder and captureStream). MP4 where the browser can make one (Safari, and Chrome
// from version 126), since every phone's photos open that; WebM, which some don't, only where it can't.
const VIDEO_TYPES = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

// The kind of video this browser can record a canvas as, or null where it can't.
export function videoType() {
  try {
    if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') return null;
    return VIDEO_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) || null;
  } catch {
    return null;
  }
}

export const videoExt = (type) => (/^video\/mp4/.test(type) ? 'mp4' : 'webm');

// Records what's painted on canvas, a frame each time the screen is drawn, until finish() (which gives the video as a
// Blob, or null if nothing came of it) or cancel() (which throws it away). Either way the recorder and the canvas's
// stream are stopped and let go, and both are safe to call again.
export function record(canvas, type) {
  let stream = canvas.captureStream(0);
  let track = stream.getVideoTracks()[0];
  // A frame on every redraw where the browser lets the page ask for one; elsewhere 30 a second, as it changes.
  if (typeof track?.requestFrame !== 'function') {
    stream.getTracks().forEach((t) => t.stop());
    stream = canvas.captureStream(30);
    track = null;
  }
  const release = () => stream.getTracks().forEach((t) => t.stop());
  let rec;
  try {
    rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 2500000 });
  } catch (err) {
    release();
    throw err;
  }
  const chunks = [];
  rec.ondataavailable = (e) => e.data?.size && chunks.push(e.data);
  let raf = 0;
  const tick = () => {
    track?.requestFrame();
    raf = requestAnimationFrame(tick);
  };
  rec.start(500);
  tick();
  let closed = false;
  const close = () => {
    closed = true;
    cancelAnimationFrame(raf);
  };
  return {
    recorder: rec,
    stream,
    finish() {
      if (closed) return Promise.resolve(null);
      close();
      return new Promise((resolve) => {
        const done = () => {
          release();
          resolve(chunks.length ? new Blob(chunks, { type: (rec.mimeType || type).split(';')[0] }) : null);
        };
        rec.onstop = done;
        rec.onerror = done;
        try {
          rec.stop();
        } catch {
          done();
        }
      });
    },
    cancel() {
      if (closed) return;
      close();
      rec.ondataavailable = null;
      rec.onstop = null;
      try {
        if (rec.state !== 'inactive') rec.stop();
      } catch {
        /* already stopped */
      }
      release();
      chunks.length = 0;
    },
  };
}
