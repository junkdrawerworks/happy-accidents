// Things that sit on or in the lake: rocks, ripples and the sparkle path under the sun.
import { rand, randi, chance, clamp } from '../util.js';
import { rgba, mix, darken, lighten, jitter, dim } from '../color.js';
import { knife, tap, pathOf, bristle, linePts } from '../brush.js';
import { topEdge, heights, at } from '../shape.js';

export function rock(S, p) {
  const { scheme, hy, H } = S;
  const L = S.lightDir;
  const dT = clamp((p.y - hy) / (H - hy), 0, 1);
  const { x, y } = p;
  const top = [];
  const n = 22;
  let w;
  let hh;
  if (p.shape) {
    // The rock is the top of the splat, sitting in the water.
    const { box } = p.shape;
    w = clamp(box.w * rand(0.9, 1.2) * (0.45 + dT * 1.3), 10, 170);
    hh = w * clamp(box.h / box.w, 0.35, 0.75) * 0.7;
    const hs = heights(topEdge(p.shape.pts, n + 1), p.shape.cy + box.h * 0.15);
    for (let i = 0; i <= n; i++) top.push([x - w / 2 + (i / n) * w, y - Math.pow(at(hs, i / n), 0.8) * hh]);
  } else {
    w = clamp(p.R * rand(1.5, 2.4) * (0.35 + dT), 10, 170);
    hh = w * rand(0.3, 0.55);
    for (let i = 0; i <= n; i++) {
      const ang = Math.PI * (1 - i / n);
      top.push([x + (Math.cos(ang) * w) / 2, y - Math.sin(ang) * hh * (1 + rand(-0.14, 0.14))]);
    }
  }
  top[0][1] = y;
  top[n][1] = y;
  const path = pathOf(top);
  const dark = mix(scheme.ground.dark, scheme.mtn.shadow, 0.4);
  const lightC = mix(scheme.mtn.light, dark, 0.35);

  const ops = [];
  ops.push((ctx) => {
    // reflection first so the rock sits on top of it
    ctx.save();
    ctx.translate(0, 2 * y + 2);
    ctx.scale(1, -0.9);
    ctx.fillStyle = rgba(darken(dark, 0.1), 0.45);
    ctx.fill(path);
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    for (let yy = y + 3; yy < y + hh * 1.1; yy += rand(2, 5)) {
      ctx.fillStyle = `rgba(0,0,0,${rand(0.3, 0.8)})`;
      ctx.fillRect(x - w, yy, w * 2, rand(0.6, 1.6));
    }
    ctx.restore();
  });
  ops.push((ctx) => {
    ctx.fillStyle = rgba(dark);
    ctx.fill(path);
  });
  ops.push((ctx) => {
    ctx.save();
    ctx.clip(path);
    for (let i = 1; i < top.length - 1; i++) {
      const [px, py] = top[i];
      const onLit = (px - x) * L > -w * 0.15;
      if (!onLit || chance(0.3)) continue;
      const len = hh * rand(0.2, 0.6);
      knife(ctx, px, py + 0.5, px + L * len * 0.5 - (px - x) * 0.15, py + len, rand(2, 5) * clamp(w / 60, 0.6, 2), jitter(lightC, 0.03), 0.8, 0.45);
    }
    ctx.restore();
  });
  ops.push((ctx) => {
    const segs = randi(2, 4);
    for (let i = 0; i < segs; i++) {
      const sx = x - w * 0.65 + rand(0, w * 1.1);
      tap(ctx, sx, y + 0.5, rand(w * 0.15, w * 0.45), 0, scheme.waterLine, 0.75, rand(1, 1.8));
    }
  });
  return { kind: 'rock', depth: y, reflect: false, bbox: { x: x - w * 0.75, y: y - hh * 1.3, w: w * 1.5, h: hh * 2.6 }, ops, dur: 1000, meta: { top, x, y, w, hh, path } };
}

