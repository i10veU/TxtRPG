// V2-Core-158 (D-136): draws a picture that ui/art.js describes -- ink and wash on the page, in the light of the hour.
// Only the browser runs this file; what is drawn (and what may be) is decided in art.js, which is pure.
import { opsOf, paletteOf, seeded, ridgeLine } from "./art.js";

const parse = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const rgba = (hex, a) => `rgba(${parse(hex).join(", ")}, ${a})`;
const mix = (a, b, t) => {
  const [x, y] = [parse(a), parse(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
};
const lateNow = (band) => band === "dusk" || band === "night";

// paint(canvas, scene, { dark, paper }) -> whether it drew; `paper` is the page the picture dissolves into
export function paint(canvas, scene, { dark = false, paper = "#f4f5f1" } = {}) {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const ctx = w > 0 && h > 0 ? canvas.getContext("2d") : null;
  if (!ctx) return false;
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const g = { ctx, w, h, P: paletteOf(scene.band, dark), band: scene.band, dark, paper, orbX: 0.5 };
  for (const op of opsOf(scene)) {
    ctx.save();
    DRAW[op.op]?.(g, op);
    ctx.restore();
  }
  return true;
}

// --- small shapes ----------------------------------------------------------------------------------------------
function circle(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2);
  ctx.fill();
}
function glow(g, x, y, r, a = 0.55) {
  const { ctx, P } = g;
  const halo = ctx.createRadialGradient(x, y, 0, x, y, r);
  halo.addColorStop(0, rgba(P.lit, a));
  halo.addColorStop(1, rgba(P.lit, 0));
  ctx.fillStyle = halo;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
// a paper window: dark by day, lit when it is late and someone is home
function windowPane(g, x, y, s, lit) {
  const { ctx, P } = g;
  if (lit) {
    glow(g, x + s / 2, y + s / 2, s * 2.4, 0.45);
    ctx.fillStyle = P.lit;
  } else {
    ctx.fillStyle = mix(P.near, P.ink, 0.6);
  }
  ctx.fillRect(x, y, s, s);
  if (lit) {
    ctx.strokeStyle = rgba(P.ink, 0.55);
    ctx.lineWidth = Math.max(0.6, s * 0.08);
    ctx.beginPath();
    ctx.moveTo(x + s / 2, y);
    ctx.lineTo(x + s / 2, y + s);
    ctx.moveTo(x, y + s / 2);
    ctx.lineTo(x + s, y + s / 2);
    ctx.stroke();
  }
}
// a roof of tiles, its eaves lifted at the corners and its slopes drawn in; or a roof of thatch, round as a loaf
function roof(ctx, kind, x, eave, bw, bh) {
  ctx.beginPath();
  if (kind === "tile") {
    const over = bw * 0.62;
    const ridgeW = bw * 0.3;
    const top = eave - bh * 0.5;
    const lift = bh * 0.1;
    ctx.moveTo(x - over, eave - lift);
    ctx.quadraticCurveTo(x, eave + bh * 0.05, x + over, eave - lift);
    ctx.quadraticCurveTo(x + over * 0.52, eave - bh * 0.14, x + ridgeW, top + bh * 0.03);
    ctx.lineTo(x + ridgeW * 1.1, top - bh * 0.03);
    ctx.lineTo(x - ridgeW * 1.1, top - bh * 0.03);
    ctx.lineTo(x - ridgeW, top + bh * 0.03);
    ctx.quadraticCurveTo(x - over * 0.52, eave - bh * 0.14, x - over, eave - lift);
  } else {
    const top = eave - bh * 0.46;
    ctx.moveTo(x - bw * 0.54, eave + bh * 0.03);
    ctx.bezierCurveTo(x - bw * 0.52, top + bh * 0.12, x - bw * 0.24, top, x, top);
    ctx.bezierCurveTo(x + bw * 0.24, top, x + bw * 0.52, top + bh * 0.12, x + bw * 0.54, eave + bh * 0.03);
  }
  ctx.closePath();
  ctx.fill();
}
function figure(ctx, x, base, s, color) {
  ctx.fillStyle = color;
  circle(ctx, x, base - s * 0.86, s * 0.11);
  ctx.beginPath();
  ctx.moveTo(x - s * 0.1, base - s * 0.74);
  ctx.quadraticCurveTo(x - s * 0.2, base - s * 0.3, x - s * 0.17, base);
  ctx.lineTo(x + s * 0.17, base);
  ctx.quadraticCurveTo(x + s * 0.2, base - s * 0.3, x + s * 0.1, base - s * 0.74);
  ctx.closePath();
  ctx.fill();
}
function pine(ctx, x, base, height, color, r) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, height * 0.03);
  ctx.beginPath();
  ctx.moveTo(x, base);
  ctx.lineTo(x, base - height * 0.98);
  ctx.stroke();
  const tiers = 4 + Math.floor(r() * 3);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let t = 0; t < tiers; t += 1) {
    const yb = base - height * (0.16 + (0.8 * t) / tiers);
    const half = height * 0.3 * (1 - t / (tiers + 0.8)) * (0.8 + r() * 0.4);
    const yt = yb - height * (0.26 + r() * 0.08);
    const lean = (r() - 0.5) * half * 0.3;
    ctx.moveTo(x - half, yb);
    ctx.quadraticCurveTo(x - half * 0.25, yb - height * 0.05, x + lean, yt);
    ctx.quadraticCurveTo(x + half * 0.25, yb - height * 0.05, x + half, yb);
    ctx.closePath();
  }
  ctx.fill();
}
function roundTree(ctx, x, base, height, color, r) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, height * 0.05);
  ctx.beginPath();
  ctx.moveTo(x, base);
  ctx.quadraticCurveTo(x + height * 0.04, base - height * 0.3, x, base - height * 0.55);
  ctx.stroke();
  ctx.fillStyle = color;
  const cy = base - height * 0.66;
  const cr = height * 0.3;
  const blobs = 4 + Math.floor(r() * 3);
  for (let i = 0; i < blobs; i += 1) {
    const a = (i / blobs) * Math.PI * 2 + r();
    circle(ctx, x + Math.cos(a) * cr * 0.55, cy + Math.sin(a) * cr * 0.4, cr * (0.5 + r() * 0.3));
  }
  circle(ctx, x, cy - cr * 0.15, cr * 0.7);
}
function deadTree(ctx, x, base, height, color, r) {
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  const branch = (x0, y0, len, angle, width, depth) => {
    const x1 = x0 + Math.cos(angle) * len;
    const y1 = y0 + Math.sin(angle) * len;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    if (depth > 0) {
      branch(x1, y1, len * 0.62, angle - 0.5 - r() * 0.3, width * 0.6, depth - 1);
      branch(x1, y1, len * 0.58, angle + 0.45 + r() * 0.3, width * 0.6, depth - 1);
    }
  };
  branch(x, base, height * 0.45, -Math.PI / 2 + (r() - 0.5) * 0.2, Math.max(1.5, height * 0.06), 3);
}

