/**
 * Campaign Generator for "From Sunnyville VTT v4.0"
 * Creates "The Ruins of Ashenvale" - a rich pre-built campaign JSON
 * showcasing terrain tiles, fog of war, tokens, locked cells, and more.
 */

const zlib = require('zlib');
const fs   = require('fs');

// ─── PNG encoder (pure Node, no deps) ────────────────────────────────────────

function makeCRCTable() {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
}
const CRC = makeCRCTable();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC[(c ^ buf[i]) & 0xFF];
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const tb = Buffer.from(type, 'ascii');
  const db = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const lb = Buffer.alloc(4); lb.writeUInt32BE(db.length, 0);
  const cb = Buffer.alloc(4); cb.writeUInt32BE(crc32(Buffer.concat([tb, db])), 0);
  return Buffer.concat([lb, tb, db, cb]);
}

/**
 * makePNG(w, h, getPixel) → base64 PNG string
 * getPixel(x,y) → [r,g,b,a]   (RGBA color type 6)
 */
function makePNG(w, h, getPixel) {
  const raw = Buffer.alloc(h * (1 + w * 4));
  let off = 0;
  for (let y = 0; y < h; y++) {
    raw[off++] = 0; // filter = None
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = getPixel(x, y);
      raw[off++] = r; raw[off++] = g; raw[off++] = b; raw[off++] = a;
    }
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // RGBA
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}

// ─── Terrain tile generators (400×400 PNG) ───────────────────────────────────

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// Simplex-ish noise (fast, deterministic)
function hash(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 1234567891) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 1540483477) >>> 0;
  h ^= h >>> 15; return h / 0xFFFFFFFF;
}
function noise(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const v00 = hash(xi,   yi,   seed);
  const v10 = hash(xi+1, yi,   seed);
  const v01 = hash(xi,   yi+1, seed);
  const v11 = hash(xi+1, yi+1, seed);
  const sx = xf * xf * (3 - 2 * xf);
  const sy = yf * yf * (3 - 2 * yf);
  return lerp(lerp(v00, v10, sx), lerp(v01, v11, sx), sy);
}
function fbm(x, y, seed, octaves=4) {
  let v = 0, amp = 0.5, freq = 1, max = 0;
  for (let i = 0; i < octaves; i++) {
    v += noise(x * freq, y * freq, seed + i) * amp;
    max += amp; amp *= 0.5; freq *= 2;
  }
  return v / max;
}

// ──── Cell 0,0 – Elderwood Forest (deep, ancient) ───────────────────────────
function cell_0_0() {
  return makePNG(400, 400, (x, y) => {
    const nx = x / 80, ny = y / 80;
    const n = fbm(nx, ny, 42);
    const n2 = fbm(nx * 2 + 7.3, ny * 2 + 1.8, 99);

    // Base forest floor: dark earthy green
    let r = clamp(Math.round(lerp(20, 45, n)),  0, 255);
    let g = clamp(Math.round(lerp(55, 95, n)),  0, 255);
    let b = clamp(Math.round(lerp(18, 40, n)),  0, 255);

    // Moss patches
    if (n2 > 0.62) { r -= 5; g += 10; b -= 5; }

    // Tree canopy trunks (dark circles scattered)
    const treeSeeds = [
      [60,60],[150,40],[330,70],[50,200],[290,160],[180,290],
      [90,340],[360,310],[230,80],[130,170],[310,240],[70,130],
      [250,360],[380,150],[200,230]
    ];
    for (const [tx,ty] of treeSeeds) {
      const d = Math.hypot(x-tx, y-ty);
      if (d < 28) { // canopy
        const shade = d / 28;
        r = Math.round(lerp(12, r, shade * shade));
        g = Math.round(lerp(38, g, shade * shade));
        b = Math.round(lerp(10, b, shade * shade));
      }
      if (d < 5) { r=45; g=28; b=14; } // trunk
    }

    // Fallen log
    const logY = 250, lx1=100, lx2=290;
    if (Math.abs(y - logY) < 6 && x > lx1 && x < lx2) {
      r=90; g=55; b=30;
      if (Math.abs(y - logY) < 2) { r=70; g=42; b=22; }
    }

    // Subtle edge fade (reduced to avoid dark seams between cells)
    const ex = Math.min(x, 399-x)/40, ey = Math.min(y, 399-y)/40;
    const ev = clamp(Math.min(ex,ey), 0, 1);
    r = Math.round(r * (0.92 + 0.08*ev));
    g = Math.round(g * (0.92 + 0.08*ev));
    b = Math.round(b * (0.92 + 0.08*ev));

    return [clamp(r,0,255), clamp(g,0,255), clamp(b,0,255), 255];
  });
}

