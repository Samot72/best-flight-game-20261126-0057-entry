// The renderer: a chase-view 3D scene on a 2D canvas. Terrain is a projected
// heightfield grid around the plane, the city is projected boxes, the rings
// are projected circles, and the courier plane is drawn in the frame with a
// lit instrument HUD (altitude, speed, heading, artificial horizon, throttle).
import { FONT, MISSION, PALETTE, PLANE, TERRAIN, VIEW } from './config.js';
import { RUNWAY, terrainHeight } from './world.js';
import { fbm, hash2 } from './random.js';

export const SCREEN_TITLE = 0;
export const SCREEN_PLAY = 1;
export const SCREEN_PAUSED = 2;
export const SCREEN_OVER = 3;

const W = VIEW.width;
const H = VIEW.height;
const FOCAL = (H / 2) / Math.tan((35 * Math.PI) / 180);
const TAU = Math.PI * 2;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(Math.round(((n >> 16) & 255) * f), 0, 255);
  const g = clamp(Math.round(((n >> 8) & 255) * f), 0, 255);
  const b = clamp(Math.round((n & 255) * f), 0, 255);
  return `rgb(${r},${g},${b})`;
}

function terrainColor(h, x, z) {
  const n = fbm(x / 260 + 11, z / 260 + 5);
  if (h < 1.5) return n > 0.1 ? PALETTE.seaShallow : PALETTE.seaDeep;
  if (h < 5) return PALETTE.sand;
  if (h < 55) return n > 0 ? PALETTE.grass : PALETTE.forest;
  if (h < 150) return n > -0.1 ? PALETTE.forest : PALETTE.rock;
  if (h < 235) return PALETTE.rock;
  return PALETTE.snow;
}

