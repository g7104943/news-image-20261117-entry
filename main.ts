// News-image entry: "17 November 2026" front page, drawn from scratch.
// Node 22, standard library only. No network. Deterministic output:
// the same bytes on every run. Writes entry.png to MAKEFUN_OUTPUT_DIR
// (or /output when the variable is not set).
//
// The picture is a newspaper front page: a masthead naming the date,
// four illustrated stories (Ukraine, the Gulf, the Shenzhen summit and
// the day's tech outages) and an "also today" strip, all hand-drawn
// pixel by pixel with a tiny built-in bitmap font and a hand-rolled
// PNG encoder below.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

// ---------------------------------------------------------------- PNG --
// Minimal PNG writer: signature, IHDR, one IDAT (zlib), IEND.
// Colour type 2 (RGB), 8 bit, no interlace. Fully deterministic:
// no timestamps or random data anywhere in the file.

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, 'latin1');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng(width, height, rgb) {
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 3)] = 0; // filter: none
    rgb.copy(raw, y * (1 + width * 3) + 1, y * width * 3, (y + 1) * width * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------- canvas --
// A 1024x1024 RGB framebuffer with simple shape primitives.

const W = 1024;
const H = 1024;

class Canvas {
  constructor() {
    this.pixels = Buffer.alloc(W * H * 3);
  }
  set(x, y, color) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 3;
    this.pixels[i] = color[0];
    this.pixels[i + 1] = color[1];
    this.pixels[i + 2] = color[2];
  }
  fill(color) {
    for (let i = 0; i < W * H; i++) {
      this.pixels[i * 3] = color[0];
      this.pixels[i * 3 + 1] = color[1];
      this.pixels[i * 3 + 2] = color[2];
    }
  }
  rect(x, y, w, h, color) {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) this.set(xx, yy, color);
    }
  }
  // 1px outline rectangle
  frame(x, y, w, h, color) {
    this.rect(x, y, w, 1, color);
    this.rect(x, y + h - 1, w, 1, color);
    this.rect(x, y, 1, h, color);
    this.rect(x + w - 1, y, 1, h, color);
  }
  // 2px outline rectangle
  frame2(x, y, w, h, color) {
    this.frame(x, y, w, h, color);
    this.frame(x + 1, y + 1, w - 2, h - 2, color);
  }
  line(x0, y0, x1, y1, color) {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;
    for (;;) {
      this.set(x, y, color);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }
  // thick line drawn as a stack of parallel 1px lines
  thickLine(x0, y0, x1, y1, t, color) {
    for (let i = 0; i < t; i++) this.line(x0, y0 + i, x1, y1 + i, color);
  }
  circle(cx, cy, r, color) {
    for (let yy = -r; yy <= r; yy++) {
      const half = Math.floor(Math.sqrt(r * r - yy * yy));
      for (let xx = -half; xx <= half; xx++) this.set(cx + xx, cy + yy, color);
    }
  }
  ring(cx, cy, r, t, color) {
    for (let yy = -r; yy <= r; yy++) {
      for (let xx = -r; xx <= r; xx++) {
        const d = Math.sqrt(xx * xx + yy * yy);
        if (d <= r && d > r - t) this.set(cx + xx, cy + yy, color);
      }
    }
  }
  ellipse(cx, cy, rx, ry, color) {
    for (let yy = -ry; yy <= ry; yy++) {
      const half = Math.floor(rx * Math.sqrt(1 - (yy * yy) / (ry * ry)));
      for (let xx = -half; xx <= half; xx++) this.set(cx + xx, cy + yy, color);
    }
  }
  // filled polygon from a list of [x, y] vertices (scanline fill)
  polygon(points, color) {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const xs = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
          xs.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]));
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.ceil(xs[k]); x <= Math.floor(xs[k + 1]); x++) {
          this.set(x, y, color);
        }
      }
    }
  }
}

// -------------------------------------------------------------- font ---
// A 5x7 bitmap font, uppercase only (newspaper style). Each glyph is
// 7 rows of 5 cells; '#' is ink, '.' is empty.