// ──── Cell 1,0 – Forest Trail (path heading south) ──────────────────────────
function cell_1_0() {
  return makePNG(400, 400, (x, y) => {
    const nx = x / 80, ny = y / 80;
    const n = fbm(nx, ny, 77);

    // Base green forest
    let r = clamp(Math.round(lerp(25, 60, n)), 0, 255);
    let g = clamp(Math.round(lerp(70, 110, n)), 0, 255);
    let b = clamp(Math.round(lerp(20, 48, n)), 0, 255);

    // Central dirt path (wiggly)
    const pathCenter = 200 + Math.sin(y / 40) * 18 + Math.sin(y/17+1.2) * 8;
    const pathWidth  = 52;
    const distPath   = Math.abs(x - pathCenter);
    if (distPath < pathWidth) {
      const t = 1 - distPath / pathWidth;
      const pn = fbm(x/30, y/30, 13);
      const pr = Math.round(lerp(130, 165, pn));
      const pg = Math.round(lerp(100, 130, pn));
      const pb = Math.round(lerp( 60,  85, pn));
      r = Math.round(lerp(r, pr, t * t));
      g = Math.round(lerp(g, pg, t * t));
      b = Math.round(lerp(b, pb, t * t));
      // tracks / ruts
      if (distPath < 5 || (distPath > pathWidth-8 && distPath < pathWidth-3)) {
        r = Math.round(r * 0.82); g = Math.round(g * 0.82); b = Math.round(b * 0.82);
      }
    }

    // Tree canopies along sides
    const trees = [
      [45,50],[35,130],[55,220],[40,310],[48,390],
      [355,30],[365,110],[345,200],[360,290],[350,370]
    ];
    for (const [tx,ty] of trees) {
      const d = Math.hypot(x-tx, y-ty);
      if (d < 35) {
        const shade = d / 35;
        r = Math.round(lerp(15, r, shade));
        g = Math.round(lerp(42, g, shade));
        b = Math.round(lerp(12, b, shade));
      }
      if (d < 5) { r=55; g=34; b=18; }
    }

    // Signpost near top of path
    if (Math.abs(x - 230) < 4 && y > 20 && y < 70) { r=100; g=65; b=30; }
    if (Math.abs(y - 25) < 5 && x > 215 && x < 275) { r=100; g=65; b=30; }

    // Subtle edge fade
    const ev = clamp(Math.min(x, 399-x, y, 399-y) / 40, 0, 1);
    r = Math.round(r * (0.92 + 0.08*ev));
    g = Math.round(g * (0.92 + 0.08*ev));
    b = Math.round(b * (0.92 + 0.08*ev));

    return [clamp(r,0,255), clamp(g,0,255), clamp(b,0,255), 255];
  });
}

// ──── Cell 2,0 – Stormcrest Peaks (top-down rocky high ground) ──────────────
function cell_2_0() {
  return makePNG(400, 400, (x, y) => {
    const nx = x/100, ny = y/100;
    const n  = fbm(nx, ny, 33);
    const n2 = fbm(nx*2+1.3, ny*2+1.3, 77, 3);

    // Base: grey-brown rocky ground viewed from directly above
    let r = Math.round(lerp(90, 138, n));
    let g = Math.round(lerp(85, 128, n));
    let b = Math.round(lerp(80, 120, n));

    // Snow/frost patches in high areas (noise-driven, not y-based)
    const snowN = fbm(nx*1.4+3, ny*1.4+3, 22, 3);
    if (snowN > 0.63) {
      const st = clamp((snowN - 0.63) / 0.37, 0, 1);
      r = Math.round(lerp(r, 228, st));
      g = Math.round(lerp(g, 232, st));
      b = Math.round(lerp(b, 240, st));
    }

    // Large boulders (dark ovals with SE drop-shadow rim)
    const boulders = [
      [70, 55, 28],[250, 40, 22],[355, 95, 18],
      [130,175, 24],[305,215, 26],[55, 290, 20],
      [195,335, 22],[360,275, 16],[175, 90, 14],
      [320,155, 20],[90, 155, 18],[270,340, 18]
    ];
    for (const [bx, by, br] of boulders) {
      const d = Math.hypot(x-bx, y-by);
      if (d < br) {
        const bn = fbm((x-bx)/8, (y-by)/8, 99, 2);
        r = Math.round(lerp(50, Math.round(lerp(82, 118, bn)), d/br));
        g = Math.round(lerp(48, Math.round(lerp(77, 110, bn)), d/br));
        b = Math.round(lerp(45, Math.round(lerp(72, 104, bn)), d/br));
        // Shadow on south-east rim
        if (x > bx + br*0.3 && y > by + br*0.3 && d > br*0.6) {
          r = Math.round(r * 0.58); g = Math.round(g * 0.58); b = Math.round(b * 0.58);
        }
      }
    }

    // Rock fissures / cracks
    for (const [cx, cy, ang, len] of [
      [155, 145, 0.4, 65],[310, 305, -0.3, 55],[210, 255, 0.85, 50]
    ]) {
      const dx = x-cx, dy = y-cy;
      const along = dx * Math.cos(ang) + dy * Math.sin(ang);
      const perp  = Math.abs(-dx * Math.sin(ang) + dy * Math.cos(ang));
      if (perp < 2 && Math.abs(along) < len) {
        r = Math.round(r * 0.48); g = Math.round(g * 0.48); b = Math.round(b * 0.48);
      }
    }

    // Left edge blends toward forest (slight green tint in left 30px)
    if (x < 30) {
      const gt = (30 - x) / 30;
      r = Math.round(lerp(r, 55, gt * 0.35));
      g = Math.round(lerp(g, 90, gt * 0.35));
      b = Math.round(lerp(b, 42, gt * 0.35));
    }

    // Subtle edge fade (reduced – only 8% to avoid dark seams)
    const ev = clamp(Math.min(x, 399-x, y, 399-y) / 40, 0, 1);
    r = Math.round(r * (0.92 + 0.08*ev));
    g = Math.round(g * (0.92 + 0.08*ev));
    b = Math.round(b * (0.92 + 0.08*ev));

    return [clamp(r,0,255), clamp(g,0,255), clamp(b,0,255), 255];
  });
}

