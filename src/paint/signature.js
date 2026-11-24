import { clamp } from '../util.js';

export const SIGNATURE_FONT = '"Mrs Saint Delafield", "Segoe Script", "Brush Script MT", cursive';
const RED = '#c9321f';

// Hebrew, Arabic and the scripts around them, which write right to left.
const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/;

// The signature is lettered offscreen once, then revealed the way it's written: left to right, or right to left for a
// name that starts in a right-to-left script. It's 44px, small and down in the corner like a painter's; a name too long
// to stay under 0.4 of the canvas's width is lettered smaller to fit, down to 26px.
export function signature(S, name) {
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
  const k = S.k;
  const off = document.createElement('canvas');
  off.width = Math.ceil(tw * k);
  off.height = Math.ceil(th * k);
  const o = off.getContext('2d');
  o.scale(k, k);
  o.font = font;
  o.textBaseline = 'alphabetic';
  o.fillStyle = 'rgba(40,10,5,0.35)';
  o.fillText(text, 12.8, size * 1.02 + 0.8);
  o.fillStyle = RED;
  o.fillText(text, 12, size * 1.02);

  const rtl = RTL.test(text.match(/\p{L}/u)?.[0] ?? '');
  const x = clamp(S.W - 28 - tw, 8, S.W - tw);
  const y = S.H - 22 - th;
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