export function createRenderer(canvas) {
  // Fixed backing store: the game is drawn in 1280x720 logical pixels.
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const clouds = [];
  for (let i = 0; i < 16; i += 1) {
    clouds.push({
      x: (hash2(i, 3) * 0.5 + 0.5) * 5200 - 2600,
      y: 520 + hash2(i, 7) * 160,
      z: (hash2(i, 11) * 0.5 + 0.5) * 5200 - 2600,
      r: 90 + Math.abs(hash2(i, 13)) * 160,
    });
  }

  // --- camera ------------------------------------------------------------
  let cam = { x: 0, y: 0, z: 0 };
  let right = { x: 1, y: 0, z: 0 };
  let up = { x: 0, y: 1, z: 0 };
  let fwd = { x: 0, y: 0, z: -1 };

  function setupCamera(s) {
    const fx = Math.sin(s.heading);
    const fy = Math.sin(s.pitch);
    const fz = -Math.cos(s.heading);
    const fl = Math.hypot(fx, fy, fz) || 1;
    fwd = { x: fx / fl, y: fy / fl, z: fz / fl };
    cam = {
      x: s.x - fwd.x * 17,
      y: s.y - fwd.y * 17 + 4.5,
      z: s.z - fwd.z * 17,
    };
    // Right = fwd x world-up = (-fwd.z, 0, fwd.x); up = right x fwd.
    const rx = -fwd.z;
    const ry = 0;
    const rz = fwd.x;
    const rl = Math.hypot(rx, ry, rz) || 1;
    right = { x: rx / rl, y: 0, z: rz / rl };
    up = {
      x: right.y * fwd.z - right.z * fwd.y,
      y: right.z * fwd.x - right.x * fwd.z,
      z: right.x * fwd.y - right.y * fwd.x,
    };
    const c = Math.cos(s.roll);
    const sn = Math.sin(s.roll);
    const r2 = {
      x: right.x * c + up.x * sn,
      y: right.y * c + up.y * sn,
      z: right.z * c + up.z * sn,
    };
    const u2 = {
      x: up.x * c - right.x * sn,
      y: up.y * c - right.y * sn,
      z: up.z * c - right.z * sn,
    };
    right = r2;
    up = u2;
  }

  /** Project a world point to screen space; null when behind the camera. */
  function project(x, y, z) {
    const dx = x - cam.x;
    const dy = y - cam.y;
    const dz = z - cam.z;
    const cz = dx * fwd.x + dy * fwd.y + dz * fwd.z;
    if (cz < 1.5) return null;
    const cx = (dx * right.x + dy * right.y + dz * right.z) / cz;
    const cy = (dx * up.x + dy * up.y + dz * up.z) / cz;
    return { x: W / 2 + cx * FOCAL, y: H / 2 - cy * FOCAL, d: cz };
  }

  // --- sky, sea, terrain --------------------------------------------------
  function drawSky(s) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, PALETTE.skyTop);
    g.addColorStop(0.45, PALETTE.skyMid);
    g.addColorStop(0.62, PALETTE.skyLow);
    g.addColorStop(1, '#9fc6e2');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Sun.
    const sun = project(cam.x + fwd.x * 3000 + 1400, cam.y + 900, cam.z + fwd.z * 3000 - 600);
    if (sun) {
      ctx.fillStyle = PALETTE.sun;
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, 34, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,243,196,0.25)';
      ctx.beginPath();
      ctx.arc(sun.x, sun.y, 64, 0, TAU);
      ctx.fill();
    }
    // Clouds as soft projected puffs.
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (const c of clouds) {
      const p = project(c.x, c.y, c.z);
      if (!p || p.x < -200 || p.x > W + 200 || p.y < -80 || p.y > H + 80) continue;
      const r = (c.r / p.d) * FOCAL;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, r, r * 0.38, 0, 0, TAU);
      ctx.fill();
    }
  }

  function drawSeaHorizon() {
    const left = project(cam.x + fwd.x * 3000 - right.x * 3000, 0, cam.z + fwd.z * 3000 - right.z * 3000);
    const rightP = project(cam.x + fwd.x * 3000 + right.x * 3000, 0, cam.z + fwd.z * 3000 + right.z * 3000);
    if (!left || !rightP) return;
    const g = ctx.createLinearGradient(0, Math.min(left.y, rightP.y), 0, H);
    g.addColorStop(0, PALETTE.seaShallow);
    g.addColorStop(1, PALETTE.seaDeep);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-20, left.y);
    ctx.lineTo(W + 20, rightP.y);
    ctx.lineTo(W + 20, H + 20);
    ctx.lineTo(-20, H + 20);
    ctx.closePath();
    ctx.fill();
  }

  function drawTerrain(s) {
    const cell = TERRAIN.cell;
    const half = TERRAIN.half;
    const cx = Math.round(s.x / cell) * cell;
    const cz = Math.round(s.z / cell) * cell;
    const quads = [];
    const grid = [];
    for (let j = -half; j <= half; j += 1) {
      const row = [];
      for (let i = -half; i <= half; i += 1) {
        const x = cx + i * cell;
        const z = cz + j * cell;
        const h = terrainHeight(x, z);
        const p = project(x, Math.max(h, 0), z);
        row.push({ x, z, h, p });
      }
      grid.push(row);
    }
    for (let j = 0; j < half * 2; j += 1) {
      for (let i = 0; i < half * 2; i += 1) {
        const a = grid[j][i];
        const b = grid[j][i + 1];
        const c = grid[j + 1][i + 1];
        const d = grid[j + 1][i];
        if (!a.p || !b.p || !c.p || !d.p) continue;
        const avgH = (a.h + b.h + c.h + d.h) / 4;
        const avgD = (a.p.d + b.p.d + c.p.d + d.p.d) / 4;
        const slope = Math.abs(a.h - c.h) / (cell * 1.4);
        quads.push({ a, b, c, d, avgH, avgD, slope });
      }
    }
    quads.sort((p, q) => q.avgD - p.avgD);
    for (const q of quads) {
      const jitter = 0.92 + 0.08 * Math.abs(hash2(Math.round(q.a.x / 55), Math.round(q.a.z / 55)));
      const bright = clamp(1.04 - q.slope * 0.35, 0.6, 1.05) * jitter;
      ctx.fillStyle = shade(terrainColor(q.avgH, q.a.x, q.a.z), bright);
      ctx.beginPath();
      ctx.moveTo(q.a.p.x, q.a.p.y);
      ctx.lineTo(q.b.p.x, q.b.p.y);
      ctx.lineTo(q.c.p.x, q.c.p.y);
      ctx.lineTo(q.d.p.x, q.d.p.y);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawRunway() {
    const hx = Math.sin(RUNWAY.heading);
    const hz = -Math.cos(RUNWAY.heading);
    const px = Math.cos(RUNWAY.heading);
    const pz = Math.sin(RUNWAY.heading);
    const halfL = RUNWAY.length / 2;
    const halfW = RUNWAY.width / 2;
    const corners = [
      [RUNWAY.x - hx * halfL - px * halfW, RUNWAY.z - hz * halfL - pz * halfW],
      [RUNWAY.x - hx * halfL + px * halfW, RUNWAY.z - hz * halfL + pz * halfW],
      [RUNWAY.x + hx * halfL + px * halfW, RUNWAY.z + hz * halfL + pz * halfW],
      [RUNWAY.x + hx * halfL - px * halfW, RUNWAY.z + hz * halfL - pz * halfW],
    ];
    const pts = corners.map(([x, z]) => project(x, 6.6, z));
    if (pts.some((p) => !p)) return;
    ctx.fillStyle = PALETTE.runway;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < 4; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fill();
    // Centreline dashes and threshold bars.
    ctx.fillStyle = PALETTE.runwayMark;
    for (let t = -halfL + 40; t < halfL - 20; t += 62) {
      const d1 = project(RUNWAY.x + hx * t, 6.9, RUNWAY.z + hz * t);
      const d2 = project(RUNWAY.x + hx * (t + 28), 6.9, RUNWAY.z + hz * (t + 28));
      if (!d1 || !d2) continue;
      const wdt = Math.max(1.5, 26 / d1.d * FOCAL * 0.02);
      ctx.beginPath();
      ctx.moveTo(d1.x - wdt / 2, d1.y);
      ctx.lineTo(d2.x - wdt / 2, d2.y);
      ctx.lineTo(d2.x + wdt / 2, d2.y);
      ctx.lineTo(d1.x + wdt / 2, d1.y);
      ctx.closePath();
      ctx.fill();
    }
    // Edge lights.
    ctx.fillStyle = PALETTE.amber;
    for (let t = -halfL; t <= halfL; t += 62) {
      for (const side of [-1, 1]) {
        const p = project(RUNWAY.x + hx * t + px * side * halfW, 7.4, RUNWAY.z + hz * t + pz * side * halfW);
        if (!p) continue;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1.5, 900 / p.d), 0, TAU);
        ctx.fill();
      }
    }
  }

  function drawCityAndRings(s, rings) {
    const items = [];
    for (const b of s.city) {
      const p = project(b.x, b.h, b.z);
      if (p) items.push({ d: p.d, kind: 'box', b });
    }
    rings.forEach((ring, idx) => {
      const p = project(ring.x, ring.y, ring.z);
      if (p) items.push({ d: p.d, kind: 'ring', ring, idx });
    });
    items.sort((a, b) => b.d - a.d);
    for (const it of items) {
      if (it.kind === 'box') drawBox(it.b);
      else drawRing(it.ring, it.idx, rings);
    }
  }

  function drawBox(b) {
    const hw = b.w / 2;
    const hd = b.d / 2;
    const corners = [
      [b.x - hw, 0, b.z - hd], [b.x + hw, 0, b.z - hd],
      [b.x + hw, 0, b.z + hd], [b.x - hw, 0, b.z + hd],
      [b.x - hw, b.h, b.z - hd], [b.x + hw, b.h, b.z - hd],
      [b.x + hw, b.h, b.z + hd], [b.x - hw, b.h, b.z + hd],
    ].map(([x, y, z]) => project(x, y, z));
    if (corners.some((p) => !p)) return;
    const faces = [
      { pts: [4, 5, 6, 7], color: PALETTE.cityRoof },
      { pts: [0, 1, 5, 4], color: shade(PALETTE.cityWall, 0.8) },
      { pts: [1, 2, 6, 5], color: shade(PALETTE.cityWall, 0.65) },
      { pts: [2, 3, 7, 6], color: shade(PALETTE.cityWall, 0.9) },
      { pts: [3, 0, 4, 7], color: shade(PALETTE.cityWall, 0.7) },
    ];
    for (const f of faces) {
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.moveTo(corners[f.pts[0]].x, corners[f.pts[0]].y);
      for (let i = 1; i < 4; i += 1) ctx.lineTo(corners[f.pts[i]].x, corners[f.pts[i]].y);
      ctx.closePath();
      ctx.fill();
    }
    // Lit windows on the roof edge.
    ctx.fillStyle = 'rgba(255, 210, 110, 0.9)';
    const top = corners[4];
    const top2 = corners[6];
    if (top && top2) {
      ctx.fillRect((top.x + top2.x) / 2 - 2, (top.y + top2.y) / 2 - 2, 4, 4);
    }
  }

  function drawRing(ring, idx, rings) {
    const done = ring.done;
    const isNext = rings.findIndex((r) => !r.done) === idx;
    const colour = done ? PALETTE.green : isNext ? PALETTE.ringNext : PALETTE.ring;
    const next = rings[idx + 1] || { x: RUNWAY.x, y: 120, z: RUNWAY.z };
    const dx = next.x - ring.x;
    const dy = next.y - ring.y;
    const dz = next.z - ring.z;
    const dl = Math.hypot(dx, dy, dz) || 1;
    const nx = dx / dl;
    const ny = dy / dl;
    const nz = dz / dl;
    // Basis across the ring plane.
    let ax = -nz;
    let ay = 0;
    let az = nx;
    const al = Math.hypot(ax, ay, az) || 1;
    ax /= al; ay /= al; az /= al;
    const bx = ny * az - nz * ay;
    const by = nz * ax - nx * az;
    const bz = nx * ay - ny * ax;
    ctx.strokeStyle = colour;
    ctx.lineWidth = done ? 3 : 7;
    ctx.shadowColor = colour;
    ctx.shadowBlur = done ? 0 : 16;
    ctx.globalAlpha = done ? 0.45 : 0.95;
    ctx.beginPath();
    for (let i = 0; i <= 24; i += 1) {
      const a = (i / 24) * TAU;
      const px = ring.x + (ax * Math.cos(a) + bx * Math.sin(a)) * MISSION.ringRadius;
      const py = ring.y + (ay * Math.cos(a) + by * Math.sin(a)) * MISSION.ringRadius;
      const pz = ring.z + (az * Math.cos(a) + bz * Math.sin(a)) * MISSION.ringRadius;
      const p = project(px, py, pz);
      if (!p) continue;
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    if (isNext) {
      const c = project(ring.x, ring.y, ring.z);
      if (c) {
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold 15px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(`RING ${idx + 1}`, c.x, c.y - MISSION.ringRadius / c.d * FOCAL - 14);
      }
    }
  }

  // --- the plane ------------------------------------------------------------
  function drawPlane(s) {
    const cx = W / 2;
    const cy = H * 0.60 + s.pitch * 46;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(s.roll * 0.85);
    ctx.scale(1, 1 - Math.abs(s.roll) * 0.12);
    // Prop disc.
    ctx.fillStyle = 'rgba(220, 235, 245, 0.28)';
    ctx.beginPath();
    ctx.ellipse(0, -6, 10, 46, 0, 0, TAU);
    ctx.fill();
    // Wings.
    ctx.fillStyle = '#d8433a';
    ctx.beginPath();
    ctx.moveTo(-14, -2); ctx.lineTo(-168, 26); ctx.lineTo(-168, 38); ctx.lineTo(-10, 12);
    ctx.lineTo(10, 12); ctx.lineTo(168, 38); ctx.lineTo(168, 26); ctx.lineTo(14, -2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f2f6f9';
    ctx.beginPath();
    ctx.moveTo(-168, 26); ctx.lineTo(-168, 38); ctx.lineTo(-10, 12); ctx.lineTo(-10, 6);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(168, 26); ctx.lineTo(168, 38); ctx.lineTo(10, 12); ctx.lineTo(10, 6);
    ctx.closePath();
    ctx.fill();
    // Tail.
    ctx.fillStyle = '#b8322a';
    ctx.beginPath();
    ctx.moveTo(-8, 34); ctx.lineTo(-52, 58); ctx.lineTo(-52, 66); ctx.lineTo(-6, 48);
    ctx.lineTo(6, 48); ctx.lineTo(52, 66); ctx.lineTo(52, 58); ctx.lineTo(8, 34);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#d8433a';
    ctx.beginPath();
    ctx.moveTo(-4, 30); ctx.lineTo(-4, 62); ctx.lineTo(4, 62); ctx.lineTo(4, 30);
    ctx.closePath();
    ctx.fill();
    // Fuselage.
    const body = ctx.createLinearGradient(-14, 0, 14, 0);
    body.addColorStop(0, '#e8eef2');
    body.addColorStop(0.5, '#ffffff');
    body.addColorStop(1, '#c9d4dc');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(0, -52);
    ctx.quadraticCurveTo(13, -30, 13, 6);
    ctx.quadraticCurveTo(13, 40, 6, 52);
    ctx.lineTo(-6, 52);
    ctx.quadraticCurveTo(-13, 40, -13, 6);
    ctx.quadraticCurveTo(-13, -30, 0, -52);
    ctx.closePath();
    ctx.fill();
    // Cockpit windows, lit.
    ctx.fillStyle = '#12324a';
    ctx.beginPath();
    ctx.moveTo(-9, -34); ctx.lineTo(9, -34); ctx.lineTo(11, -14); ctx.lineTo(-11, -14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(120, 220, 255, 0.85)';
    ctx.beginPath();
    ctx.moveTo(-7, -32); ctx.lineTo(7, -32); ctx.lineTo(9, -16); ctx.lineTo(-9, -16);
    ctx.closePath();
    ctx.fill();
    // Registration + nav lights.
    ctx.fillStyle = '#12324a';
    ctx.font = `bold 11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('NUSA-01', 0, 30);
    ctx.fillStyle = '#ff3b30';
    ctx.beginPath(); ctx.arc(-168, 32, 4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#37e0a0';
    ctx.beginPath(); ctx.arc(168, 32, 4, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawCockpitFrame() {
    // A thin canopy strut along the very top edge, then a soft vignette.
    ctx.strokeStyle = 'rgba(10, 20, 30, 0.5)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(0, 4);
    ctx.lineTo(W, 4);
    ctx.stroke();
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(4, 12, 20, 0.42)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
  }

  // --- HUD ------------------------------------------------------------------
  function panel(x, y, w, h) {
    ctx.fillStyle = PALETTE.panel;
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
  }

  function litText(text, x, y, size, colour, align) {
    ctx.font = `bold ${size}px ${FONT}`;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = colour || PALETTE.green;
    ctx.shadowBlur = 10;
    ctx.fillStyle = colour || PALETTE.green;
    ctx.fillText(text, x, y);
    ctx.shadowBlur = 0;
  }

  function drawHUD(s, view) {
    const stalled = s.speed < PLANE.stallSpeed;
    const timeLeft = Math.max(0, MISSION.timeLimit - s.elapsed);
    const mm = Math.floor(timeLeft / 60);
    const ss = Math.floor(timeLeft % 60).toString().padStart(2, '0');
    const hdg = ((Math.round((-s.heading * 180) / Math.PI) % 360) + 360) % 360;

    // Left instrument panel: ALT / SPD / HDG / VSI.
    panel(18, 16, 218, 148);
    litText('ALT', 32, 44, 13, PALETTE.amber);
    litText(`${Math.round(s.y)} m`, 150, 46, 20, PALETTE.green, 'left');
    litText('SPD', 32, 76, 13, PALETTE.amber);
    litText(`${Math.round(s.speed * 3.6)} km/h`, 150, 78, 20, PALETTE.green, 'left');
    litText('HDG', 32, 108, 13, PALETTE.amber);
    litText(`${hdg.toString().padStart(3, '0')}°`, 150, 110, 20, PALETTE.green, 'left');
    litText('THR', 32, 140, 13, PALETTE.amber);
    litText(`${Math.round(s.throttle * 100)}%`, 150, 142, 20, PALETTE.green, 'left');
    // Throttle bar under it.
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(32, 152, 190, 6);
    ctx.fillStyle = PALETTE.amber;
    ctx.fillRect(32, 152, 190 * s.throttle, 6);

    // Compass strip, top centre.
    panel(W / 2 - 190, 16, 380, 44);
    const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    ctx.save();
    ctx.beginPath();
    ctx.rect(W / 2 - 190, 16, 380, 44);
    ctx.clip();
    for (let d = -90; d <= 90; d += 15) {
      const a = ((hdg + d) % 360 + 360) % 360;
      const x = W / 2 + (d / 90) * 180;
      ctx.strokeStyle = 'rgba(234,246,255,0.8)';
      ctx.beginPath();
      ctx.moveTo(x, 44);
      ctx.lineTo(x, d % 45 === 0 ? 30 : 37);
      ctx.stroke();
      if (d % 45 === 0) {
        ctx.font = `bold 13px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillStyle = PALETTE.text;
        ctx.fillText(points[Math.round(a / 45) % 8], x, 28);
      }
    }
    ctx.restore();
    ctx.fillStyle = PALETTE.amber;
    ctx.beginPath();
    ctx.moveTo(W / 2, 60);
    ctx.lineTo(W / 2 - 6, 50);
    ctx.lineTo(W / 2 + 6, 50);
    ctx.closePath();
    ctx.fill();

    // Right mission panel.
    panel(W - 236, 16, 218, 148);
    litText('RINGS', W - 222, 44, 13, PALETTE.amber);
    litText(`${s.rings}/5`, W - 120, 46, 20, PALETTE.green, 'left');
    litText('SCORE', W - 222, 76, 13, PALETTE.amber);
    litText(`${s.score}`, W - 120, 78, 20, PALETTE.green, 'left');
    litText('TIME', W - 222, 108, 13, PALETTE.amber);
    litText(`${mm}:${ss}`, W - 120, 110, 20, timeLeft < 60 ? PALETTE.red : PALETTE.green, 'left');
    litText('BEST', W - 222, 140, 13, PALETTE.amber);
    litText(`${view.best}`, W - 120, 142, 20, PALETTE.green, 'left');

    // Artificial horizon, bottom left.
    const ax = 78;
    const ay = H - 78;
    const ar = 46;
    ctx.save();
    ctx.beginPath();
    ctx.arc(ax, ay, ar, 0, TAU);
    ctx.clip();
    ctx.translate(ax, ay);
    ctx.rotate(-s.roll);
    ctx.translate(0, s.pitch * 60);
    ctx.fillStyle = '#3f8fd2';
    ctx.fillRect(-ar - 4, -ar - 70, ar * 2 + 8, ar + 70);
    ctx.fillStyle = '#8a6a42';
    ctx.fillRect(-ar - 4, 0, ar * 2 + 8, ar + 70);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    for (let p = -2; p <= 2; p += 1) {
      ctx.beginPath();
      ctx.moveTo(-ar * 0.5, p * 16);
      ctx.lineTo(ar * 0.5, p * 16);
      ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ax, ay, ar, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = PALETTE.amber;
    ctx.beginPath();
    ctx.moveTo(ax - 14, ay); ctx.lineTo(ax + 14, ay); ctx.lineTo(ax, ay + 5);
    ctx.closePath();
    ctx.fill();

    // Next-ring distance, bottom centre.
    const ring = view.nextRing;
    if (ring && !s.over) {
      const dist = Math.hypot(ring.x - s.x, ring.y - s.y, ring.z - s.z);
      litText(`NEXT RING ${Math.round(dist)} m`, W / 2, H - 24, 16, PALETTE.amber, 'center');
    }
    if (s.rings === 5 && !s.over) {
      litText('ALL RINGS CLEAR — LAND ON THE RUNWAY!', W / 2, H - 52, 18, PALETTE.ringNext, 'center');
    }
    if (stalled && !s.over) {
      litText('STALL! NOSE DOWN — ADD THROTTLE', W / 2, 96, 18, PALETTE.red, 'center');
    }
    if (view.message) {
      ctx.globalAlpha = clamp(1.6 - view.messageAge / 2.4, 0, 1);
      litText(view.message, W / 2, 132, 20, PALETTE.green, 'center');
      ctx.globalAlpha = 1;
    }
  }

  // --- screens ----------------------------------------------------------------
  function centrePanel(title, lines, accent) {
    ctx.fillStyle = 'rgba(4, 12, 20, 0.62)';
    ctx.fillRect(0, 0, W, H);
    panel(W / 2 - 330, H / 2 - 190, 660, 380);
    ctx.textAlign = 'center';
    ctx.fillStyle = accent || PALETTE.text;
    ctx.font = `bold 44px ${FONT}`;
    ctx.shadowColor = accent || PALETTE.green;
    ctx.shadowBlur = 18;
    ctx.fillText(title, W / 2, H / 2 - 118);
    ctx.shadowBlur = 0;
    ctx.font = `19px ${FONT}`;
    ctx.fillStyle = PALETTE.text;
    lines.forEach((line, i) => {
      ctx.fillText(line, W / 2, H / 2 - 62 + i * 32);
    });
  }

  function drawTitle(s, best) {
    ctx.fillStyle = 'rgba(4, 12, 20, 0.45)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.shadowColor = PALETTE.amber;
    ctx.shadowBlur = 26;
    ctx.fillStyle = '#fff7d6';
    ctx.font = `bold 72px ${FONT}`;
    ctx.fillText('NUSA SKY COURIER', W / 2, 168);
    ctx.shadowBlur = 0;
    ctx.fillStyle = PALETTE.text;
    ctx.font = `24px ${FONT}`;
    ctx.fillText('Fly the island mail run — five rings, then land on the runway.', W / 2, 210);
    panel(W / 2 - 300, 252, 600, 208);
    ctx.font = `18px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.text;
    const rows = [
      'W / S ............ throttle up / down',
      'Arrow keys ....... pitch & roll  (Q / E rudder)',
      'Mouse ............ steer toward the pointer',
      'Shift / Ctrl ..... throttle boost / cut',
      'Space / click .... start   •   P ............ pause',
    ];
    rows.forEach((row, i) => ctx.fillText(row, W / 2 - 278, 290 + i * 34));
    ctx.textAlign = 'center';
    ctx.font = `bold 24px ${FONT}`;
    ctx.fillStyle = PALETTE.green;
    ctx.shadowColor = PALETTE.green;
    ctx.shadowBlur = 12;
    ctx.fillText('PRESS SPACE OR CLICK TO FLY', W / 2, 516);
    ctx.shadowBlur = 0;
    ctx.fillStyle = PALETTE.amber;
    ctx.font = `18px ${FONT}`;
    ctx.fillText(`Best score: ${best}   •   5 rings + landing = ${5 * MISSION.ringScore + MISSION.landScore} pts`, W / 2, 556);
  }

  function drawOver(s, best) {
    const won = s.won;
    const title = won ? 'MISSION COMPLETE' : 'FLIGHT OVER';
    const lines = [
      s.reason,
      `Score ${s.score}   •   Rings ${s.rings}/5   •   Time ${Math.floor(s.elapsed)}s`,
      `Best score: ${Math.max(best, s.score)}`,
      '',
      'PRESS SPACE OR CLICK TO FLY AGAIN',
    ];
    centrePanel(title, lines, won ? PALETTE.green : PALETTE.red);
  }

  function drawPaused() {
    centrePanel('PAUSED', ['Press P or Space to keep flying.'], PALETTE.amber);
  }

  /** Paint one frame. `view` carries the screen, best score, next ring and message. */
  function draw(s, view) {
    setupCamera(s);
    drawSky(s);
    drawSeaHorizon();
    drawTerrain(s);
    drawRunway();
    drawCityAndRings(s, s.ringsState);
    drawPlane(s);
    drawCockpitFrame();
    if (view.screen !== SCREEN_TITLE) drawHUD(s, view);
    if (view.screen === SCREEN_TITLE) drawTitle(s, view.best);
    else if (view.screen === SCREEN_PAUSED) drawPaused();
    else if (view.screen === SCREEN_OVER) drawOver(s, view.best);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  return { draw };
}