const FONT = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  D: ['###..', '#..#.', '#...#', '#...#', '#...#', '#..#.', '###..'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.####', '#....', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '.#.#.', '..#..', '..#..', '..#..', '.#.#.', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '...#.', '..#..', '..#..', '..#..'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.....', '.##..', '.#...'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  ';': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.#...'],
  "'": ['..#..', '..#..', '.#...', '.....', '.....', '.....', '.....'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '/': ['....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  '&': ['.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#'],
  '%': ['#...#', '#..#.', '...#.', '..#..', '.#...', '#..#.', '#...#'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
  '"': ['.#.#.', '.#.#.', '.....', '.....', '.....', '.....', '.....'],
  '*': ['.....', '.#.#.', '..#..', '#####', '..#..', '.#.#.', '.....'],
};

function textWidth(text, scale) {
  return text.length * 6 * scale - scale;
}

function drawText(cv, text, x, y, scale, color) {
  let cx = x;
  for (const ch of text) {
    const glyph = FONT[ch] || FONT['?'];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (glyph[row][col] === '#') {
          cv.rect(cx + col * scale, y + row * scale, scale, scale, color);
        }
      }
    }
    cx += 6 * scale;
  }
}

function drawTextCentered(cv, text, cx, y, scale, color) {
  drawText(cv, text, cx - Math.floor(textWidth(text, scale) / 2), y, scale, color);
}

// Word-wrap: returns an array of lines that fit in maxWidth pixels.
function wrapText(text, scale, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const trial = line ? line + ' ' + word : word;
    if (textWidth(trial, scale) <= maxWidth || !line) {
      line = trial;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawWrapped(cv, text, x, y, scale, lineHeight, color, maxWidth, maxLines) {
  const lines = wrapText(text, scale, maxWidth).slice(0, maxLines);
  lines.forEach((ln, i) => drawText(cv, ln, x, y + i * lineHeight, scale, color));
  return lines.length;
}

// ------------------------------------------------------------ palette --

const PAPER = [246, 241, 227];
const CARD = [255, 253, 246];
const INK = [26, 26, 26];
const NAVY = [22, 35, 63];
const GOLD = [201, 162, 39];
const RED = [179, 38, 30];
const BLUE = [44, 90, 160];
const SKY = [178, 214, 235];
const SEA = [38, 110, 158];
const STEEL = [96, 104, 116];
const ORANGE = [232, 116, 30];
const YELLOW = [245, 200, 40];
const GREEN = [46, 125, 70];

// -------------------------------------------------------- illustrations --
// Each scene is drawn inside the box (x, y, w, h) at the top of a panel.
// All shapes are plain rectangles, circles, ellipses and polygons.

function drawBridgeScene(cv, x, y, w, h) {
  // sky and water
  cv.rect(x, y, w, Math.floor(h * 0.62), SKY);
  cv.rect(x, y + Math.floor(h * 0.62), w, h - Math.floor(h * 0.62), SEA);
  // sun
  cv.circle(x + 52, y + 26, 16, YELLOW);
  // bridge deck: left span, a broken gap, right span
  const deckY = y + Math.floor(h * 0.55);
  const gapX0 = x + Math.floor(w * 0.44);
  const gapX1 = x + Math.floor(w * 0.60);
  cv.thickLine(x + 8, deckY, gapX0, deckY, 5, INK);
  cv.thickLine(gapX1, deckY, x + w - 8, deckY, 5, INK);
  // towers
  const t1 = x + Math.floor(w * 0.22);
  const t2 = x + Math.floor(w * 0.74);
  cv.rect(t1 - 5, y + 12, 10, deckY - y - 12, INK);
  cv.rect(t2 - 5, y + 12, 10, deckY - y - 12, INK);
  cv.rect(t1 - 9, y + 8, 18, 6, INK);
  cv.rect(t2 - 9, y + 8, 18, 6, INK);
  // suspension cables
  cv.line(t1, y + 14, gapX0, deckY - 4, STEEL);
  cv.line(t2, y + 14, gapX1, deckY - 4, STEEL);
  cv.line(t1, y + 14, x + 8, deckY - 4, STEEL);
  cv.line(t2, y + 14, x + w - 8, deckY - 4, STEEL);
  // broken deck ends, tilted down into the gap
  cv.line(gapX0, deckY, gapX0 + 14, deckY + 16, INK);
  cv.line(gapX1, deckY, gapX1 - 14, deckY + 16, INK);
  // explosion starburst in the gap
  const ex = Math.floor((gapX0 + gapX1) / 2);
  const ey = deckY - 6;
  cv.polygon(
    [
      [ex, ey - 30], [ex + 8, ey - 8], [ex + 28, ey - 12], [ex + 12, ey + 2],
      [ex + 22, ey + 20], [ex + 2, ey + 10], [ex - 8, ey + 26], [ex - 12, ey + 6],
      [ex - 30, ey + 8], [ex - 14, ey - 6], [ex - 24, ey - 22], [ex - 6, ey - 12],
    ],
    ORANGE,
  );
  cv.circle(ex, ey, 9, YELLOW);
  // smoke puffs
  cv.circle(ex - 26, ey - 26, 10, [220, 220, 215]);
  cv.circle(ex + 24, ey - 30, 12, [220, 220, 215]);
  cv.circle(ex, ey - 38, 11, [235, 235, 230]);
  // waves
  for (let i = 0; i < 5; i++) {
    const wx = x + 20 + i * Math.floor((w - 40) / 5);
    cv.thickLine(wx, y + h - 16, wx + 26, y + h - 16, 2, [255, 255, 255]);
  }
}

function drawSeaScene(cv, x, y, w, h) {
  // sky, sea, sun
  cv.rect(x, y, w, Math.floor(h * 0.55), SKY);
  cv.rect(x, y + Math.floor(h * 0.55), w, h - Math.floor(h * 0.55), SEA);
  cv.circle(x + w - 56, y + 24, 15, YELLOW);
  // tanker (left): hull, deck, funnel, containers
  const ty = y + Math.floor(h * 0.62);
  cv.rect(x + 18, ty - 26, 150, 26, [40, 40, 40]);
  cv.rect(x + 18, ty - 26, 150, 6, RED);
  cv.rect(x + 30, ty - 44, 26, 18, [240, 240, 240]);
  cv.rect(x + 62, ty - 40, 18, 14, BLUE);
  cv.rect(x + 86, ty - 40, 18, 14, GREEN);
  cv.rect(x + 110, ty - 40, 18, 14, YELLOW);
  cv.rect(x + 140, ty - 52, 14, 26, STEEL);
  // mine with spikes, floating near the tanker
  const mx = x + 205;
  const my = y + Math.floor(h * 0.72);
  cv.circle(mx, my, 11, INK);
  for (let a = 0; a < 8; a++) {
    const ang = (a * Math.PI) / 4;
    cv.line(
      Math.round(mx + Math.cos(ang) * 10), Math.round(my + Math.sin(ang) * 10),
      Math.round(mx + Math.cos(ang) * 17), Math.round(my + Math.sin(ang) * 17),
      INK,
    );
  }
  // small fire on the water by the mine
  cv.polygon(
    [[mx + 30, my + 6], [mx + 38, my - 12], [mx + 46, my + 6], [mx + 52, my - 4], [mx + 58, my + 6]],
    ORANGE,
  );
  // aircraft carrier (right): flat deck, island tower, jets
  const cy = y + Math.floor(h * 0.66);
  cv.rect(x + w - 190, cy - 8, 172, 10, [70, 76, 86]);
  cv.rect(x + w - 150, cy - 30, 34, 22, [90, 96, 106]);
  cv.rect(x + w - 142, cy - 38, 6, 8, [90, 96, 106]);
  cv.polygon([[x + w - 176, cy - 8], [x + w - 150, cy - 8], [x + w - 158, cy - 22], [x + w - 168, cy - 22]], STEEL);
  cv.polygon([[x + w - 120, cy - 8], [x + w - 98, cy - 8], [x + w - 104, cy - 20], [x + w - 114, cy - 20]], STEEL);
  // waves
  for (let i = 0; i < 6; i++) {
    const wx = x + 14 + i * Math.floor((w - 28) / 6);
    cv.thickLine(wx, y + h - 12, wx + 22, y + h - 12, 2, [255, 255, 255]);
  }
}

function drawFlag(cv, x, y, w, h, stripes) {
  // stripes: array of colours, top to bottom
  const sh = Math.floor(h / stripes.length);
  for (let i = 0; i < stripes.length; i++) {
    cv.rect(x, y + i * sh, w, i === stripes.length - 1 ? h - i * sh : sh, stripes[i]);
  }
  cv.frame(x, y, w, h, INK);
}

function drawSummitScene(cv, x, y, w, h) {
  // pale sky, ground, three flag poles with a round table below
  cv.rect(x, y, w, h, [232, 238, 244]);
  cv.rect(x, y + Math.floor(h * 0.78), w, h - Math.floor(h * 0.78), [196, 178, 140]);
  const poleY = y + 8;
  const poleH = Math.floor(h * 0.52);
  const flagW = 86;
  const flagH = 48;
  const centres = [0.2, 0.5, 0.8];
  const flags = [
    [[222, 40, 40], [222, 40, 40], [222, 40, 40]], // China: red
    [[178, 34, 52], [255, 255, 255], [60, 59, 110]], // USA: red/white/blue
    [[255, 255, 255], [0, 57, 166], [213, 0, 50]], // Russia: white/blue/red
  ];
  for (let i = 0; i < 3; i++) {
    const cx = x + Math.floor(w * centres[i]);
    cv.rect(cx - 2, poleY, 4, poleH, INK);
    cv.circle(cx, poleY, 5, GOLD);
    drawFlag(cv, cx + 2, poleY + 4, flagW, flagH, flags[i]);
    if (i === 0) {
      // five small gold stars on the red flag
      cv.circle(cx + 16, poleY + 16, 4, YELLOW);
      cv.circle(cx + 32, poleY + 12, 2, YELLOW);
      cv.circle(cx + 38, poleY + 20, 2, YELLOW);
      cv.circle(cx + 34, poleY + 30, 2, YELLOW);
      cv.circle(cx + 24, poleY + 32, 2, YELLOW);
    }
    if (i === 1) {
      // star field corner on the US flag
      cv.rect(cx + 2, poleY + 4, 34, 24, [60, 59, 110]);
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 4; c++) {
          cv.set(cx + 6 + c * 8, poleY + 9 + r * 7, [255, 255, 255]);
        }
      }
    }
  }
  // round table with three chairs
  const tableY = y + Math.floor(h * 0.58);
  cv.ellipse(x + Math.floor(w * 0.5), tableY, 120, 12, [120, 72, 40]);
  cv.rect(x + Math.floor(w * 0.5) - 8, tableY, 16, y + h - tableY - 6, [90, 54, 30]);
  for (const fx of [0.22, 0.5, 0.78]) {
    const chairX = x + Math.floor(w * fx);
    cv.rect(chairX - 16, tableY + 16, 32, 8, NAVY);
    cv.rect(chairX - 16, tableY + 24, 5, 18, NAVY);
    cv.rect(chairX + 11, tableY + 24, 5, 18, NAVY);
  }
}

function drawOutageScene(cv, x, y, w, h) {
  // dark server-room background
  cv.rect(x, y, w, h, [32, 38, 52]);
  // big monitor with a warning triangle
  const mx = x + 22;
  const my = y + 8;
  const mw = 190;
  const mh = 92;
  cv.rect(mx, my, mw, mh, [240, 240, 235]);
  cv.frame2(mx, my, mw, mh, INK);
  cv.polygon(
    [[mx + 95, my + 10], [mx + 148, my + 80], [mx + 42, my + 80]],
    YELLOW,
  );
  cv.rect(mx + 90, my + 34, 10, 26, INK);
  cv.rect(mx + 90, my + 66, 10, 10, INK);
  cv.rect(mx + 68, my + mh, 54, 12, INK);
  // lightning bolt (yellow) striking the screen
  cv.polygon(
    [[mx + mw + 10, my + 4], [mx + mw + 38, my + 4], [mx + mw + 22, my + 44],
     [mx + mw + 44, my + 44], [mx + mw + 6, my + 104], [mx + mw + 20, my + 54],
     [mx + mw, my + 54]],
    YELLOW,
  );
  // bank building with columns, right side
  const bx = x + w - 180;
  const by = y + 22;
  cv.polygon([[bx - 12, by], [bx + 78, by], [bx + 90, by + 20], [bx - 24, by + 20]], [200, 196, 188]);
  cv.rect(bx - 18, by + 20, 102, 10, [200, 196, 188]);
  for (let i = 0; i < 4; i++) {
    cv.rect(bx + i * 26, by + 30, 12, 52, [220, 216, 208]);
  }
  cv.rect(bx - 18, by + 82, 102, 10, [200, 196, 188]);
  // blinking red status dots along the bottom
  for (let i = 0; i < 8; i++) {
    cv.circle(x + 30 + i * 46, y + h - 12, 5, i % 2 ? RED : [120, 120, 120]);
  }
}

// ------------------------------------------------------------ layout ---

const STORIES = [
  {
    kicker: 'EUROPE - WAR',
    accent: RED,
    headline: 'UKRAINE HITS CRIMEA BRIDGE AGAIN',
    body: 'UKRAINE STRUCK THE KERCH BRIDGE FOR A SECOND TIME IN A DAY. RUSSIA HIT TWO BRIDGES IN KYIV IN REPLY.',
    draw: drawBridgeScene,
  },
  {
    kicker: 'MIDDLE EAST - THE GULF',
    accent: SEA,
    headline: 'TANKERS HIT, 3RD US CARRIER ARRIVES',
    body: 'MINES HIT TANKERS NEAR THE STRAIT OF HORMUZ. IRANIAN DRONES TARGETED A US RADAR IN BAHRAIN. A THIRD US CARRIER ARRIVED.',
    draw: drawSeaScene,
  },
  {
    kicker: 'ASIA - DIPLOMACY',
    accent: GOLD,
    headline: 'XI, TRUMP AND PUTIN TO MEET IN SHENZHEN',
    body: 'CHINA CONFIRMED THE FIRST THREE-WAY SUMMIT, ON THURSDAY IN SHENZHEN AT THE APEC MEETING. NO AGENDA WAS GIVEN.',
    draw: drawSummitScene,
  },
  {
    kicker: 'TECHNOLOGY - OUTAGES',
    accent: NAVY,
    headline: 'OUTAGES HIT BANKS, FLIGHTS AND TECH',
    body: 'JPMORGAN, MICROSOFT, THE FAA AND APPLE ALL SUFFERED OUTAGES IN ONE DAY. EXPERTS BLAMED FRAGILE SYSTEMS, NOT HACKERS.',
    draw: drawOutageScene,
  },
];

function drawMasthead(cv) {
  cv.rect(0, 0, W, 156, NAVY);
  drawTextCentered(cv, 'THE WORLD TODAY', W / 2, 12, 5, [255, 255, 255]);
  drawTextCentered(cv, '17 NOVEMBER 2026', W / 2, 52, 9, GOLD);
  cv.rect(28, 122, W - 56, 2, GOLD);
  drawTextCentered(cv, 'TUESDAY - THE DAY IN ONE PAGE', W / 2, 130, 3, [255, 255, 255]);
}

function drawPanel(cv, story, px, py, pw, ph) {
  cv.rect(px, py, pw, ph, CARD);
  cv.frame2(px, py, pw, ph, INK);
  // kicker bar
  cv.rect(px + 2, py + 2, pw - 4, 30, story.accent);
  drawText(cv, story.kicker, px + 14, py + 9, 3, [255, 255, 255]);
  // illustration
  const artX = px + 12;
  const artY = py + 42;
  const artW = pw - 24;
  const artH = 120;
  cv.frame(artX, artY, artW, artH, INK);
  story.draw(cv, artX + 1, artY + 1, artW - 2, artH - 2);
  // headline (scale 4, up to 2 lines)
  const textX = px + 14;
  const textW = pw - 28;
  let hy = artY + artH + 12;
  const headLines = wrapText(story.headline, 4, textW).slice(0, 2);
  headLines.forEach((ln, i) => drawText(cv, ln, textX, hy + i * 32, 4, INK));
  hy += headLines.length * 32 + 6;
  // body (scale 3, up to 5 lines)
  drawWrapped(cv, story.body, textX, hy, 3, 25, [60, 60, 60], textW, 5);
}

function drawFooter(cv) {
  cv.rect(0, 944, W, 80, NAVY);
  const lines = [
    'ALSO TODAY: CYCLONE AKVAN NEARS INDIA - PENTAGON FAILS AUDIT FOR 9TH YEAR',
    'JAPAN SCRAMBLES JETS OVER RUSSIAN INCURSION - UN OPENS TALKS TO BAN KILLER ROBOTS',
    'UK SANCTIONS FIRMS BUILDING WEST BANK SETTLEMENTS',
  ];
  lines.forEach((ln, i) => drawText(cv, ln, 16, 952 + i * 22, 2, [255, 255, 255]));
}

// -------------------------------------------------------------- main ---

function main() {
  const cv = new Canvas();
  cv.fill(PAPER);
  drawMasthead(cv);
  const panelW = 494;
  const panelH = 380;
  const gap = 12;
  const x0 = 12;
  const y0 = 168;
  drawPanel(cv, STORIES[0], x0, y0, panelW, panelH);
  drawPanel(cv, STORIES[1], x0 + panelW + gap, y0, panelW, panelH);
  drawPanel(cv, STORIES[2], x0, y0 + panelH + gap, panelW, panelH);
  drawPanel(cv, STORIES[3], x0 + panelW + gap, y0 + panelH + gap, panelW, panelH);
  drawFooter(cv);
  const png = encodePng(W, H, cv.pixels);
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'entry.png'), png);
}

main();