// ──── Cell 0,1 – Silverbrook Crossing ───────────────────────────────────────
function cell_0_1() {
  return makePNG(400, 400, (x, y) => {
    const nx = x/80, ny = y/80;
    const n = fbm(nx, ny, 11);

    // Bank: green grass
    let r = clamp(Math.round(lerp(30, 65, n)),  0,255);
    let g = clamp(Math.round(lerp(80,120, n)),  0,255);
    let b = clamp(Math.round(lerp(22, 50, n)),  0,255);

    // River runs vertically through centre with slight meander
    const riverC = 200 + Math.sin(y/55)*25 + Math.sin(y/22+0.7)*10;
    const riverW = 90;
    const dRiver = Math.abs(x - riverC);
    if (dRiver < riverW) {
      const t = 1 - dRiver/riverW;
      const wn = fbm(x/25+3, y/25+3, 22);
      const wr = Math.round(lerp(35, 65, wn));
      const wg = Math.round(lerp(100,150, wn));
      const wb = Math.round(lerp(160,210, wn));
      r = Math.round(lerp(r, wr, t));
      g = Math.round(lerp(g, wg, t));
      b = Math.round(lerp(b, wb, t));
      // white water ripple
      const ripple = Math.sin(x/8 + y/12) * 0.5 + 0.5;
      if (ripple > 0.82 && t > 0.4) {
        r=Math.round(lerp(r,200,0.4)); g=Math.round(lerp(g,220,0.4)); b=Math.round(lerp(b,240,0.4));
      }
    }

    // Stepping stones
    const stones = [[175,100],[190,140],[210,175],[195,215],[178,260]];
    for (const [sx,sy] of stones) {
      if (Math.hypot(x-sx, y-sy) < 12) {
        const sn = fbm((x-sx)/5, (y-sy)/5, 88);
        r=Math.round(lerp(100,140,sn)); g=Math.round(lerp(95,130,sn)); b=Math.round(lerp(90,120,sn));
      }
    }

    // Reed grass along banks
    if (dRiver > riverW - 18 && dRiver < riverW + 12) {
      if ((y + Math.floor(x/10)*7) % 20 < 4) {
        r = Math.round(r * 0.55); g = Math.round(g * 0.9); b = Math.round(b * 0.5);
      }
    }

    // Subtle edge fade
    const ev = clamp(Math.min(x, 399-x, y, 399-y) / 40, 0, 1);
    r=Math.round(r*(0.92+0.08*ev)); g=Math.round(g*(0.92+0.08*ev)); b=Math.round(b*(0.92+0.08*ev));

    return [clamp(r,0,255), clamp(g,0,255), clamp(b,0,255), 255];
  });
}

// ──── Cell 1,1 – Ruins of Ashenvale Courtyard (center) ──────────────────────
function cell_1_1() {
  return makePNG(400, 400, (x, y) => {
    const nx = x/60, ny = y/60;
    const n = fbm(nx, ny, 66);

    // Stone floor
    const sn = fbm(x/20, y/20, 7, 3);
    let r = Math.round(lerp(105, 145, sn));
    let g = Math.round(lerp( 98, 135, sn));
    let b = Math.round(lerp( 90, 125, sn));

    // Cracks network
    // Horizontal cracks
    for (const cy of [100, 200, 310]) {
      const wave = Math.sin(x/30)*6 + Math.sin(x/11)*2;
      if (Math.abs(y - cy - wave) < 2) {
        r=Math.round(r*0.55); g=Math.round(g*0.55); b=Math.round(b*0.55);
      }
    }
    // Vertical cracks
    for (const cx of [130, 270, 340]) {
      const wave = Math.sin(y/25)*5 + Math.sin(y/9)*2;
      if (Math.abs(x - cx - wave) < 2) {
        r=Math.round(r*0.55); g=Math.round(g*0.55); b=Math.round(b*0.55);
      }
    }

    // Moss patches (dark green splotches)
    const mn = fbm(nx*1.5+3, ny*1.5+3, 44);
    if (mn > 0.62) {
      r = Math.round(lerp(r, 45, (mn-0.62)/0.38));
      g = Math.round(lerp(g, 90, (mn-0.62)/0.38));
      b = Math.round(lerp(b, 35, (mn-0.62)/0.38));
    }

    // Broken pillars at corners (cylinders = circles)
    const pillars = [[60,60],[340,60],[60,340],[340,340]];
    for (const [px,py] of pillars) {
      const d = Math.hypot(x-px, y-py);
      if (d < 28) {
        const pn = fbm((x-px)/8, (y-py)/8, 31, 2);
        r=Math.round(lerp(140, 190, pn));
        g=Math.round(lerp(130, 178, pn));
        b=Math.round(lerp(120, 165, pn));
        if (d > 22) { // pillar edge shadow
          r=Math.round(r*0.7); g=Math.round(g*0.7); b=Math.round(b*0.7);
        }
      }
    }

    // Central altar / ritual circle
    const cx=200, cy=200;
    const dC = Math.hypot(x-cx, y-cy);
    if (dC < 55 && dC > 48) { // ring
      r=Math.round(lerp(r,180,0.7)); g=Math.round(lerp(g,140,0.7)); b=Math.round(lerp(b,50,0.7));
    }
    if (dC < 30 && dC > 25) { // inner ring
      r=Math.round(lerp(r,160,0.5)); g=Math.round(lerp(g,100,0.5)); b=Math.round(lerp(b,30,0.5));
    }
    if (dC < 6) { // center stone
      r=180; g=120; b=40;
    }

    // Wall fragments on edges
    const wallT = 22;
    if (x < wallT || x > 399-wallT || y < wallT || y > 399-wallT) {
      const wn = fbm(nx*2, ny*2, 9, 2);
      r=Math.round(lerp(115,155, wn));
      g=Math.round(lerp(108,145, wn));
      b=Math.round(lerp(100,135, wn));
      if (x < 5 || x > 394 || y < 5 || y > 394) {
        r=Math.round(r*0.6); g=Math.round(g*0.6); b=Math.round(b*0.6);
      }
    }

    return [clamp(r,0,255), clamp(g,0,255), clamp(b,0,255), 255];
  });
}

