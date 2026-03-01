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

    // Edge vignette
    const ex = Math.min(x, 399-x)/120, ey = Math.min(y, 399-y)/120;
    const ev = clamp(Math.min(ex,ey), 0, 1);
    r = Math.round(r * (0.6 + 0.4*ev));
    g = Math.round(g * (0.6 + 0.4*ev));
    b = Math.round(b * (0.6 + 0.4*ev));

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

    // Edge vignette
    const ev = clamp(Math.min(x, 399-x, y, 399-y) / 80, 0, 1);
    r = Math.round(r * (0.65 + 0.35*ev));
    g = Math.round(g * (0.65 + 0.35*ev));
    b = Math.round(b * (0.65 + 0.35*ev));

    return [clamp(r,0,255), clamp(g,0,255), clamp(b,0,255), 255];
  });
}

// ──── Cell 2,0 – Stormcrest Peaks ───────────────────────────────────────────
function cell_2_0() {
  return makePNG(400, 400, (x, y) => {
    const nx = x/100, ny = y/100;
    const n = fbm(nx, ny, 33);

    // Sky gradient (top) → rocky ground (bottom)
    const skyT = clamp(y / 200, 0, 1);
    let r = Math.round(lerp(55, 90, skyT));
    let g = Math.round(lerp(65, 80, skyT));
    let b = Math.round(lerp(85, 70, skyT));

    // Mountain silhouettes
    function mtn(px, py, peakX, peakY, width) {
      const dx = px - peakX;
      const slope = Math.abs(dx) / width;
      return py > peakY + slope * (400 - peakY);
    }
    const inMtn = mtn(x, y, 120, 60,  160) ||
                  mtn(x, y, 310, 30,  140) ||
                  mtn(x, y, 200, 120, 110);

    if (inMtn) {
      const rockyN = fbm(nx*3+1, ny*3+1, 55, 3);
      r = Math.round(lerp(55, 95, rockyN));
      g = Math.round(lerp(55, 90, rockyN));
      b = Math.round(lerp(58, 95, rockyN));
      // Snow caps
      const snowLine = 90 + Math.sin(x/25)*12;
      if (y < snowLine) {
        const snowT = clamp((snowLine - y) / 30, 0, 1);
        r = Math.round(lerp(r, 230, snowT));
        g = Math.round(lerp(g, 230, snowT));
        b = Math.round(lerp(b, 240, snowT));
      }
    }

    // Scree / gravel at bottom
    if (y > 310) {
      const gn = fbm(nx*4, ny*4, 77);
      r = Math.round(lerp(r, 100, (y-310)/90));
      g = Math.round(lerp(g, 95,  (y-310)/90));
      b = Math.round(lerp(b, 90,  (y-310)/90));
    }

    // Clouds
    function cloud(cx, cy, cr) {
      return Math.hypot(x-cx, y-cy) < cr;
    }
    if (cloud(80,80,22)||cloud(100,75,18)||cloud(65,82,16)) {
      r=Math.round(lerp(r,220,0.7)); g=Math.round(lerp(g,225,0.7)); b=Math.round(lerp(b,230,0.7));
    }
    if (cloud(290,55,20)||cloud(310,50,16)||cloud(275,58,14)) {
      r=Math.round(lerp(r,215,0.6)); g=Math.round(lerp(g,220,0.6)); b=Math.round(lerp(b,228,0.6));
    }

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

    // Edge vignette
    const ev = clamp(Math.min(x, 399-x, y, 399-y) / 70, 0, 1);
    r=Math.round(r*(0.65+0.35*ev)); g=Math.round(g*(0.65+0.35*ev)); b=Math.round(b*(0.65+0.35*ev));

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

// ──── Cell 2,1 – Sunken Tower ───────────────────────────────────────────────
function cell_2_1() {
  return makePNG(400, 400, (x, y) => {
    const nx = x/60, ny = y/60;
    const n = fbm(nx, ny, 55);

    // Base: rubble-covered ground
    let r = Math.round(lerp(75, 120, n));
    let g = Math.round(lerp(70, 110, n));
    let b = Math.round(lerp(65, 105, n));

    // Tower silhouette (left side stands, right is collapsed)
    const towerL=80, towerR=250, towerTop=30;
    const inTower = x > towerL && x < towerR && y > towerTop;
    if (inTower) {
      const tn = fbm(nx*3+1, ny*3, 21, 2);
      r=Math.round(lerp(80, 118, tn));
      g=Math.round(lerp(75, 110, tn));
      b=Math.round(lerp(70, 105, tn));
      // mortar lines
      const brickRow = Math.floor((y-towerTop) / 22);
      const brickCol = Math.floor((x-towerL)  / 26 + (brickRow%2)*0.5);
      const inMortar = (y-towerTop) % 22 < 2 || (x - towerL + (brickRow%2)*13) % 26 < 2;
      if (inMortar) { r=Math.round(r*0.58); g=Math.round(g*0.58); b=Math.round(b*0.58); }
      // inner darkness (hollow tower)
      if (x > towerL+20 && x < towerR-20 && y > towerTop+60) {
        r=Math.round(lerp(r,20,0.6)); g=Math.round(lerp(g,15,0.6)); b=Math.round(lerp(b,12,0.6));
      }
    }

    // Collapsed rubble pile (right side, lower)
    const rubbleN = fbm(x/25, y/25, 33);
    if (x > 210 && y > 150 + (x-210)*0.4) {
      r=Math.round(lerp(r, Math.round(lerp(70,110,rubbleN)), 0.7));
      g=Math.round(lerp(g, Math.round(lerp(65,100,rubbleN)), 0.7));
      b=Math.round(lerp(b, Math.round(lerp(60, 95,rubbleN)), 0.7));
    }

    // Ivy on tower wall
    const ivyN = fbm(nx*4+8, ny*4+8, 17);
    if (inTower && x < towerL+18 && ivyN > 0.55) {
      r=Math.round(lerp(r,30,0.6)); g=Math.round(lerp(g,80,0.6)); b=Math.round(lerp(b,20,0.6));
    }

    // Window opening
    const wx=170, wy=120, ww=30, wh=45;
    if (x>wx && x<wx+ww && y>wy && y<wy+wh) { r=8; g=6; b=5; }

    // Arrow slit
    if (x>145 && x<155 && y>200 && y<240) { r=8; g=6; b=5; }

    // Torch sconce glow on wall
    const gd = Math.hypot(x-100, y-180);
    if (gd < 30) {
      const gt = clamp(1 - gd/30, 0, 1);
      r=Math.round(lerp(r, 220, gt*gt*0.5));
      g=Math.round(lerp(g, 140, gt*gt*0.5));
      b=Math.round(lerp(b,  30, gt*gt*0.5));
    }
    if (Math.hypot(x-100, y-178) < 5) { r=255; g=200; b=80; }

    return [clamp(r,0,255), clamp(g,0,255), clamp(b,0,255), 255];
  });
}

// ──── Cell 0,2 – Maw of Darkness (cave entrance) ────────────────────────────
function cell_0_2() {
  return makePNG(400, 400, (x, y) => {
    const nx = x/70, ny = y/70;
    const n = fbm(nx, ny, 111);

    // Rock face exterior
    let r = Math.round(lerp(55, 95, n));
    let g = Math.round(lerp(52, 88, n));
    let b = Math.round(lerp(50, 85, n));

    // Cave mouth – large dark irregular oval in center/bottom
    const caveCX=200, caveCY=280, caveRX=130, caveRY=150;
    const caveDist = Math.hypot((x-caveCX)/caveRX, (y-caveCY)/caveRY);
    if (caveDist < 1) {
      const fadeT = clamp(1 - caveDist, 0, 1);
      r=Math.round(lerp(r, 5, fadeT * 0.95));
      g=Math.round(lerp(g, 4, fadeT * 0.95));
      b=Math.round(lerp(b, 4, fadeT * 0.95));
    }

    // Stalactites hanging from cave top
    const stals = [[120,0,18,60],[160,0,12,45],[200,0,20,70],[245,0,14,50],[280,0,10,38]];
    for (const [sx, sy, sw, sh] of stals) {
      if (x > sx-sw && x < sx+sw) {
        const progress = (x-sx+sw)/(sw*2);
        const stalH = sh * (1 - Math.abs(progress - 0.5)*2);
        if (y < stalH) {
          const sn = fbm((x-sx)/8, y/8, 55);
          r=Math.round(lerp(60,100,sn)); g=Math.round(lerp(58,95,sn)); b=Math.round(lerp(55,90,sn));
        }
      }
    }

    // Creeping darkness vignette towards cave
    const vigD = Math.hypot((x-200)/250, (y-300)/300);
    const vig = clamp(1 - vigD, 0, 1);
    r=Math.round(r * (1 - vig * 0.35));
    g=Math.round(g * (1 - vig * 0.35));
    b=Math.round(b * (1 - vig * 0.35));

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

    // Dark vignette
    const ev = clamp(Math.min(x, 399-x, y, 399-y) / 80, 0, 1);
    r=Math.round(r*(0.6+0.4*ev)); g=Math.round(g*(0.6+0.4*ev)); b=Math.round(b*(0.6+0.4*ev));

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
