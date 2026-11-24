// The painting as it hangs, with its museum label, as one picture to save or send: the painting in its dark frame on
// the gallery wall, and the cream label under it (artist, title and year, oil on canvas, what it was made from and what
// it features, and the credit line), in the page's own Figtree. Drawn in code, like everything else.

const WALL = '#2a231d';
const LABEL = '#f6f3ec';
const INK = '#1f1b17';
const MUTED = '#6b6259';
const FONT = "'Figtree', 'Segoe UI', system-ui, -apple-system, sans-serif";

// The label's text, top to bottom, as the page's label has it: each part with its font, color, line height and the
// space after it, in label units (one unit is a CSS pixel on the page's own label).
function parts({ artist, title, year, note, features, credit }) {
  return [
    { runs: [{ text: artist, font: `700 15px ${FONT}` }], color: INK, lh: 22, after: 0 },
    { runs: [{ text: title, font: `italic 500 15px ${FONT}` }, { text: `, ${year}`, font: `400 15px ${FONT}` }], color: INK, lh: 22, after: 10 },
    { runs: [{ text: 'Oil on canvas', font: `400 13px ${FONT}` }], color: MUTED, lh: 19, after: 0 },
    { runs: [{ text: '18 × 24 in. (45.7 × 61 cm)', font: `400 13px ${FONT}` }], color: MUTED, lh: 19, after: 12 },
    { runs: [{ text: note, font: `400 13px ${FONT}` }], color: INK, lh: 19, after: 8 },
    { runs: [{ text: features, font: `400 13px ${FONT}` }], color: INK, lh: 19, after: 8 },
    { runs: [{ text: credit, font: `400 12px ${FONT}` }], color: MUTED, lh: 17, after: 0, rule: true },
  ];
}

// Lays one part out at a scale: its lines, each a list of runs with their x offsets. A part with two runs (the title and
// its year) wraps as one sentence, each word keeping its run's font.
function layout(ctx, part, width, s) {
  const words = [];
  for (const run of part.runs) for (const w of String(run.text).split(/(?<=\s)/)) if (w) words.push({ text: w, font: run.font.replace(/(\d+)px/, (_, n) => `${n * s}px`) });
  const lines = [];
  let line = [];
  let x = 0;
  for (const w of words) {
    ctx.font = w.font;
    const trimmed = w.text.trimEnd();
    const wide = ctx.measureText(trimmed).width;
    if (line.length && x + wide > width) {
      lines.push(line);
      line = [];
      x = 0;
      if (!trimmed) continue;
    }
    line.push({ text: w.text, font: w.font, x });
    x += ctx.measureText(w.text).width;
  }
  if (line.length) lines.push(line);
  return lines;
}

// The picture, as a JPEG data URL: the painting (an image or a data URL) framed above its label on the wall.
export async function labelledPicture(painting, label, doc = document) {
  const img = typeof painting === 'string' ? Object.assign(new Image(), { src: painting }) : painting;
  await img.decode();
  try {
    await Promise.race([
      Promise.all([`700 15px ${FONT}`, `400 15px ${FONT}`, `italic 500 15px ${FONT}`].map((f) => doc.fonts.load(f))),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch {
    /* whatever face is there */
  }
  const pw = img.naturalWidth;
  const ph = img.naturalHeight;
  // Sizes in units of the painting: the frame and the label keep the page's proportions whatever size the painting is.
  const u = pw / 600;
  const margin = Math.round(44 * u);
  const frame = Math.round(20 * u);
  const gap = Math.round(30 * u);
  const labelW = Math.round(Math.min(pw * 0.62, 340 * u));
  const pad = Math.round(20 * u);
  const ruleGap = Math.round(10 * u);

  const canvas = doc.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const items = parts(label).map((p) => ({ ...p, lines: layout(ctx, p, labelW - 2 * pad, u) }));
  const textH = items.reduce((h, p) => h + p.lines.length * p.lh * u + p.after * u + (p.rule ? 12 * u + ruleGap : 0), 0);
  const labelH = Math.round(textH + pad * 2 - 2 * u);

  const W = pw + 2 * (frame + margin);
  const H = margin + ph + 2 * frame + gap + labelH + margin;
  canvas.width = W;
  canvas.height = H;

  // The wall, with the gallery's warm light from above.
  ctx.fillStyle = WALL;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 0, 0, W / 2, 0, Math.max(W, H) * 0.7);
  glow.addColorStop(0, 'rgba(255, 226, 180, 0.12)');
  glow.addColorStop(1, 'rgba(255, 226, 180, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // The frame: dark wood with a lighter edge and an inner lip, casting a soft shadow down the wall.
  const fx = margin;
  const fy = margin;
  const fw = pw + 2 * frame;
  const fh = ph + 2 * frame;
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
  ctx.shadowBlur = 40 * u;
  ctx.shadowOffsetY = 22 * u;
  const wood = ctx.createLinearGradient(fx, fy, fx + fw, fy + fh);
  wood.addColorStop(0, '#3a2a1d');
  wood.addColorStop(0.55, '#20170f');
  wood.addColorStop(1, '#3a2a1d');
  ctx.fillStyle = wood;
  ctx.fillRect(fx, fy, fw, fh);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255, 220, 170, 0.12)';
  ctx.lineWidth = 2 * u;
  ctx.strokeRect(fx + u, fy + u, fw - 2 * u, fh - 2 * u);
  ctx.strokeStyle = '#2a1e14';
  ctx.lineWidth = 10 * u;
  ctx.strokeRect(fx + frame - 5 * u, fy + frame - 5 * u, pw + 10 * u, ph + 10 * u);
  ctx.drawImage(img, fx + frame, fy + frame, pw, ph);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.lineWidth = u;
  ctx.strokeRect(fx + frame - u / 2, fy + frame - u / 2, pw + u, ph + u);

  // The label, centered under the painting.
  const lx = Math.round((W - labelW) / 2);
  const ly = fy + fh + gap;
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
  ctx.shadowBlur = 24 * u;
  ctx.shadowOffsetY = 10 * u;
  ctx.fillStyle = LABEL;
  ctx.fillRect(lx, ly, labelW, labelH);
  ctx.restore();
  ctx.textBaseline = 'alphabetic';
  let y = ly + pad - 2 * u;
  for (const p of items) {
    if (p.rule) {
      y += 12 * u;
      ctx.fillStyle = 'rgba(31, 27, 23, 0.15)';
      ctx.fillRect(lx + pad, y, labelW - 2 * pad, Math.max(1, u));
      y += ruleGap;
    }
    ctx.fillStyle = p.color;
    for (const line of p.lines) {
      // The text sits in its line box the way the page sets it: the baseline about three quarters of the way down.
      const base = y + p.lh * u * 0.72;
      for (const run of line) {
        ctx.font = run.font;
        ctx.fillText(run.text, lx + pad + run.x, base);
      }
      y += p.lh * u;
    }
    y += p.after * u;
  }
  return canvas.toDataURL('image/jpeg', 0.92);
}