// ──── Cell 2,1 – Sunken Tower (top-down tower footprint) ────────────────────
function cell_2_1() {
  return makePNG(400, 400, (x, y) => {
    const nx = x/60, ny = y/60;
    const n = fbm(nx, ny, 55);

    // Base: rubble-covered ground viewed from above
    let r = Math.round(lerp(75, 118, n));
    let g = Math.round(lerp(70, 108, n));
    let b = Math.round(lerp(65, 100, n));

    // Tower footprint: thick stone walls viewed from directly above
    const tWall = 28;
    const tL=70, tR=330, tT=55, tB=330;
    const inOuter = x>tL && x<tR && y>tT && y<tB;
    const inInner = x>tL+tWall && x<tR-tWall && y>tT+tWall && y<tB-tWall;
    const inWall  = inOuter && !inInner;

    if (inWall) {
      const wn = fbm(nx*3+1, ny*3, 21, 2);
      r = Math.round(lerp(88, 132, wn));
      g = Math.round(lerp(83, 124, wn));
      b = Math.round(lerp(78, 116, wn));
      // Top-down stone block pattern
      const bRow = Math.floor(y / 22);
      const inMortar = y % 22 < 2 || (x + (bRow%2)*13) % 26 < 2;
      if (inMortar) { r=Math.round(r*0.58); g=Math.round(g*0.58); b=Math.round(b*0.58); }
      // Ivy on outer west wall
      const ivyN = fbm(nx*4+8, ny*4+8, 17);
      if (x < tL+20 && ivyN > 0.55) {
        r=Math.round(lerp(r,28,0.5)); g=Math.round(lerp(g,78,0.5)); b=Math.round(lerp(b,18,0.5));
      }
    }

    // Interior: dark hollow viewed from above, with scattered debris
    if (inInner) {
      const dn = fbm(nx*2+0.5, ny*2+0.5, 88, 2);
      r = Math.round(lerp(18, 40, dn));
      g = Math.round(lerp(14, 32, dn));
      b = Math.round(lerp(12, 28, dn));
      // Debris / fallen stone chunks on floor
      if (dn > 0.62) {
        const dt = (dn-0.62)/0.38;
        r=Math.round(lerp(r, 65, dt*0.5)); g=Math.round(lerp(g, 60, dt*0.5)); b=Math.round(lerp(b, 55, dt*0.5));
      }
      // Glowing embers / brazier at center
      const cd = Math.hypot(x-200, y-200);
      if (cd < 45) {
        const ct = clamp(1 - cd/45, 0, 1) ** 2;
        r=Math.round(lerp(r, 210, ct*0.55)); g=Math.round(lerp(g, 100, ct*0.55)); b=Math.round(lerp(b, 15, ct*0.55));
      }
      if (cd < 7) { r=255; g=190; b=60; }
    }

    // Collapsed NE corner (broken wall section)
    if (x > 270 && y < 130 && !inInner) {
      const rubN = fbm(x/20, y/20, 33);
      r=Math.round(lerp(r, Math.round(lerp(68,108,rubN)), 0.8));
      g=Math.round(lerp(g, Math.round(lerp(63, 98,rubN)), 0.8));
      b=Math.round(lerp(b, Math.round(lerp(58, 92,rubN)), 0.8));
    }

    // South doorway opening in wall
    if (x>186 && x<214 && y>tB-tWall && y<tB+4 && inOuter) {
      const dn2 = fbm(nx*2, ny*2, 44);
      r=Math.round(lerp(18,38,dn2)); g=Math.round(lerp(14,30,dn2)); b=Math.round(lerp(12,26,dn2));
    }

    // Subtle edge fade
    const ev = clamp(Math.min(x, 399-x, y, 399-y) / 40, 0, 1);
    r = Math.round(r * (0.92 + 0.08*ev));
    g = Math.round(g * (0.92 + 0.08*ev));
    b = Math.round(b * (0.92 + 0.08*ev));

    return [clamp(r,0,255), clamp(g,0,255), clamp(b,0,255), 255];
  });
}