// Ripples on the water. Bold ones (blue paint) are longer, thicker and darker, with a light edge above each, so a single
// tap shows on a phone at arm's length.
export function ripples(S, p) {
  const { scheme, hy, H } = S;
  const dT = clamp((p.y - hy) / (H - hy), 0, 1);
  const bold = p.bold ? 1 : 0;
  const spread = clamp(p.R * (p.wide ? 5 : 3 + bold), 20, 200) * (0.4 + dT);
  // A ring of ripples where the splat landed, and a little one wherever a droplet hit the water.
  const spots = [{ x: p.x, y: p.y, n: p.wide ? randi(9, 14) : bold ? randi(6, 8) : randi(3, 5), s: 1 + bold * 0.7 }];
  for (const d of (p.shape?.drops || []).slice(0, 10)) if (d.y > hy + 3) spots.push({ x: d.x, y: d.y, n: 1, s: clamp(d.r / 3, 0.3, 0.8) * (1 + bold * 0.5) });
  const ops = [];
  for (const sp of spots) {
    ops.push((ctx) => {
      for (let i = 0; i < sp.n; i++) {
        const y = sp.y + (sp.n > 1 ? rand(-spread * 0.2, spread * 0.2) : 0);
        const len = rand(6, 30) * (0.4 + dT * 1.2) * sp.s;
        const x = sp.x + (sp.n > 1 ? rand(-spread * 0.6, spread * 0.6) : 0);
        if (bold) bristle(ctx, linePts(x - len * 0.4, y - 1.8, x + len * 0.4, y - 1.8, 8), { width: 1.4, count: 2, color: scheme.waterLine, alpha: 0.55, taper: 0.3 });
        bristle(ctx, linePts(x - len / 2, y, x + len / 2, y, 8), { width: bold ? 3 : 1.6, count: bold ? 3 : 2, color: p.color ?? scheme.waterLine, alpha: bold ? 0.85 : 0.6, taper: 0.3 });
        bristle(ctx, linePts(x - len / 2, y + 2, x + len / 2, y + 2, 8), { width: 1.4, count: 2, color: darken(scheme.water, 0.3), alpha: bold ? 0.4 : 0.25, taper: 0.3 });
      }
    });
  }
  const xs = spots.map((q) => q.x);
  const ys = spots.map((q) => q.y);
  const bx = Math.min(...xs) - spread - 40;
  const by = Math.min(...ys) - spread * 0.3 - 6;
  return { kind: 'ripples', depth: p.y, reflect: false, bbox: { x: bx, y: by, w: Math.max(...xs) + spread + 40 - bx, h: Math.max(...ys) + spread * 0.3 + 10 - by }, ops, dur: 700, meta: { x: p.x, y: p.y } };
}

// Sparkles on the water under the sun (or moon).
export function sunpath(S, m) {
  const { hy, H, scheme } = S;
  const x = m.x;
  const rows = [];
  for (let y = hy + 2; y < H; y += rand(2, 6)) rows.push(y);
  const ops = [];
  for (let i = 0; i < rows.length; i += 12) {
    const chunk = rows.slice(i, i + 12);
    ops.push((ctx) => {
      for (const y of chunk) {
        const d = (y - hy) / (H - hy);
        const spread = m.r * 0.6 + (y - hy) * 0.3;
        const count = chance(0.5) ? 1 : 2;
        for (let k = 0; k < count; k++) {
          const cx = x + rand(-spread, spread) * rand(0.2, 1);
          const len = rand(3, 14) * (0.5 + d);
          ctx.fillStyle = rgba(m.color ?? scheme.sun, rand(0.25, 0.75) * (1 - d * 0.7));
          ctx.fillRect(cx - len / 2, y, len, rand(0.8, 1.8));
        }
      }
    });
  }
  const w = m.r * 0.6 + (H - hy) * 0.3;
  return { kind: 'sunpath', depth: 0.05, reflect: false, bbox: { x: x - w - 20, y: hy, w: w * 2 + 40, h: H - hy }, ops, dur: 900 };
}


// Draws a shape, then its reflection below the waterline, broken up by little ripples.
function withReflection(ctx, y, depth, draw) {
  draw(ctx);
  ctx.save();
  ctx.translate(0, 2 * y + 1);
  ctx.scale(1, -0.85);
  ctx.globalAlpha = 0.35;
  draw(ctx);
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  for (let yy = y + 2; yy < y + depth; yy += rand(2, 4)) {
    ctx.fillStyle = `rgba(0,0,0,${rand(0.35, 0.8)})`;
    ctx.fillRect(-1e4, yy, 2e4, rand(0.6, 1.4));
  }
  ctx.restore();
}