// --- the layers ------------------------------------------------------------------------------------------------
const DRAW = {
  sky(g) {
    const { ctx, w, h, P } = g;
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, P.skyTop);
    grad.addColorStop(0.6, P.skyLow);
    grad.addColorStop(1, P.horizon);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  },
  stars(g, o) {
    const { ctx, w, h, P } = g;
    const r = seeded(o.seed);
    ctx.fillStyle = P.orb;
    for (let i = 0; i < o.n; i += 1) {
      ctx.globalAlpha = 0.25 + r() * 0.6;
      circle(ctx, r() * w, r() * h * 0.55, r() < 0.12 ? 1.1 : 0.6);
    }
  },
  sun(g, o) {
    const { ctx, w, h, P } = g;
    const [x, y, rad] = [o.x * w, o.y * h, o.r * h];
    g.orbX = o.x;
    const halo = ctx.createRadialGradient(x, y, rad * 0.4, x, y, rad * (o.low ? 7 : 5));
    halo.addColorStop(0, rgba(P.orb, o.low ? 0.6 : 0.45));
    halo.addColorStop(1, rgba(P.orb, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = o.low ? 0.95 : 0.85;
    ctx.fillStyle = P.orb;
    circle(ctx, x, y, rad);
  },
  moon(g, o) {
    const { ctx, w, h, P } = g;
    const [x, y, rad] = [o.x * w, o.y * h, o.r * h];
    g.orbX = o.x;
    const halo = ctx.createRadialGradient(x, y, rad, x, y, rad * 6);
    halo.addColorStop(0, rgba(P.orb, 0.22));
    halo.addColorStop(1, rgba(P.orb, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = P.orb;
    circle(ctx, x, y, rad);
    ctx.fillStyle = rgba(P.skyTop, 0.16);
    circle(ctx, x - rad * 0.3, y - rad * 0.15, rad * 0.28);
    circle(ctx, x + rad * 0.25, y + rad * 0.3, rad * 0.18);
  },
  ridge(g, o) {
    const { ctx, w, h, P } = g;
    const line = ridgeLine(o.seed, o.rough);
    const color = P[o.tone];
    const points = [];
    for (let i = 0; i <= 120; i += 1) points.push([(i / 120) * w, (o.base - o.amp * line(i / 120)) * h]);
    ctx.beginPath();
    ctx.moveTo(0, h);
    points.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.lineTo(w, h);
    ctx.closePath();
    // the wash: full at the crest, paler towards the foot, where the mist between the hills lies
    const grad = ctx.createLinearGradient(0, (o.base - o.amp) * h, 0, Math.min(h, (o.base + 0.14) * h));
    grad.addColorStop(0, color);
    grad.addColorStop(1, mix(color, P.skyLow, o.tone === "near" ? 0.08 : o.tone === "mid" ? 0.3 : 0.45));
    ctx.fillStyle = grad;
    ctx.fill();
    // a dry brush along the crest
    ctx.strokeStyle = rgba(P.ink, o.tone === "far" ? 0.12 : 0.22);
    ctx.lineWidth = o.tone === "far" ? 0.8 : 1.1;
    ctx.beginPath();
    points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
  },
  mist(g, o) {
    const { ctx, w, h, P } = g;
    const [y, half] = [o.y * h, (o.h * h) / 2];
    const grad = ctx.createLinearGradient(0, y - half, 0, y + half);
    grad.addColorStop(0, rgba(P.mist, 0));
    grad.addColorStop(0.5, rgba(P.mist, P.mistA));
    grad.addColorStop(1, rgba(P.mist, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(0, y - half, w, half * 2);
  },
  ground(g, o) {
    const { ctx, w, h, P } = g;
    const line = ridgeLine(o.seed, 3);
    const color = P[o.tone];
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i <= 80; i += 1) ctx.lineTo((i / 80) * w, (o.y - (o.flat ? 0.004 : 0.03) * line(i / 80)) * h);
    ctx.lineTo(w, h);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, o.y * h, 0, h);
    grad.addColorStop(0, color);
    grad.addColorStop(1, mix(color, P.ink, 0.35));
    ctx.fillStyle = grad;
    ctx.fill();
    // grass along the edge
    const r = seeded(`${o.seed}:grass`);
    ctx.strokeStyle = rgba(P.ink, 0.28);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let i = 0; i < 60; i += 1) {
      const x = r() * w;
      const y = (o.y - (o.flat ? 0.004 : 0.03) * line(x / w)) * h + r() * h * 0.06;
      ctx.moveTo(x, y);
      ctx.lineTo(x + (r() - 0.5) * 3, y - 2 - r() * 4);
    }
    ctx.stroke();
  },
  trees(g, o) {
    const { ctx, w, h, P } = g;
    const r = seeded(o.seed);
    const color = P[o.tone];
    for (let i = 0; i < o.n; i += 1) {
      const x = o.n === 1 ? (o.x0 + o.x1) / 2 : o.x0 + ((o.x1 - o.x0) * (i + 0.15 + r() * 0.7)) / o.n;
      const height = o.size * (0.75 + r() * 0.5) * h;
      const base = (o.base + (r() - 0.5) * 0.02) * h;
      if (o.kind === "pine") pine(ctx, x * w, base, height, color, r);
      else if (o.kind === "dead") deadTree(ctx, x * w, base, height, color, r);
      else roundTree(ctx, x * w, base, height, color, r);
    }
  },
  house(g, o) {
    const { ctx, w, h, P, band } = g;
    const [x, base, bw, bh] = [o.x * w, o.base * h, o.w * w, o.h * h];
    const color = P[o.tone ?? "near"];
    const far = o.tone === "mid";
    const plaster = mix(color, P.horizon, far ? 0.16 : 0.3);
    const roofColor = o.roof === "tile" ? mix(color, P.ink, far ? 0.3 : 0.55) : mix(color, "#8c7a52", g.dark ? 0.14 : 0.32);
    const wallH = bh * 0.5;
    const wallW = bw * 0.8;
    ctx.fillStyle = mix(color, P.ink, 0.3);
    ctx.fillRect(x - wallW * 0.56, base - bh * 0.06, wallW * 1.12, bh * 0.06);
    ctx.fillStyle = plaster;
    ctx.fillRect(x - wallW / 2, base - wallH, wallW, wallH - bh * 0.05);
    ctx.fillStyle = roofColor;
    ctx.fillRect(x - wallW / 2, base - wallH, Math.max(1, bw * 0.025), wallH - bh * 0.05);
    ctx.fillRect(x + wallW / 2 - Math.max(1, bw * 0.025), base - wallH, Math.max(1, bw * 0.025), wallH - bh * 0.05);
    ctx.fillStyle = roofColor;
    if (o.broken) {
      // a roof burnt through: what is left of it, and the beams
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x - bw, base - bh * 2);
      ctx.lineTo(x + bw * 0.05, base - bh * 2);
      ctx.lineTo(x - bw * 0.06, base - bh * 0.78);
      ctx.lineTo(x + bw * 0.12, base - bh * 0.68);
      ctx.lineTo(x - bw * 0.02, base - wallH);
      ctx.lineTo(x - bw, base - wallH);
      ctx.closePath();
      ctx.clip();
      roof(ctx, o.roof, x, base - wallH + bh * 0.04, bw, bh);
      ctx.restore();
      ctx.strokeStyle = mix(roofColor, P.ink, 0.5);
      ctx.lineWidth = Math.max(1, bw * 0.025);
      ctx.beginPath();
      ctx.moveTo(x + bw * 0.08, base - wallH);
      ctx.lineTo(x + bw * 0.3, base - bh * 0.9);
      ctx.moveTo(x + bw * 0.2, base - wallH);
      ctx.lineTo(x + bw * 0.38, base - bh * 0.72);
      ctx.stroke();
    } else {
      roof(ctx, o.roof, x, base - wallH + bh * 0.04, bw, bh);
      if (o.roof === "thatch") {
        // the ropes over the thatch
        ctx.strokeStyle = rgba(P.ink, 0.25);
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        for (let i = 1; i <= 3; i += 1) {
          const y = base - wallH - bh * 0.1 * i;
          const half = bw * (0.5 - 0.09 * i);
          ctx.moveTo(x - half, y + bh * 0.03);
          ctx.quadraticCurveTo(x, y - bh * 0.02, x + half, y + bh * 0.03);
        }
        ctx.stroke();
      }
    }
    // the door, and the windows -- lit when it is late, someone is home and the house still stands
    ctx.fillStyle = mix(roofColor, P.ink, 0.5);
    ctx.fillRect(x - bw * 0.06, base - wallH * 0.72, bw * 0.12, wallH * 0.72);
    const lit = Boolean(o.lit) && !o.broken && lateNow(band);
    const pane = Math.max(2, Math.min(bw * 0.11, wallH * 0.36));
    windowPane(g, x - wallW * 0.34, base - wallH * 0.74, pane, lit);
    windowPane(g, x + wallW * 0.34 - pane, base - wallH * 0.74, pane, lit && o.roof === "tile");
  },
  wall(g, o) {
    const { ctx, w, h, P } = g;
    const [x0, x1, base, wh] = [o.x0 * w, o.x1 * w, o.base * h, o.h * h];
    ctx.fillStyle = mix(P.near, P.mid, 0.25);
    ctx.fillRect(x0, base - wh, x1 - x0, wh);
    // the tiled cap, and stones in the clay
    ctx.fillStyle = P.ink;
    ctx.fillRect(x0 - 2, base - wh - wh * 0.3, x1 - x0 + 4, wh * 0.32);
    const r = seeded("wall");
    ctx.fillStyle = rgba(P.ink, 0.22);
    for (let x = x0 + 4; x < x1 - 4; x += 7 + r() * 9) circle(ctx, x, base - wh * (0.25 + r() * 0.5), wh * (0.1 + r() * 0.08));
    if (o.gate !== undefined) {
      // the gate: an opening, two posts and a small roof of tiles over them
      const gx = o.gate * w;
      const gw = wh * 1.5;
      ctx.fillStyle = mix(P.near, P.ink, 0.25);
      ctx.fillRect(gx - gw / 2, base - wh, gw, wh);
      ctx.fillStyle = P.ink;
      ctx.fillRect(gx - gw / 2 - wh * 0.12, base - wh * 1.9, wh * 0.18, wh * 1.9);
      ctx.fillRect(gx + gw / 2 - wh * 0.06, base - wh * 1.9, wh * 0.18, wh * 1.9);
      roof(ctx, "tile", gx, base - wh * 1.75, gw * 1.3, wh * 1.3);
    }
  },
  well(g, o) {
    const { ctx, w, h, P } = g;
    const [x, base, s] = [o.x * w, o.base * h, o.s * h];
    ctx.fillStyle = P.ink;
    ctx.strokeStyle = P.ink;
    ctx.lineWidth = Math.max(1.2, s * 0.06);
    ctx.beginPath();
    ctx.moveTo(x - s * 0.55, base - s * 0.95);
    ctx.lineTo(x - s * 0.55, base - s * 0.3);
    ctx.moveTo(x + s * 0.55, base - s * 0.95);
    ctx.lineTo(x + s * 0.55, base - s * 0.3);
    ctx.moveTo(x - s * 0.7, base - s * 0.95);
    ctx.lineTo(x + s * 0.7, base - s * 0.95);
    ctx.moveTo(x + s * 0.1, base - s * 0.95);
    ctx.lineTo(x + s * 0.1, base - s * 0.62);
    ctx.stroke();
    ctx.fillRect(x - s * 0.02, base - s * 0.62, s * 0.24, s * 0.16);
    // the stone rim, pale against the ground
    ctx.fillStyle = mix(P.near, P.horizon, 0.36);
    ctx.fillRect(x - s * 0.68, base - s * 0.34, s * 1.36, s * 0.24);
    ctx.beginPath();
    ctx.ellipse(x, base - s * 0.12, s * 0.68, s * 0.12, 0, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = mix(P.near, P.ink, 0.5);
    ctx.beginPath();
    ctx.ellipse(x, base - s * 0.34, s * 0.62, s * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgba(P.ink, 0.35);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let i = -2; i <= 2; i += 1) {
      ctx.moveTo(x + i * s * 0.26, base - s * 0.32);
      ctx.lineTo(x + i * s * 0.26, base - s * 0.1);
    }
    ctx.stroke();
  },
  figure(g, o) {
    figure(g.ctx, o.x * g.w, o.base * g.h, o.s * g.h, g.P.ink);
  },
  stall(g, o) {
    const { ctx, w, h, P, band } = g;
    const [x, base, sw, sh] = [o.x * w, o.base * h, o.w * w, o.h * h];
    const r = seeded(o.seed);
    ctx.strokeStyle = P.ink;
    ctx.lineWidth = Math.max(1, sw * 0.02);
    ctx.beginPath();
    ctx.moveTo(x - sw * 0.42, base);
    ctx.lineTo(x - sw * 0.42, base - sh);
    ctx.moveTo(x + sw * 0.42, base);
    ctx.lineTo(x + sw * 0.42, base - sh);
    ctx.stroke();
    // the awning, a cloth that hangs in scallops
    ctx.fillStyle = mix(P.mid, P.lit, 0.18 + r() * 0.12);
    ctx.beginPath();
    ctx.moveTo(x - sw * 0.5, base - sh * 0.82);
    ctx.lineTo(x - sw * 0.38, base - sh * 1.08);
    ctx.lineTo(x + sw * 0.38, base - sh * 1.08);
    ctx.lineTo(x + sw * 0.5, base - sh * 0.82);
    const folds = 5;
    for (let i = folds; i > 0; i -= 1) {
      const xa = x - sw * 0.5 + (sw * i) / folds;
      ctx.quadraticCurveTo(xa - sw / folds / 2, base - sh * 0.72, xa - sw / folds, base - sh * 0.82);
    }
    ctx.closePath();
    ctx.fill();
    // the table and what is on it
    ctx.fillStyle = P.ink;
    ctx.fillRect(x - sw * 0.4, base - sh * 0.36, sw * 0.8, sh * 0.06);
    for (let i = 0; i < 4; i += 1) {
      const jx = x - sw * 0.3 + i * sw * 0.2 + (r() - 0.5) * sw * 0.05;
      const jr = sh * (0.06 + r() * 0.05);
      ctx.beginPath();
      ctx.ellipse(jx, base - sh * 0.36 - jr, jr * 0.8, jr, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (lateNow(band)) {
      glow(g, x + sw * 0.3, base - sh * 0.7, sh * 0.7, 0.5);
      ctx.fillStyle = P.lit;
      circle(ctx, x + sw * 0.3, base - sh * 0.7, sh * 0.06);
    }
  },
  arch(g, o) {
    const { ctx, w, h, P } = g;
    const [x, base, aw, ah] = [o.x * w, o.base * h, o.w * w, o.h * h];
    ctx.save();
    if (o.broken) {
      ctx.beginPath();
      ctx.moveTo(x - aw, base);
      ctx.lineTo(x - aw, base - ah * 1.2);
      ctx.lineTo(x - aw * 0.1, base - ah * 1.2);
      ctx.lineTo(x + aw * 0.05, base - ah * 0.78);
      ctx.lineTo(x + aw * 0.22, base - ah * 0.86);
      ctx.lineTo(x + aw * 0.3, base - ah * 0.55);
      ctx.lineTo(x + aw, base - ah * 0.5);
      ctx.lineTo(x + aw, base);
      ctx.closePath();
      ctx.clip();
    }
    ctx.fillStyle = mix(P.near, P.mid, 0.15);
    ctx.beginPath();
    ctx.rect(x - aw / 2, base - ah, aw, ah);
    const inner = aw * 0.3;
    ctx.moveTo(x - inner, base);
    ctx.lineTo(x - inner, base - ah * 0.52);
    ctx.arc(x, base - ah * 0.52, inner, Math.PI, 0);
    ctx.lineTo(x + inner, base);
    ctx.closePath();
    ctx.fill("evenodd");
    // the courses of stone
    ctx.strokeStyle = rgba(P.ink, 0.3);
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (let y = base - ah * 0.15; y > base - ah; y -= ah * 0.16) {
      ctx.moveTo(x - aw / 2, y);
      ctx.lineTo(x - inner, y);
      ctx.moveTo(x + inner, y);
      ctx.lineTo(x + aw / 2, y);
    }
    ctx.stroke();
    ctx.restore();
  },
  wheel(g, o) {
    const { ctx, w, h, P } = g;
    const [x, base, rad] = [o.x * w, o.base * h, o.r * h];
    const cy = base - rad;
    ctx.strokeStyle = P.ink;
    ctx.fillStyle = P.ink;
    ctx.lineWidth = Math.max(1.5, rad * 0.07);
    ctx.beginPath();
    ctx.arc(x, cy, rad, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = Math.max(1, rad * 0.045);
    ctx.beginPath();
    ctx.arc(x, cy, rad * 0.74, 0, Math.PI * 2);
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      ctx.moveTo(x, cy);
      ctx.lineTo(x + Math.cos(a) * rad * 0.74, cy + Math.sin(a) * rad * 0.74);
    }
    ctx.stroke();
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * Math.PI * 2;
      ctx.save();
      ctx.translate(x + Math.cos(a) * rad, cy + Math.sin(a) * rad);
      ctx.rotate(a);
      ctx.fillRect(-rad * 0.02, -rad * 0.09, rad * 0.15, rad * 0.18);
      ctx.restore();
    }
    circle(ctx, x, cy, rad * 0.1);
    // the flume on its posts, and the water falling from it onto the paddles
    const fy = cy - rad * 1.08;
    ctx.beginPath();
    ctx.moveTo(x - rad * 2.1, fy - rad * 0.22);
    ctx.lineTo(x - rad * 0.02, fy);
    ctx.lineTo(x - rad * 0.02, fy + rad * 0.1);
    ctx.lineTo(x - rad * 2.1, fy - rad * 0.12);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = Math.max(1, rad * 0.045);
    ctx.beginPath();
    ctx.moveTo(x - rad * 1.5, fy - rad * 0.08);
    ctx.lineTo(x - rad * 1.62, fy + rad * 0.55);
    ctx.moveTo(x - rad * 0.9, fy);
    ctx.lineTo(x - rad * 0.8, fy + rad * 0.5);
    ctx.stroke();
    ctx.strokeStyle = rgba(P.shine, 0.7);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < 4; i += 1) {
      ctx.moveTo(x - rad * 0.08 + i * 2, fy + rad * 0.1);
      ctx.quadraticCurveTo(x + rad * 0.05 + i * 2, fy + rad * 0.3, x + rad * 0.12 + i * 2, fy + rad * 0.55);
    }
    ctx.stroke();
  },
  rocks(g, o) {
    const { ctx, w, h, P } = g;
    const r = seeded(o.seed);
    ctx.fillStyle = mix(P.near, P.ink, 0.4);
    for (let i = 0; i < o.n; i += 1) {
      const x = (o.x0 + (o.x1 - o.x0) * r()) * w;
      const s = h * (0.02 + r() * 0.03);
      ctx.beginPath();
      ctx.ellipse(x, o.base * h - s * 0.4, s * (1.2 + r()), s, (r() - 0.5) * 0.4, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
    }
  },
  reeds(g, o) {
    const { ctx, w, h, P } = g;
    const r = seeded(o.seed);
    ctx.strokeStyle = P.near;
    ctx.fillStyle = P.near;
    ctx.lineWidth = 1;
    for (let i = 0; i < 14; i += 1) {
      const x = (o.x0 + (o.x1 - o.x0) * r()) * w;
      const tall = h * (0.1 + r() * 0.12);
      const bend = (r() - 0.5) * tall * 0.5;
      ctx.beginPath();
      ctx.moveTo(x, o.base * h);
      ctx.quadraticCurveTo(x, o.base * h - tall * 0.6, x + bend, o.base * h - tall);
      ctx.stroke();
      if (r() < 0.5) {
        ctx.beginPath();
        ctx.ellipse(x + bend, o.base * h - tall, 1.2, 3.2, bend * 0.02, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  },
  pool(g, o) {
    const { ctx, w, h, P } = g;
    const [x, y, rx, ry] = [o.x * w, o.y * h, o.rx * w, o.ry * h];
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    if (o.clear) {
      const grad = ctx.createLinearGradient(0, y - ry, 0, y + ry);
      grad.addColorStop(0, g.band === "night" ? mix(P.shine, P.water, 0.55) : P.shine);
      grad.addColorStop(1, P.water);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = rgba(P.shine, 0.8);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < 3; i += 1) {
        ctx.moveTo(x - rx * (0.5 - i * 0.12), y + ry * (i * 0.25 - 0.1));
        ctx.lineTo(x + rx * (0.3 - i * 0.1), y + ry * (i * 0.25 - 0.1));
      }
      ctx.stroke();
    } else {
      // fouled: dull and still, nothing shines in it but a sickly sheen
      ctx.fillStyle = mix(P.water, "#5d5a3c", g.dark ? 0.4 : 0.55);
      ctx.fill();
      ctx.strokeStyle = rgba(mix(P.shine, "#8a8654", 0.5), 0.45);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - rx * 0.4, y - ry * 0.2);
      ctx.lineTo(x + rx * 0.1, y - ry * 0.2);
      ctx.stroke();
      const r = seeded("pool:scum");
      ctx.fillStyle = rgba(P.ink, 0.3);
      for (let i = 0; i < 12; i += 1) circle(ctx, x + (r() - 0.5) * rx * 1.4, y + (r() - 0.5) * ry * 1.1, 1 + r() * 1.8);
    }
    ctx.strokeStyle = rgba(P.ink, 0.45);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  },
  river(g, o) {
    const { ctx, w, h, P, band } = g;
    const [y0, y1] = [o.y0 * h, o.y1 * h];
    const grad = ctx.createLinearGradient(0, y0, 0, y1);
    grad.addColorStop(0, mix(P.water, P.shine, 0.35));
    grad.addColorStop(1, mix(P.water, P.ink, 0.2));
    ctx.fillStyle = grad;
    ctx.fillRect(0, y0, w, y1 - y0);
    // the light on the water: long strokes, and the sun's or moon's road under it
    const r = seeded(o.seed);
    ctx.strokeStyle = rgba(P.shine, band === "night" ? 0.3 : 0.55);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 26; i += 1) {
      const y = y0 + (y1 - y0) * r();
      const x = r() * w;
      const len = w * (0.03 + r() * 0.08) * (0.5 + (y - y0) / (y1 - y0));
      ctx.moveTo(x, y);
      ctx.lineTo(x + len, y);
    }
    ctx.stroke();
    ctx.strokeStyle = rgba(P.orb, band === "night" ? 0.55 : 0.4);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let y = y0 + 3; y < y1; y += 4 + r() * 3) {
      const spread = 6 + ((y - y0) / (y1 - y0)) * w * 0.05;
      const cx = g.orbX * w + (r() - 0.5) * 4;
      ctx.moveTo(cx - spread * r(), y);
      ctx.lineTo(cx + spread * r(), y);
    }
    ctx.stroke();
  },
  posts(g, o) {
    const { ctx, w, h, P } = g;
    ctx.strokeStyle = P.ink;
    ctx.lineWidth = Math.max(1.5, h * 0.012);
    ctx.beginPath();
    for (let i = 0; i < 4; i += 1) {
      const x = (o.x0 + ((o.x1 - o.x0) * i) / 3) * w;
      ctx.moveTo(x, o.base * h);
      ctx.lineTo(x, (o.base - o.h * (0.7 + (i % 2) * 0.3)) * h);
    }
    ctx.moveTo(o.x0 * w - 4, (o.base - o.h * 0.55) * h);
    ctx.lineTo(o.x1 * w + 4, (o.base - o.h * 0.55) * h);
    ctx.stroke();
  },
  boat(g, o) {
    const { ctx, w, h, P, band } = g;
    const [x, base, s] = [o.x * w, o.base * h, o.s * h];
    const len = s * 2.6;
    ctx.fillStyle = P.ink;
    ctx.beginPath();
    ctx.moveTo(x - len / 2, base - s * 0.16);
    ctx.quadraticCurveTo(x - len * 0.3, base + s * 0.12, x, base + s * 0.12);
    ctx.quadraticCurveTo(x + len * 0.34, base + s * 0.12, x + len / 2, base - s * 0.24);
    ctx.lineTo(x + len * 0.42, base - s * 0.06);
    ctx.lineTo(x - len * 0.44, base - s * 0.04);
    ctx.closePath();
    ctx.fill();
    if (o.rower) {
      figure(ctx, x - len * 0.28, base - s * 0.04, s * 0.62, P.ink);
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = Math.max(1, s * 0.035);
      ctx.beginPath();
      ctx.moveTo(x - len * 0.42, base - s * 0.7);
      ctx.lineTo(x - len * 0.06, base + s * 0.5);
      ctx.stroke();
    }
    if (o.lantern) {
      const [lx, ly] = [x + len * 0.36, base - s * 0.5];
      ctx.strokeStyle = P.ink;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + len * 0.34, base - s * 0.1);
      ctx.lineTo(lx, ly - s * 0.08);
      ctx.stroke();
      if (lateNow(band)) {
        glow(g, lx, ly, s * 0.9, 0.6);
        ctx.fillStyle = P.lit;
        circle(ctx, lx, ly, s * 0.07);
        ctx.strokeStyle = rgba(P.lit, 0.5);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i = 1; i <= 4; i += 1) {
          ctx.moveTo(lx - 4 - i, base + s * 0.12 * i + 2);
          ctx.lineTo(lx + 4 + i, base + s * 0.12 * i + 2);
        }
        ctx.stroke();
      } else {
        ctx.fillStyle = P.ink;
        ctx.fillRect(lx - s * 0.05, ly - s * 0.06, s * 0.1, s * 0.12);
      }
    }
  },
  road(g, o) {
    const { ctx, w, h, P } = g;
    const [[ax, ay], [bx, by]] = [o.from, o.to];
    const dx = (bx - ax) * w;
    const dy = (by - ay) * h;
    const len = Math.hypot(dx, dy) || 1;
    const [nx, ny] = [-dy / len, dx / len];
    const [h0, h1] = [(o.w0 * w) / 2, (o.w1 * w) / 2];
    ctx.fillStyle = mix(P.near, P.horizon, 0.32);
    ctx.beginPath();
    ctx.moveTo(ax * w + nx * h0, ay * h + ny * h0);
    ctx.lineTo(bx * w + nx * h1, by * h + ny * h1);
    ctx.lineTo(bx * w - nx * h1, by * h - ny * h1);
    ctx.lineTo(ax * w - nx * h0, ay * h - ny * h0);
    ctx.closePath();
    ctx.fill();
  },
  signpost(g, o) {
    const { ctx, w, h, P } = g;
    const [x, base, s] = [o.x * w, o.base * h, o.s * h];
    ctx.fillStyle = P.ink;
    ctx.fillRect(x - s * 0.035, base - s, s * 0.07, s);
    const arm = (y, dir, tilt) => {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + dir * s * 0.46, y + tilt);
      ctx.lineTo(x + dir * s * 0.54, y + tilt + s * 0.06);
      ctx.lineTo(x + dir * s * 0.46, y + tilt + s * 0.12);
      ctx.lineTo(x, y + s * 0.12);
      ctx.closePath();
      ctx.fill();
    };
    arm(base - s * 0.9, -1, -s * 0.04);
    arm(base - s * 0.68, 1, s * 0.02);
  },
  board(g, o) {
    const { ctx, w, h, P } = g;
    const [x, base, s] = [o.x * w, o.base * h, o.s * h];
    ctx.fillStyle = P.ink;
    ctx.fillRect(x - s * 0.5, base - s * 0.95, s * 0.06, s * 0.95);
    ctx.fillRect(x + s * 0.44, base - s * 0.95, s * 0.06, s * 0.95);
    ctx.fillRect(x - s * 0.5, base - s * 0.9, s, s * 0.46);
    roof(ctx, "tile", x, base - s * 0.92, s * 1.05, s * 0.36);
    // the notices pinned to it
    ctx.fillStyle = mix(P.shine, P.mid, 0.25);
    ctx.fillRect(x - s * 0.4, base - s * 0.84, s * 0.22, s * 0.3);
    ctx.fillRect(x - s * 0.12, base - s * 0.8, s * 0.2, s * 0.24);
    ctx.fillRect(x + s * 0.14, base - s * 0.85, s * 0.22, s * 0.32);
  },
  castle(g, o) {
    const { ctx, w, h, P, band } = g;
    const [x0, x1, base, ch, gx] = [o.x0 * w, o.x1 * w, o.base * h, o.h * h, o.gate * w];
    const color = mix(P.near, P.mid, 0.2);
    ctx.fillStyle = color;
    ctx.fillRect(x0, base - ch, x1 - x0, ch);
    // battlements
    const merlon = Math.max(6, ch * 0.22);
    for (let x = x0; x < x1 - merlon * 0.5; x += merlon * 1.8) ctx.fillRect(x, base - ch - merlon * 0.6, merlon, merlon * 0.6);
    // the gate, and the gatehouse over it
    ctx.fillStyle = P.ink;
    ctx.beginPath();
    ctx.moveTo(gx - ch * 0.32, base);
    ctx.lineTo(gx - ch * 0.32, base - ch * 0.5);
    ctx.arc(gx, base - ch * 0.5, ch * 0.32, Math.PI, 0);
    ctx.lineTo(gx + ch * 0.32, base);
    ctx.closePath();
    ctx.fill();
    if (lateNow(band)) glow(g, gx, base - ch * 0.3, ch * 0.9, 0.35);
    ctx.fillStyle = mix(color, P.ink, 0.35);
    ctx.fillRect(gx - ch * 0.75, base - ch * 1.45, ch * 1.5, ch * 0.45);
    roof(ctx, "tile", gx, base - ch * 1.4, ch * 1.9, ch * 0.8);
    // the stones
    ctx.strokeStyle = rgba(P.ink, 0.2);
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (let y = base - ch * 0.25; y > base - ch; y -= ch * 0.25) {
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
    }
    ctx.stroke();
  },
  tower(g, o) {
    const { ctx, w, h, P, band } = g;
    const [x, base, tw, th] = [o.x * w, o.base * h, o.w * w, o.h * h];
    const color = mix(P.near, P.mid, 0.3);
    ctx.fillStyle = color;
    const step = th / (o.tiers + 0.6);
    for (let t = 0; t < o.tiers; t += 1) {
      const width = tw * (1 - t * 0.16);
      const yb = base - step * t;
      ctx.fillStyle = color;
      ctx.fillRect(x - width * 0.4, yb - step * 0.7, width * 0.8, step * 0.7);
      roof(ctx, "tile", x, yb - step * 0.66, width * 1.25, step * 0.75);
      windowPane(g, x - width * 0.1, yb - step * 0.5, Math.max(2, width * 0.18), lateNow(band) && t === 0);
    }
  },
  palace(g, o) {
    const { ctx, w, h, P, band } = g;
    const [x, base, pw, ph] = [o.x * w, o.base * h, o.w * w, o.h * h];
    const color = mix(P.near, P.mid, 0.25);
    // the stone terrace, the hall, two roofs one over the other
    ctx.fillStyle = mix(color, P.ink, 0.2);
    ctx.fillRect(x - pw * 0.5, base - ph * 0.12, pw, ph * 0.12);
    ctx.fillStyle = color;
    ctx.fillRect(x - pw * 0.36, base - ph * 0.5, pw * 0.72, ph * 0.38);
    roof(ctx, "tile", x, base - ph * 0.48, pw * 0.95, ph * 0.42);
    ctx.fillRect(x - pw * 0.22, base - ph * 0.82, pw * 0.44, ph * 0.18);
    roof(ctx, "tile", x, base - ph * 0.8, pw * 0.62, ph * 0.36);
    for (let i = -2; i <= 2; i += 1) windowPane(g, x + i * pw * 0.12 - pw * 0.02, base - ph * 0.36, Math.max(2, pw * 0.04), lateNow(band) && i !== 0);
  },
  banner(g, o) {
    const { ctx, w, h, P } = g;
    const [x, base, bh] = [o.x * w, o.base * h, o.h * h];
    ctx.strokeStyle = P.ink;
    ctx.lineWidth = Math.max(1, bh * 0.03);
    ctx.beginPath();
    ctx.moveTo(x, base);
    ctx.lineTo(x, base - bh);
    ctx.stroke();
    ctx.fillStyle = P.banner;
    ctx.beginPath();
    ctx.moveTo(x, base - bh);
    ctx.quadraticCurveTo(x + bh * 0.22, base - bh * 1.02, x + bh * 0.42, base - bh * 0.96);
    ctx.lineTo(x + bh * 0.34, base - bh * 0.84);
    ctx.lineTo(x + bh * 0.42, base - bh * 0.72);
    ctx.quadraticCurveTo(x + bh * 0.2, base - bh * 0.76, x, base - bh * 0.7);
    ctx.closePath();
    ctx.fill();
  },
  tent(g, o) {
    const { ctx, w, h, P, band } = g;
    const [x, base, tw, th] = [o.x * w, o.base * h, o.w * w, o.h * h];
    ctx.fillStyle = mix(P.near, P.mid, 0.2);
    ctx.beginPath();
    ctx.moveTo(x - tw / 2, base);
    ctx.quadraticCurveTo(x - tw * 0.2, base - th * 0.55, x, base - th);
    ctx.quadraticCurveTo(x + tw * 0.2, base - th * 0.55, x + tw / 2, base);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = lateNow(band) ? P.lit : P.ink;
    if (lateNow(band)) glow(g, x, base - th * 0.2, th * 0.6, 0.3);
    ctx.beginPath();
    ctx.moveTo(x - tw * 0.08, base);
    ctx.lineTo(x, base - th * 0.5);
    ctx.lineTo(x + tw * 0.08, base);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = P.ink;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, base - th);
    ctx.lineTo(x, base - th * 1.12);
    ctx.stroke();
  },
  fire(g, o) {
    const { ctx, w, h, P, band } = g;
    const [x, base] = [o.x * w, o.base * h];
    const s = h * 0.06;
    if (lateNow(band)) {
      glow(g, x, base - s * 0.5, s * 5, 0.5);
      ctx.fillStyle = P.lit;
      ctx.beginPath();
      ctx.moveTo(x - s * 0.5, base);
      ctx.quadraticCurveTo(x - s * 0.4, base - s * 0.8, x, base - s * 1.4);
      ctx.quadraticCurveTo(x + s * 0.4, base - s * 0.8, x + s * 0.5, base);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = P.ink;
    ctx.lineWidth = Math.max(1.5, s * 0.2);
    ctx.beginPath();
    ctx.moveTo(x - s * 0.7, base);
    ctx.lineTo(x + s * 0.6, base - s * 0.3);
    ctx.moveTo(x + s * 0.7, base);
    ctx.lineTo(x - s * 0.6, base - s * 0.3);
    ctx.stroke();
  },
  palisade(g, o) {
    const { ctx, w, h, P } = g;
    const r = seeded(o.seed);
    ctx.fillStyle = P.ink;
    for (let x = o.x0 * w; x < o.x1 * w; x += 5 + r() * 3) {
      const top = (o.base - o.h * (0.75 + r() * 0.3)) * h;
      ctx.beginPath();
      ctx.moveTo(x, o.base * h);
      ctx.lineTo(x, top + 4);
      ctx.lineTo(x + 2, top);
      ctx.lineTo(x + 4, top + 4);
      ctx.lineTo(x + 4, o.base * h);
      ctx.closePath();
      ctx.fill();
    }
  },
  smoke(g, o) {
    const { ctx, w, h, P } = g;
    const r = seeded(o.seed);
    const [x, base, sh] = [o.x * w, o.base * h, o.h * h];
    const drift = (r() - 0.2) * sh * 0.5;
    for (let i = 0; i < 16; i += 1) {
      const t = i / 15;
      const px = x + drift * t ** 1.6 + (r() - 0.5) * sh * 0.06;
      const py = base - sh * t;
      const rad = sh * (0.035 + 0.1 * t);
      const puff = ctx.createRadialGradient(px, py, 0, px, py, rad);
      puff.addColorStop(0, rgba(P.smoke, P.smokeA * (1 - t * 0.85)));
      puff.addColorStop(1, rgba(P.smoke, 0));
      ctx.fillStyle = puff;
      ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    }
  },
  birds(g, o) {
    const { ctx, w, h, P } = g;
    const r = seeded(o.seed);
    ctx.strokeStyle = P.ink;
    ctx.lineWidth = 1.1;
    for (let i = 0; i < o.n; i += 1) {
      const [x, y, s] = [w * (0.3 + r() * 0.5), h * (o.y + (r() - 0.5) * 0.12), 3 + r() * 3];
      ctx.beginPath();
      ctx.moveTo(x - s, y - s * 0.3);
      ctx.quadraticCurveTo(x - s * 0.4, y - s * 0.6, x, y);
      ctx.quadraticCurveTo(x + s * 0.4, y - s * 0.6, x + s, y - s * 0.3);
      ctx.stroke();
    }
  },
  grave(g, o) {
    const { ctx, w, h, P } = g;
    const [x, base, s] = [o.x * w, o.base * h, o.s * h];
    ctx.fillStyle = mix(P.near, P.mid, 0.25);
    ctx.beginPath();
    ctx.ellipse(x, base, s * 0.75, s * 0.28, 0, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = P.ink;
    ctx.fillRect(x + s * 0.55, base - s * 0.95, s * 0.12, s * 0.95);
    ctx.fillRect(x + s * 0.5, base - s * 0.98, s * 0.22, s * 0.06);
  },
  // the page: a little grain, the corners darker, and the foot dissolving into the paper
  grain(g, o) {
    const { ctx, w, h, P, paper, dark } = g;
    const r = seeded(`${o.seed}:grain`);
    ctx.fillStyle = rgba(P.ink, dark ? 0.12 : 0.06);
    for (let i = 0; i < (w * h) / 90; i += 1) ctx.fillRect(r() * w, r() * h, 1, 1);
    const vignette = ctx.createRadialGradient(w / 2, h * 0.45, h * 0.4, w / 2, h * 0.45, w * 0.75);
    vignette.addColorStop(0, rgba(P.ink, 0));
    vignette.addColorStop(1, rgba(P.ink, dark ? 0.3 : 0.14));
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
    const foot = ctx.createLinearGradient(0, h * 0.9, 0, h);
    foot.addColorStop(0, rgba(paper, 0));
    foot.addColorStop(1, rgba(paper, 0.92));
    ctx.fillStyle = foot;
    ctx.fillRect(0, h * 0.9, w, h * 0.1);
  }
};
export const DRAWN_OPS = Object.keys(DRAW);