// ──── Cell 0,2 – Maw of Darkness (top-down cave opening) ────────────────────
function cell_0_2() {
  return makePNG(400, 400, (x, y) => {
    const nx = x/70, ny = y/70;
    const n = fbm(nx, ny, 111);

    // Rocky ground from above – same grey-brown tones as surrounding cells
    let r = Math.round(lerp(58, 98, n));
    let g = Math.round(lerp(55, 90, n));
    let b = Math.round(lerp(52, 86, n));

    // Top edge blends to grass/riverbank (cell 0,1 is above)
    if (y < 30) {
      const bt = (30 - y) / 30;
      r = Math.round(lerp(r, 50, bt * 0.4));
      g = Math.round(lerp(g, 95, bt * 0.4));
      b = Math.round(lerp(b, 38, bt * 0.4));
    }

    // Large boulders ringing the pit entrance
    const boulders = [
      [85, 80, 26],[320, 95, 22],[155, 55, 18],[265, 48, 20],
      [65, 200, 20],[335, 230, 18],[110, 320, 22],[295, 340, 19]
    ];
    for (const [bx, by, br] of boulders) {
      const d = Math.hypot(x-bx, y-by);
      if (d < br) {
        r = Math.round(lerp(42, 82, d/br));
        g = Math.round(lerp(40, 78, d/br));
        b = Math.round(lerp(38, 74, d/br));
        // SE shadow rim
        if (x > bx+br*0.25 && y > by+br*0.25 && d > br*0.65) {
          r=Math.round(r*0.6); g=Math.round(g*0.6); b=Math.round(b*0.6);
        }
      }
    }

    // Cave mouth – large dark pit viewed from above
    const caveCX=205, caveCY=230, caveRX=120, caveRY=140;
    const caveDist = Math.hypot((x-caveCX)/caveRX, (y-caveCY)/caveRY);
    if (caveDist < 1.15) {
      const fadeT = clamp((1.15 - caveDist) / 1.15, 0, 1);
      r=Math.round(lerp(r,  6, fadeT * 0.96));
      g=Math.round(lerp(g,  5, fadeT * 0.96));
      b=Math.round(lerp(b,  4, fadeT * 0.96));
    }

    // Mossy/wet rock around rim of cave
    const mossN = fbm(nx*2.5+5, ny*2.5+5, 77, 3);
    if (mossN > 0.62 && caveDist > 1.1 && caveDist < 1.6) {
      const mt = clamp((mossN-0.62)/0.38, 0, 1);
      r=Math.round(lerp(r, 28, mt*0.5)); g=Math.round(lerp(g, 68, mt*0.5)); b=Math.round(lerp(b, 18, mt*0.5));
    }

    // Small pebble texture
    const pebN = fbm(nx*7+2, ny*7+2, 33, 2);
    if (pebN > 0.74 && caveDist > 1.2) {
      r=Math.round(r*0.72); g=Math.round(g*0.72); b=Math.round(b*0.72);
    }

    // Subtle edge fade
    const ev = clamp(Math.min(x, 399-x, y, 399-y) / 40, 0, 1);
    r = Math.round(r * (0.92 + 0.08*ev));
    g = Math.round(g * (0.92 + 0.08*ev));
    b = Math.round(b * (0.92 + 0.08*ev));

    return [clamp(r,0,255), clamp(g,0,255), clamp(b,0,255), 255];
  });
}

// ──── Cell 1,2 – The Underhalls ─────────────────────────────────────────────
function cell_1_2() {
  return makePNG(400, 400, (x, y) => {
    const nx = x/50, ny = y/50;
    const n = fbm(nx, ny, 222);

    // Very dark stone
    let r = Math.round(lerp(28, 55, n));
    let g = Math.round(lerp(25, 50, n));
    let b = Math.round(lerp(22, 48, n));

    // Hewn stone blocks
    const blockH = 40, blockW = 55;
    const bRow = Math.floor(y / blockH);
    const bOff = (bRow % 2) * (blockW * 0.5);
    const bCol = Math.floor((x + bOff) / blockW);
    const inGrout = (y % blockH) < 3 || (x + bOff) % blockW < 3;
    if (inGrout) {
      r=Math.round(r*0.5); g=Math.round(g*0.5); b=Math.round(b*0.5);
    }

    // Two torches with glow
    const torches = [[80,130],[320,130],[80,300],[320,300]];
    for (const [tx,ty] of torches) {
      const gd = Math.hypot(x-tx, y-ty);
      if (gd < 80) {
        const gt = clamp(1-gd/80, 0, 1) * clamp(1-gd/80, 0, 1);
        r=Math.round(lerp(r, 230, gt*0.7));
        g=Math.round(lerp(g, 120, gt*0.7));
        b=Math.round(lerp(b,  20, gt*0.7));
      }
      if (gd < 6) { r=255; g=200; b=60; }
      // sconce bracket
      if (gd > 7 && gd < 12) { r=80; g=70; b=60; }
    }

    // Wooden door in bottom center
    const dX=175, dY=330, dW=50, dH=70;
    if (x>dX && x<dX+dW && y>dY && y<dY+dH) {
      const dn = fbm((x-dX)/10, (y-dY)/10, 99);
      r=Math.round(lerp(85,115,dn)); g=Math.round(lerp(55, 75,dn)); b=Math.round(lerp(30, 45,dn));
      // planks
      if ((y-dY)%16 < 2) { r=Math.round(r*0.75); g=Math.round(g*0.75); b=Math.round(b*0.75); }
      // door knob
      if (Math.hypot(x-(dX+dW-10), y-(dY+dH/2)) < 4) { r=200; g=160; b=20; }
    }

    // Pillars
    const pils = [[40,200],[360,200]];
    for (const [px,py] of pils) {
      const pd = Math.hypot(x-px, y-py);
      if (pd < 24) {
        const pn = fbm((x-px)/7, (y-py)/7, 44);
        r=Math.round(lerp(55,90,pn)); g=Math.round(lerp(50,85,pn)); b=Math.round(lerp(45,80,pn));
        if (pd>18) { r=Math.round(r*0.65); g=Math.round(g*0.65); b=Math.round(b*0.65); }
      }
    }

    return [clamp(r,0,255), clamp(g,0,255), clamp(b,0,255), 255];
  });
}

