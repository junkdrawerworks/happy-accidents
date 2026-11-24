import { clamp } from '../util.js';
import { hsl, lum } from '../color.js';

export const SIGNATURE_FONT = '"Mrs Saint Delafield", "Segoe Script", "Brush Script MT", cursive';
const RED = '#c9321f';

// Hebrew, Arabic and the scripts around them, which write right to left.
const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;

// Paint that would swallow Bright Red lettering: a patch that's largely red or orange (autumn leaves, a red bush), or
// dark on the whole (night ground). pixels is a list of [r, g, b].
export function poorGround(pixels) {
  if (!pixels?.length) return false;
  let warm = 0;
  let light = 0;
  for (const p of pixels) {
    const { h, c } = hsl(p);
    if (c >= 0.2 && (h < 45 || h >= 330)) warm++;
    light += lum(p);
  }
  return warm / pixels.length >= 0.35 || light / pixels.length < 0.18;
}

// Where the signature goes: down in the bottom-right corner like a painter's, unless the paint there would swallow it;
// then the bottom-left corner. If both would, it goes bottom right over a pale underpaint (under). sample(box) gives
// the pixels of the painting under a box, before the signature is on it; without one it's always bottom right.
export function signSpot(S, tw, th, sample) {
  const y = S.H - 22 - th;
  const right = { x: clamp(S.W - 28 - tw, 8, S.W - tw), y, w: tw, h: th };
  if (!sample || !poorGround(sample(right))) return { ...right, under: false };
  const left = { x: clamp(28, 0, S.W - tw - 8), y, w: tw, h: th };
  if (!poorGround(sample(left))) return { ...left, under: false };
  return { ...right, under: true };
}

// The signature is lettered offscreen once, then revealed the way it's written: left to right, or right to left for a
// name that starts in a right-to-left script. It's 44px, small and down in a corner like a painter's; a name too long
// to stay under 0.4 of the canvas's width is lettered smaller to fit, down to 26px.
export function signature(S, name, sample) {
  const text = (name || '').trim().slice(0, 28) || 'Anonymous';
  const probe = document.createElement('canvas').getContext('2d');
  const fontAt = (px) => `${px}px ${SIGNATURE_FONT}`;
  probe.font = fontAt(44);
  const room = S.W * 0.4 - 24;
  const wide = probe.measureText(text).width;
  const size = wide > room ? Math.max(26, Math.floor((44 * room) / wide)) : 44;
  const font = fontAt(size);
  probe.font = font;
  const tw = Math.ceil(probe.measureText(text).width) + 24;
  const th = Math.ceil(size * 1.5);
  const { x, y, under } = signSpot(S, tw, th, sample);
  const k = S.k;
  const off = document.createElement('canvas');
  off.width = Math.ceil(tw * k);
  off.height = Math.ceil(th * k);
  const o = off.getContext('2d');
  o.scale(k, k);
  o.font = font;
  o.textBaseline = 'alphabetic';
  if (under) {
    // A pale, warm underpaint first, as if signed on a dry patch, so the red reads on dark or red paint.
    o.strokeStyle = 'rgba(246,236,214,0.5)';
    o.lineWidth = 2.5;
    o.lineJoin = 'round';
    o.strokeText(text, 12, size * 1.02);
  } else {
    o.fillStyle = 'rgba(40,10,5,0.35)';
    o.fillText(text, 12.8, size * 1.02 + 0.8);
  }
  o.fillStyle = RED;
  o.fillText(text, 12, size * 1.02);

  const rtl = RTL.test(text.match(/\p{L}/u)?.[0] ?? '');
  const steps = 26;
  const ops = [];
  for (let i = 1; i <= steps; i++) {
    const f = i / steps;
    const from = rtl ? 1 - f : 0;
    ops.push((ctx) => {
      ctx.clearRect(x, y, tw, th);
      ctx.drawImage(off, off.width * from, 0, off.width * f, off.height, x + tw * from, y, tw * f, th);
    });
  }
  return { kind: 'signature', depth: 1e6, reflect: false, bbox: { x, y, w: tw, h: th }, ops, dur: 1300 };
}