// White paint on open water: a little sailboat.
export function sailboat(S, p) {
  const { scheme, hy, H } = S;
  const dT = clamp((p.y - hy) / (H - hy), 0, 1);
  // Smaller the further off it is, but never too small to see.
  const s = clamp((p.y - hy) * 0.28 + p.R * 0.6, 20, 130);
  const L = S.lightDir;
  const { x, y } = p;
  const dir = chance(0.5) ? 1 : -1;
  const sail = mix(mix([250, 249, 244], scheme.mtn.light, scheme.night ? 0.5 : 0), p.tint, 0.08);
  const sailShade = mix(sail, scheme.water, 0.35);
  const hull = mix([52, 38, 30], scheme.ground.dark, 0.3);
  const mastX = x + dir * s * 0.05;
  const top = y - s * 1.15;
  const draw = (ctx) => {
    // hull
    ctx.fillStyle = rgba(hull);
    ctx.beginPath();
    ctx.moveTo(x - s * 0.45, y - s * 0.12);
    ctx.lineTo(x + s * 0.45, y - s * 0.12);
    ctx.lineTo(x + s * 0.34 * dir, y);
    ctx.lineTo(x - s * 0.36 * dir, y);
    ctx.closePath();
    ctx.fill();
    // mainsail and jib
    const main = [[mastX, top], [mastX, y - s * 0.16], [mastX - dir * s * 0.42, y - s * 0.16]];
    const jib = [[mastX + dir * s * 0.03, top + s * 0.12], [mastX + dir * s * 0.03, y - s * 0.18], [mastX + dir * s * 0.34, y - s * 0.18]];
    for (const [pts, lit] of [[main, dir !== L], [jib, dir === L]]) {
      ctx.fillStyle = rgba(lit ? sail : sailShade);
      ctx.beginPath();
      pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = rgba(darken(hull, 0.2));
    ctx.lineWidth = Math.max(0.8, s * 0.018);
    ctx.beginPath();
    ctx.moveTo(mastX, top - s * 0.04);
    ctx.lineTo(mastX, y - s * 0.12);
    ctx.stroke();
  };
  const ops = [
    (ctx) => withReflection(ctx, y, s * 1.1, draw),
    (ctx) => {
      for (let i = 0; i < 3; i++) tap(ctx, x - s * 0.7 + rand(0, s * 1.2), y + 1, rand(s * 0.2, s * 0.5), 0, scheme.waterLine, 0.7, rand(1, 1.6));
      // a short wake behind it
      for (let i = 0; i < 4; i++) tap(ctx, x - dir * s * (0.5 + i * 0.25), y + rand(-1, 2), s * rand(0.15, 0.3), dir > 0 ? Math.PI : 0, scheme.waterLine, 0.45 - i * 0.08, 1);
    },
  ];
  const box = { x: x - s * 1.6, y: top - 6, w: s * 3.2, h: s * 2.4 + 10 };
  return { kind: 'sailboat', depth: y, reflect: false, bbox: box, ops, dur: 900 + dT * 400, meta: { x, y, size: s } };
}

// Red paint on open water: a canoe.
export function canoe(S, p) {
  const { scheme, hy } = S;
  // Smaller the further off it is, but never smaller than the splat that made it, nor too small to see.
  const s = clamp(Math.max((p.y - hy) * 0.32 + p.R * 0.6, p.R * 1.3), 28, 150);
  const { x, y } = p;
  const body = dim(S, mix(p.tint, [200, 40, 30], 0.3));
  const lit = lighten(body, 0.3);
  const inside = darken(body, 0.55);
  const tilt = rand(-0.06, 0.06);
  const draw = (ctx) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    // the hull: a long, shallow crescent
    ctx.fillStyle = rgba(body);
    ctx.beginPath();
    ctx.moveTo(-s * 0.5, -s * 0.09);
    ctx.quadraticCurveTo(0, s * 0.07, s * 0.5, -s * 0.09);
    ctx.quadraticCurveTo(s * 0.46, 0, s * 0.3, 0);
    ctx.lineTo(-s * 0.3, 0);
    ctx.quadraticCurveTo(-s * 0.46, 0, -s * 0.5, -s * 0.09);
    ctx.fill();
    // the inside, seen over the near gunwale
    ctx.fillStyle = rgba(inside);
    ctx.beginPath();
    ctx.moveTo(-s * 0.44, -s * 0.075);
    ctx.quadraticCurveTo(0, -s * 0.02, s * 0.44, -s * 0.075);
    ctx.quadraticCurveTo(0, -s * 0.05, -s * 0.44, -s * 0.075);
    ctx.fill();
    ctx.strokeStyle = rgba(lit, 0.85);
    ctx.lineWidth = Math.max(0.8, s * 0.015);
    ctx.beginPath();
    ctx.moveTo(-s * 0.46, -s * 0.07);
    ctx.quadraticCurveTo(0, s * 0.03, s * 0.46, -s * 0.07);
    ctx.stroke();
    ctx.restore();
  };
  const ops = [
    (ctx) => withReflection(ctx, y, s * 0.3, draw),
    (ctx) => {
      for (let i = 0; i < 4; i++) tap(ctx, x - s * 0.8 + rand(0, s * 1.4), y + rand(1, 3), rand(s * 0.15, s * 0.4), 0, scheme.waterLine, 0.6, rand(1, 1.5));
    },
  ];
  return { kind: 'canoe', depth: y, reflect: false, bbox: { x: x - s * 0.9, y: y - s * 0.3, w: s * 1.8, h: s * 0.7 }, ops, dur: 800, meta: { x, y, size: s } };
}