// ──── Cell 2,2 – Whisper Graveyard ──────────────────────────────────────────
function cell_2_2() {
  return makePNG(400, 400, (x, y) => {
    const nx = x/70, ny = y/70;
    const n = fbm(nx, ny, 333);

    // Dark, slightly purple-tinted earth
    let r = Math.round(lerp(28, 60, n));
    let g = Math.round(lerp(38, 72, n));
    let b = Math.round(lerp(25, 55, n));

    // Dead grass patches
    const gn = fbm(nx*3+2, ny*3+2, 444, 3);
    if (gn > 0.55) {
      r=Math.round(lerp(r,60,0.4)); g=Math.round(lerp(g,70,0.4)); b=Math.round(lerp(b,30,0.4));
    }

    // Tombstones
    const tombs = [
      [70,80,32,48],[160,100,28,44],[280,70,30,46],
      [110,200,26,42],[230,220,32,50],[340,190,28,44],
      [80,320,30,46],[190,340,26,40],[310,310,34,52],[370,350,24,38]
    ];
    for (const [tx,ty,tw,th] of tombs) {
      // Main stone
      if (x>tx && x<tx+tw && y>ty && y<ty+th) {
        const tn = fbm((x-tx)/8, (y-ty)/8, 77);
        r=Math.round(lerp(90,130,tn));
        g=Math.round(lerp(88,125,tn));
        b=Math.round(lerp(92,130,tn));
        // inscription line
        if (Math.abs(y-(ty+th*0.4)) < 2 && x>tx+4 && x<tx+tw-4) {
          r=Math.round(r*0.6); g=Math.round(g*0.6); b=Math.round(b*0.6);
        }
        // Rounded top
        const topR = tw/2, topCY = ty + topR;
        if (y < topCY && Math.hypot(x-(tx+tw/2), y-topCY) < topR) {
          r=Math.round(lerp(90,130,tn));
          g=Math.round(lerp(88,125,tn));
          b=Math.round(lerp(92,130,tn));
        }
      }
    }

    // Dead trees
    const deadTrees = [[200,150],[350,280]];
    for (const [dtx,dty] of deadTrees) {
      // Trunk
      if (Math.abs(x-dtx) < 5 && y > dty && y < dty+120) {
        r=50; g=40; b=32;
      }
      // Branches
      const branches = [[-25,-40,-3,-10],[25,-45,3,-15],[0,-60,0,-20],[-15,-20,-30,-50],[15,-22,28,-48]];
      for (const [bx1,by1,bx2,by2] of branches) {
        const len = Math.hypot(bx2-bx1, by2-by1);
        for (let t2=0; t2<=1; t2+=0.02) {
          const bx = dtx + lerp(bx1,bx2,t2);
          const by = dty + lerp(by1,by2,t2);
          if (Math.hypot(x-bx, y-by) < 3) { r=50; g=40; b=32; }
        }
      }
    }

    // Mist / fog wisps (low alpha overlay)
    const mistN = fbm(nx*0.8+5, ny*0.8+5, 555, 2);
    if (mistN > 0.58 && y > 200) {
      const mt = (mistN-0.58)/0.42;
      r=Math.round(lerp(r,170,mt*0.25));
      g=Math.round(lerp(g,175,mt*0.25));
      b=Math.round(lerp(b,180,mt*0.25));
    }

    // Subtle edge fade
    const ev = clamp(Math.min(x, 399-x, y, 399-y) / 40, 0, 1);
    r=Math.round(r*(0.92+0.08*ev)); g=Math.round(g*(0.92+0.08*ev)); b=Math.round(b*(0.92+0.08*ev));

    return [clamp(r,0,255), clamp(g,0,255), clamp(b,0,255), 255];
  });
}

// ──── Fog canvas generator (1200×1200, RGBA) ─────────────────────────────────
// Returns fully-black fog PNG (1200×1200) - all covered
function makeFogFull() {
  // Small version: 1x1 black pixel scaled to fill by drawImage with no size args
  // Actually we need real size. Use a 6x6 block-encoded version scaled.
  // Just do real 1200x1200 - deflate handles solid color very efficiently
  // Actually let's do 120x120 scaled - the import draws at native size so size matters.
  // Use a small repeating tile... no, drawImage(img, 0, 0) draws at natural size.
  // Let's do 1200x1200 for full coverage.
  return makePNG(1200, 1200, () => [0, 0, 0, 255]);
}

// Fog with center cell (400,400)→(800,800) revealed (transparent)
function makeFogCenterRevealed() {
  return makePNG(1200, 1200, (x, y) => {
    // Revealed region: cell (1,1) = x in [400,800], y in [400,800]
    // Plus a partial reveal along top path (cell 1,0 bottom portion)
    if (x >= 400 && x <= 800 && y >= 400 && y <= 800) {
      // Soft edge
      const ex = Math.min(x - 400, 800 - x) / 40;
      const ey = Math.min(y - 400, 800 - y) / 40;
      const edge = clamp(Math.min(ex, ey), 0, 1);
      return [0, 0, 0, Math.round((1 - edge) * 0)]; // fully transparent at center
    }
    // Partial reveal: bottom of forest trail (1,0) -> bottom 80px
    if (x >= 440 && x <= 760 && y >= 340 && y <= 400) {
      const t = (y - 340) / 60;
      return [0, 0, 0, Math.round(lerp(255, 0, t))];
    }
    // Partial reveal: tower entrance (2,1) left edge
    if (x >= 800 && x <= 870 && y >= 440 && y <= 760) {
      const t = (x - 800) / 70;
      return [0, 0, 0, Math.round(lerp(0, 255, t))];
    }
    return [0, 0, 0, 255]; // fully covered
  });
}

// ──── Build the campaign JSON ─────────────────────────────────────────────────

console.log('Generating terrain tiles (this may take ~30s)...');

console.log('  [1/9] Elderwood Forest (0,0)...');
const t00 = cell_0_0();
console.log('  [2/9] Forest Trail (1,0)...');
const t10 = cell_1_0();
console.log('  [3/9] Stormcrest Peaks (2,0)...');
const t20 = cell_2_0();
console.log('  [4/9] Silverbrook Crossing (0,1)...');
const t01 = cell_0_1();
console.log('  [5/9] Ruins of Ashenvale courtyard (1,1)...');
const t11 = cell_1_1();
console.log('  [6/9] Sunken Tower (2,1)...');
const t21 = cell_2_1();
console.log('  [7/9] Maw of Darkness (0,2)...');
const t02 = cell_0_2();
console.log('  [8/9] The Underhalls (1,2)...');
const t12 = cell_1_2();
console.log('  [9/9] Whisper Graveyard (2,2)...');
const t22 = cell_2_2();

console.log('Generating fog of war canvases...');
const fogFull     = makeFogFull();
const fogRevealed = makeFogCenterRevealed();

console.log('Assembling campaign...');

// Token color palette
const GOLD   = '#c8922a';
const RED    = '#9b2335';
const BLUE   = '#1e3a5f';
const GREEN  = '#1a4a2e';
const PURPLE = '#4a1a7a';
const GREY   = '#3a3a3a';

const now = new Date().toISOString();
const baseTime = 1740000000000;