// Yellow paint on the water: light glinting off it, wide and bright enough to see from a single tap.
export function glints(S, p) {
  const { hy, H } = S;
  const dT = clamp((p.y - hy) / (H - hy), 0, 1);
  const w = clamp(p.R * 6.5, 60, 300) * (0.5 + dT);
  const h = w * 0.25;
  const col = dim(S, lighten(p.tint, 0.3));
  const ops = [];
  ops.push((ctx) => {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(1, 0.25);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 0.55);
    g.addColorStop(0, rgba(col, 0.4));
    g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, w * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
  const drops = (p.shape?.drops || []).filter((d) => d.y > hy + 3);
  for (let k = 0; k < 6; k++) {
    ops.push((ctx) => {
      for (let i = 0; i < 18; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random());
        const gx = p.x + Math.cos(a) * r * w * 0.5;
        const gy = p.y + Math.sin(a) * r * h * 0.5;
        const len = rand(4, 18) * (0.5 + dT) * (1 - r * 0.5);
        ctx.fillStyle = rgba(col, rand(0.6, 1) * (1 - r * 0.4));
        ctx.fillRect(gx - len / 2, gy, len, rand(1.2, 2.6));
      }
      for (const d of drops.slice(k * 2, k * 2 + 2)) {
        ctx.fillStyle = rgba(col, 0.9);
        ctx.fillRect(d.x - 4, d.y, 8, 1.4);
      }
    });
  }
  return { kind: 'glints', depth: p.y, reflect: false, bbox: { x: p.x - w * 0.6 - 60, y: p.y - h * 0.6 - 60, w: w * 1.2 + 120, h: h * 1.2 + 120 }, ops, dur: 900, meta: { x: p.x, y: p.y } };
}

// A small dark fleck out on open water: a pair of loons, low in the water, each with a white fleck on its back and a V of
// wake behind. Smaller the further off they are. p.color is the birds' dark color, as it shows on the water.
export function loons(S, p) {
  const { scheme, hy, H } = S;
  const dT = clamp((p.y - hy) / (H - hy), 0, 1);
  const s = clamp((p.y - hy) * 0.09 + p.R * 0.6, 12, 40);
  const { x, y } = p;
  const dir = chance(0.5) ? 1 : -1;
  const body = p.color;
  const fleck = mix([250, 250, 246], scheme.waterLine, 0.3);
  // The second bird a little behind the first, and a little further off.
  const birds = [
    { x: x - dir * s * 0.8, y, k: 1 },
    { x: x + dir * s * 0.9 + rand(-0.2, 0.2) * s, y: y - s * rand(0.15, 0.35), k: rand(0.8, 0.92) },
  ];
  const bird = (ctx, b) => {
    const k = s * b.k;
    ctx.fillStyle = rgba(body);
    // the body, low and long, sitting in the water
    ctx.beginPath();
    ctx.ellipse(b.x, b.y - k * 0.1, k * 0.55, k * 0.2, 0, Math.PI, 0);
    ctx.lineTo(b.x - k * 0.55, b.y - k * 0.12);
    ctx.fill();
    // the neck and head, at the front, and the bill
    ctx.beginPath();
    ctx.ellipse(b.x + dir * k * 0.42, b.y - k * 0.36, k * 0.1, k * 0.2, dir * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(b.x + dir * k * 0.48, b.y - k * 0.52, k * 0.14, k * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(b.x + dir * k * 0.58, b.y - k * 0.55);
    ctx.lineTo(b.x + dir * k * 0.8, b.y - k * 0.5);
    ctx.lineTo(b.x + dir * k * 0.58, b.y - k * 0.47);
    ctx.fill();
    // the white fleck on its back
    ctx.fillStyle = rgba(fleck, 0.9);
    for (let i = 0; i < 3; i++) ctx.fillRect(b.x - dir * k * (0.05 + i * 0.12) - k * 0.04, b.y - k * 0.24 + (i % 2) * k * 0.05, k * 0.08, Math.max(0.8, k * 0.05));
  };
  const draw = (ctx) => birds.forEach((b) => bird(ctx, b));
  const ops = [
    // the V of wake behind each, opening out away from where it's swimming
    (ctx) => {
      for (const b of birds) {
        const k = s * b.k;
        for (const side of [-1, 1]) {
          const len = k * rand(1.3, 1.9);
          bristle(ctx, linePts(b.x + dir * k * 0.3, b.y + 0.5, b.x + dir * k * 0.3 - dir * len, b.y + 0.5 + side * len * 0.22 + len * 0.04, 8), { width: 1.2, count: 2, color: scheme.waterLine, alpha: 0.5, taper: 0.7 });
        }
      }
    },
    (ctx) => withReflection(ctx, y, s * 0.6, draw),
    (ctx) => {
      for (const b of birds) tap(ctx, b.x - s * 0.3, b.y + 1, s * b.k * 0.7, 0, scheme.waterLine, 0.6, 1);
    },
  ];
  const w = s * 4.6;
  return { kind: 'loons', depth: y, reflect: false, bbox: { x: x - w, y: y - s * 1.2, w: w * 2, h: s * 2 }, ops, dur: 700 + dT * 300, meta: { x, y, size: s } };
}

// Brown landing on the lake right at the shore: a little wooden dock, planks on posts, reaching out from the bank (from
// p.shoreX, toward p.x and a little past it) at the waterline p.y, mirrored in the water.
export function dock(S, p) {
  const { scheme, hy } = S;
  const s = clamp((p.y - hy) * 0.1 + 8, 10, 44);
  const { y } = p;
  const out = p.out;
  const x0 = p.shoreX - out * s * 0.8;
  // Out past where the paint landed, and at least a few posts long.
  const reachTo = out > 0 ? Math.max(p.x + p.R * 0.6, p.shoreX + s * 3) : Math.min(p.x - p.R * 0.6, p.shoreX - s * 3);
  const x1 = clamp(reachTo, s, S.W - s);
  const len = Math.abs(x1 - x0);
  const wood = dim(S, mix(p.tint, [118, 86, 56], 0.55));
  const lit = mix(wood, scheme.mtn.light, 0.45);
  const shade = darken(wood, 0.45);
  const top = y - s * 0.55;
  const deck = s * 0.16;
  const posts = [];
  for (let d = s * 0.9; d < len - s * 0.2; d += s * rand(0.9, 1.3)) posts.push(x0 + out * d);
  posts.push(x1 - out * s * 0.12);
  const lo = Math.min(x0, x1);
  const draw = (ctx) => {
    ctx.fillStyle = rgba(shade);
    for (const px of posts) ctx.fillRect(px - s * 0.06, top, s * 0.12, y - top + s * 0.08);
    // the last post stands a little proud of the deck, for tying up to
    ctx.fillRect(x1 - out * s * 0.12 - s * 0.06, top - s * 0.2, s * 0.12, s * 0.2);
    ctx.fillStyle = rgba(wood);
    ctx.fillRect(lo, top, len, deck);
    ctx.fillStyle = rgba(lit, 0.9);
    ctx.fillRect(lo, top, len, Math.max(0.8, deck * 0.3));
    ctx.fillStyle = rgba(shade, 0.7);
    for (let d = s * 0.35; d < len; d += s * 0.35) ctx.fillRect(lo + d, top + deck * 0.3, Math.max(0.6, s * 0.03), deck * 0.7);
  };
  const ops = [
    (ctx) => withReflection(ctx, y, s * 0.9, draw),
    (ctx) => {
      for (const px of posts) tap(ctx, px, y + 1, s * rand(0.25, 0.45), 0, scheme.waterLine, 0.6, 1);
    },
  ];
  return { kind: 'dock', depth: y, reflect: false, bbox: { x: lo - s, y: top - s * 0.4, w: len + s * 2, h: y - top + s * 1.6 }, ops, dur: 1100, meta: { x: (x0 + x1) / 2, y, size: s, len } };
}