const campaign = {
  version: '4.0',
  name: 'The Ruins of Ashenvale',
  sessionId: 'ashenvale-2226',
  exported: now,

  // ── Grid cells: 9 terrain tiles ──────────────────────────────────────────
  gridCells: {
    '0,0': `data:image/png;base64,${t00}`,
    '1,0': `data:image/png;base64,${t10}`,
    '2,0': `data:image/png;base64,${t20}`,
    '0,1': `data:image/png;base64,${t01}`,
    '1,1': `data:image/png;base64,${t11}`,
    '2,1': `data:image/png;base64,${t21}`,
    '0,2': `data:image/png;base64,${t02}`,
    '1,2': `data:image/png;base64,${t12}`,
    '2,2': `data:image/png;base64,${t22}`,
  },

  // ── Locked cells: cave & underhalls ──────────────────────────────────────
  lockedCells: {
    '0,2': true,  // Cave entrance – DM-only area
    '1,2': true,  // Underhalls – DM-only
  },

  // ── Fog of war groups ─────────────────────────────────────────────────────
  fogGroups: {
    everyone: {
      name: 'Everyone',
      canvas: `data:image/png;base64,${fogRevealed}`,
    },
    partyA: {
      name: 'Scouting Party',
      canvas: `data:image/png;base64,${fogFull}`,
    },
  },
  activeFogGroup: 'everyone',

  // ── Staging tokens: party members waiting to be placed ───────────────────
  stagingTokens: [
    {
      id: baseTime + 1,
      type: 'emoji',
      icon: '⚔️',
      color: BLUE,
      size: 14,
      owner: 'Player 1',
      approved: true,
      name: 'Fighter',
    },
    {
      id: baseTime + 2,
      type: 'emoji',
      icon: '🧙',
      color: PURPLE,
      size: 14,
      owner: 'Player 2',
      approved: true,
      name: 'Wizard',
    },
    {
      id: baseTime + 3,
      type: 'emoji',
      icon: '🏹',
      color: GREEN,
      size: 14,
      owner: 'Player 3',
      approved: true,
      name: 'Ranger',
    },
    {
      id: baseTime + 4,
      type: 'emoji',
      icon: '✨',
      color: GOLD,
      size: 14,
      owner: 'Player 4',
      approved: true,
      name: 'Cleric',
    },
  ],

  // ── Placed tokens: enemies already on the map ─────────────────────────────
  // World coords: cell(col,row) top-left = (col*400, row*400)
  placedTokens: [
    // ── Ruins courtyard (1,1) — center area ──────────────────────────────
    {
      id: baseTime + 10,
      type: 'emoji',
      icon: '👹',
      color: RED,
      size: 14,
      owner: 'DM',
      approved: true,
      name: 'Goblin Scout',
      x: 530,
      y: 480,
    },
    {
      id: baseTime + 11,
      type: 'emoji',
      icon: '👹',
      color: RED,
      size: 14,
      owner: 'DM',
      approved: true,
      name: 'Goblin Archer',
      x: 700,
      y: 510,
    },
    {
      id: baseTime + 12,
      type: 'emoji',
      icon: '💀',
      color: GREY,
      size: 14,
      owner: 'DM',
      approved: true,
      name: 'Skeleton Guard',
      x: 600,
      y: 680,
    },
    // ── Altar / ritual circle ─────────────────────────────────────────────
    {
      id: baseTime + 13,
      type: 'emoji',
      icon: '🔮',
      color: PURPLE,
      size: 12,
      owner: 'DM',
      approved: true,
      name: 'Arcane Focus',
      x: 600,
      y: 600,
    },
    // ── Sunken Tower (2,1) ────────────────────────────────────────────────
    {
      id: baseTime + 20,
      type: 'emoji',
      icon: '🧟',
      color: GREEN,
      size: 14,
      owner: 'DM',
      approved: true,
      name: 'Zombie Guard',
      x: 920,
      y: 520,
    },
    {
      id: baseTime + 21,
      type: 'emoji',
      icon: '🗡️',
      color: GREY,
      size: 12,
      owner: 'DM',
      approved: true,
      name: 'Tower Warden',
      x: 1050,
      y: 650,
    },
    // ── Cave mouth (0,2) ──────────────────────────────────────────────────
    {
      id: baseTime + 30,
      type: 'emoji',
      icon: '🕷️',
      color: GREY,
      size: 12,
      owner: 'DM',
      approved: true,
      name: 'Giant Spider',
      x: 180,
      y: 940,
    },
    {
      id: baseTime + 31,
      type: 'emoji',
      icon: '🕷️',
      color: GREY,
      size: 12,
      owner: 'DM',
      approved: true,
      name: 'Giant Spider',
      x: 240,
      y: 1020,
    },
    // ── Graveyard (2,2) — boss ────────────────────────────────────────────
    {
      id: baseTime + 40,
      type: 'emoji',
      icon: '☠️',
      color: '#2a0a2a',
      size: 18,
      owner: 'DM',
      approved: true,
      name: 'Malgrath the Undying',
      x: 1000,
      y: 980,
    },
    {
      id: baseTime + 41,
      type: 'emoji',
      icon: '💀',
      color: GREY,
      size: 12,
      owner: 'DM',
      approved: true,
      name: 'Skeleton',
      x: 870,
      y: 870,
    },
    {
      id: baseTime + 42,
      type: 'emoji',
      icon: '💀',
      color: GREY,
      size: 12,
      owner: 'DM',
      approved: true,
      name: 'Skeleton',
      x: 1100,
      y: 920,
    },
  ],

  // ── Placed images (none — all art is in gridCells) ────────────────────────
  placedImages: [],

  // ── Player roster ─────────────────────────────────────────────────────────
  playerData: [
    { name: 'Player 1', role: 'player', peerId: 'player1-peer' },
    { name: 'Player 2', role: 'player', peerId: 'player2-peer' },
    { name: 'Player 3', role: 'player', peerId: 'player3-peer' },
    { name: 'Player 4', role: 'player', peerId: 'player4-peer' },
  ],

  // ── View state: centered on ruins courtyard ───────────────────────────────
  zoom:           1.0,
  panX:           0,
  panY:           0,
  currentCellX:   1,
  currentCellY:   1,
  gridSnapEnabled: true,
};

const outPath = '/home/user/dnd-save/campaigns/ruins_of_ashenvale.json';
require('fs').mkdirSync('/home/user/dnd-save/campaigns', { recursive: true });
require('fs').writeFileSync(outPath, JSON.stringify(campaign, null, 2));

const stats = require('fs').statSync(outPath);
console.log(`\n✅ Campaign written to: ${outPath}`);
console.log(`   File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
console.log('\nCampaign "The Ruins of Ashenvale" includes:');
console.log('  - 9 hand-crafted terrain tiles (400×400 each)');
console.log('  - 2 fog-of-war groups (Everyone + Scouting Party)');
console.log('  - Center cell revealed, rest fog-covered');
console.log('  - 4 party staging tokens (Fighter, Wizard, Ranger, Cleric)');
console.log('  - 11 placed enemy tokens (goblins, skeletons, spiders, boss)');
console.log('  - 2 locked cells (cave & underhalls — DM-only)');
console.log('  - Grid snap enabled, 4-player roster');
