/**
 * Map props: buildings, trees, ruins, furniture, chests.
 *
 * These are drawn as single multi-tile objects rather than assembled from
 * 16x16 tiles, which is how real 16-bit maps get readable silhouettes (a house
 * reads as a house, not as a grid of wall tiles).
 */

import { P, RAMPS } from './Palette';
import { PC } from './PixelCanvas';
import { outline } from './PixelOps';
import { placed, type FrameDef, type SpriteAtlas } from './TextureBuild';

export interface PropDef {
  w: number;
  h: number;
  paint: (pc: PC) => void;
  /** true = draw with a dark outline (sprites); false = structural/tile-like */
  ink?: boolean;
}

/* ------------------------------------------------------------- helpers */

export function canopy(pc: PC, cx: number, cy: number, r: number, ramp: readonly string[], seed = 0): void {
  pc.disc(cx, cy, r, Math.round(r * 0.9), ramp[1]);
  pc.disc(cx - Math.floor(r * 0.4), cy - Math.floor(r * 0.35), Math.floor(r * 0.62), Math.floor(r * 0.55), ramp[2]);
  pc.disc(cx + Math.floor(r * 0.45), cy + Math.floor(r * 0.3), Math.floor(r * 0.5), Math.floor(r * 0.45), ramp[0]);
  pc.disc(cx - Math.floor(r * 0.5), cy - Math.floor(r * 0.55), Math.floor(r * 0.3), Math.floor(r * 0.28), ramp[3]);
  for (let i = 0; i < 10; i++) {
    const a = PC.hash(i, seed, 5) * Math.PI * 2;
    const d = PC.hash(i, seed, 9) * r;
    pc.p(Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d * 0.9), ramp[3]);
  }
}

function plankWall(pc: PC, x: number, y: number, w: number, h: number, base: string = P.wood, dark = '#4a3018', light: string = P.woodLt): void {
  pc.rect(x, y, w, h, base);
  for (let j = 0; j < h; j += 4) {
    pc.hline(x, y + j, w, dark);
    pc.hline(x, y + j + 1, w, light);
  }
  pc.vline(x, y, h, dark);
  pc.vline(x + w - 1, y, h, dark);
  pc.speckle(x, y, w, h, dark, 0.05, 3);
}

function shingleRoof(pc: PC, x: number, y: number, w: number, h: number, ramp: readonly string[]): void {
  pc.rect(x, y, w, h, ramp[1]);
  for (let j = 0; j < h; j += 3) {
    pc.hline(x, y + j, w, ramp[0]);
    for (let i = (j % 6 === 0 ? 0 : 3); i < w; i += 6) pc.vline(x + i, y + j, 3, ramp[0]);
  }
  pc.hline(x, y, w, ramp[2]);
  pc.hline(x, y + h - 1, w, ramp[0]);
  pc.speckle(x, y, w, h, ramp[2], 0.06, 8);
}

function windowPane(pc: PC, x: number, y: number, w = 6, h = 7): void {
  pc.rect(x, y, w, h, '#2b2118');
  pc.rect(x + 1, y + 1, w - 2, h - 2, '#f0c04e');
  pc.rect(x + 1, y + 1, w - 2, 2, '#fbe6b4');
  pc.vline(x + Math.floor(w / 2), y, h, '#2b2118');
  pc.hline(x, y + Math.floor(h / 2), w, '#2b2118');
  pc.frame(x, y, w, h, '#1c150f');
}

/* --------------------------------------------------------- nature props */

const tree = (pc: PC) => {
  pc.rect(9, 20, 5, 11, '#4a3018');
  pc.rect(10, 20, 2, 11, P.wood);
  pc.rect(8, 24, 7, 2, '#3a2412');
  canopy(pc, 11, 11, 10, RAMPS.grassLit, 2);
  outline(pc, P.ink);
};

const pine = (pc: PC) => {
  pc.rect(9, 24, 4, 7, '#3f2a16');
  for (let i = 0; i < 4; i++) {
    const w = 17 - i * 4;
    const y = 6 + i * 5;
    pc.tri(11, y - 4, 11 - Math.floor(w / 2), y + 5, 11 + Math.floor(w / 2), y + 5, RAMPS.grass[0]);
    pc.tri(11, y - 4, 11 - Math.floor(w / 2) + 1, y + 4, 11 + Math.floor(w / 2) - 2, y + 4, RAMPS.grass[1]);
    pc.line(11, y - 4, 11 - Math.floor(w / 2) + 1, y + 4, RAMPS.grass[3]);
  }
  outline(pc, P.ink);
};

const bigtree = (pc: PC) => {
  pc.rect(13, 26, 7, 21, '#3f2a16');
  pc.rect(15, 26, 3, 21, '#5c3d20');
  pc.rect(9, 32, 5, 3, '#3f2a16');
  pc.rect(19, 29, 5, 3, '#3f2a16');
  canopy(pc, 16, 15, 14, RAMPS.grassLit, 11);
  canopy(pc, 7, 22, 7, RAMPS.grass, 13);
  canopy(pc, 25, 21, 7, RAMPS.grass, 17);
  outline(pc, P.ink);
};

const bush = (pc: PC) => {
  pc.disc(8, 8, 7, 5, RAMPS.grass[0]);
  pc.disc(6, 6, 5, 4, RAMPS.grass[1]);
  pc.disc(11, 7, 4, 3, RAMPS.grass[2]);
  pc.p(4, 4, RAMPS.grass[3]);
  pc.p(9, 4, RAMPS.grass[3]);
  outline(pc, P.ink);
};

const rock = (pc: PC) => {
  pc.disc(8, 9, 7, 5, RAMPS.stone[1]);
  pc.disc(6, 7, 4, 3, RAMPS.stone[2]);
  pc.disc(11, 10, 3, 2, RAMPS.stone[0]);
  pc.p(5, 5, RAMPS.stone[3]);
  pc.p(7, 5, RAMPS.stone[3]);
  outline(pc, P.ink);
};

const flowers = (pc: PC) => {
  pc.vline(4, 8, 5, RAMPS.grass[3]);
  pc.vline(9, 9, 4, RAMPS.grass[3]);
  pc.vline(13, 7, 6, RAMPS.grass[3]);
  pc.disc(4, 7, 2, 1, P.rose);
  pc.disc(9, 8, 2, 1, P.gold);
  pc.disc(13, 6, 2, 1, P.mystic);
  pc.p(4, 7, P.cream);
  pc.p(9, 8, P.cream);
  pc.p(13, 6, P.cream);
};

const stump = (pc: PC) => {
  pc.rect(4, 9, 9, 6, '#4a3018');
  pc.disc(8, 9, 5, 3, '#6b4a2a');
  pc.ring(8, 9, 3, 2, '#4a3018');
  pc.p(8, 9, '#3a2412');
  outline(pc, P.ink);
};

const log = (pc: PC) => {
  pc.rect(1, 6, 14, 5, '#4a3018');
  pc.rect(1, 6, 14, 2, '#6b4a2a');
  pc.disc(14, 8, 3, 3, '#6b4a2a');
  pc.p(14, 8, '#3a2412');
  outline(pc, P.ink);
};

/* ---------------------------------------------------------- buildings */

const houseA = (pc: PC) => {
  // body
  plankWall(pc, 4, 26, 52, 26);
  // roof
  pc.tri(2, 26, 28, 6, 54, 26, '#8a3a24');
  pc.tri(4, 26, 28, 8, 52, 26, '#c65a2b');
  pc.line(28, 6, 4, 26, '#ef8a3c');
  pc.line(28, 6, 52, 26, '#8a3a24');
  pc.hline(6, 25, 44, '#5c2416');
  // trim + openings
  pc.rect(4, 26, 52, 1, '#3a2412');
  windowPane(pc, 10, 32);
  windowPane(pc, 40, 32);
  pc.rect(24, 36, 9, 16, '#3a2412');
  pc.rect(25, 37, 7, 15, P.woodLt);
  pc.rect(25, 37, 7, 1, '#c99a5e');
  pc.p(30, 44, P.gold);
  // foundation
  pc.rect(3, 50, 54, 4, RAMPS.stone[1]);
  pc.rect(3, 50, 54, 1, RAMPS.stone[2]);
  pc.rect(3, 53, 54, 1, RAMPS.stone[0]);
  outline(pc, P.ink);
};

const houseB = (pc: PC) => {
  plankWall(pc, 4, 22, 40, 22, '#6b5a42', '#3f3425', '#8d7a5c');
  shingleRoof(pc, 2, 8, 44, 14, ['#3b4050', '#585d6e', '#7d8292']);
  pc.tri(2, 8, 24, 2, 46, 8, '#585d6e');
  windowPane(pc, 9, 27);
  windowPane(pc, 31, 27);
  pc.rect(20, 30, 8, 14, '#3a2412');
  pc.rect(21, 31, 6, 13, '#8d6540');
  pc.p(26, 37, P.gold);
  pc.rect(3, 42, 42, 3, RAMPS.stone[1]);
  pc.rect(3, 44, 42, 1, RAMPS.stone[0]);
  outline(pc, P.ink);
};

const shopStall = (pc: PC) => {
  pc.rect(2, 10, 44, 3, '#5c4229');
  for (let i = 0; i < 6; i++) {
    pc.rect(2 + i * 8, 13, 8, 7, i % 2 ? P.cream : P.rose);
    pc.rect(2 + i * 8, 19, 8, 1, '#8a3a24');
  }
  pc.rect(4, 20, 2, 20, '#5c4229');
  pc.rect(42, 20, 2, 20, '#5c4229');
  pc.rect(2, 30, 44, 10, '#6b4a2a');
  pc.rect(2, 30, 44, 1, '#8d6540');
  pc.rect(2, 39, 44, 1, '#3a2412');
  pc.rect(8, 24, 6, 6, P.gold);
  pc.rect(8, 24, 6, 1, P.cream);
  pc.rect(18, 25, 7, 5, P.leaf);
  pc.rect(30, 24, 8, 6, P.azure);
  pc.rect(30, 24, 8, 1, P.sky);
  outline(pc, P.ink);
};

const well = (pc: PC) => {
  pc.rect(3, 12, 18, 10, RAMPS.stone[1]);
  pc.rect(3, 12, 18, 1, RAMPS.stone[3]);
  pc.rect(3, 21, 18, 1, RAMPS.stone[0]);
  for (let i = 4; i < 20; i += 4) pc.vline(i, 13, 8, RAMPS.stone[0]);
  pc.rect(5, 14, 14, 4, RAMPS.water[1]);
  pc.hline(7, 15, 5, RAMPS.water[3]);
  pc.rect(4, 2, 2, 11, '#5c4229');
  pc.rect(18, 2, 2, 11, '#5c4229');
  pc.tri(3, 3, 12, 0, 21, 3, '#8a3a24');
  pc.rect(3, 3, 18, 3, '#c65a2b');
  pc.hline(3, 3, 18, '#ef8a3c');
  pc.vline(12, 6, 6, '#3a2412');
  pc.rect(10, 11, 5, 4, '#6b4a2a');
  outline(pc, P.ink);
};

const tent = (pc: PC) => {
  pc.tri(2, 30, 16, 4, 30, 30, '#3f5f9c');
  pc.tri(4, 30, 16, 6, 28, 30, '#6f92cc');
  pc.rect(13, 16, 6, 14, '#28406e');
  pc.line(16, 6, 16, 30, '#28406e');
  pc.p(16, 4, P.gold);
  pc.hline(2, 30, 28, '#1c2a44');
  outline(pc, P.ink);
};

/* ---------------------------------------------------------- furniture */

const door = (pc: PC) => {
  pc.rect(1, 1, 14, 15, '#3a2412');
  pc.rect(2, 2, 12, 13, P.woodLt);
  pc.rect(2, 2, 12, 1, '#c99a5e');
  for (let i = 4; i < 14; i += 4) pc.vline(2 + i - 2, 3, 12, '#7d5734');
  pc.p(11, 9, P.gold);
  pc.frame(1, 1, 14, 15, P.ink);
};

const sign = (pc: PC) => {
  pc.rect(7, 8, 2, 8, '#4a3018');
  pc.rect(1, 2, 14, 8, '#6b4a2a');
  pc.rect(1, 2, 14, 1, '#8d6540');
  pc.rect(1, 9, 14, 1, '#3a2412');
  pc.hline(3, 4, 10, '#3a2412');
  pc.hline(3, 6, 7, '#3a2412');
  outline(pc, P.ink);
};

const chestClosed = (pc: PC) => {
  pc.rect(1, 6, 14, 9, '#6b4a2a');
  pc.rect(1, 3, 14, 4, '#8d6540');
  pc.hline(1, 3, 14, '#a5733f');
  pc.rect(6, 5, 4, 6, P.gold);
  pc.p(7, 8, P.cream);
  pc.frame(1, 3, 14, 12, '#3a2412');
  pc.vline(1, 3, 12, '#3a2412');
  pc.vline(14, 3, 12, '#3a2412');
};

const chestOpen = (pc: PC) => {
  pc.rect(1, 8, 14, 7, '#6b4a2a');
  pc.rect(1, 8, 14, 1, '#8d6540');
  pc.rect(1, 1, 14, 5, '#8d6540');
  pc.rect(1, 5, 14, 1, '#3a2412');
  pc.rect(2, 9, 12, 3, '#2b1c10');
  pc.rect(4, 9, 8, 2, P.gold);
  pc.rect(4, 9, 8, 1, P.cream);
  pc.frame(1, 1, 14, 14, '#3a2412');
};

const crate = (pc: PC) => {
  pc.rect(1, 1, 14, 14, '#6b4a2a');
  pc.frame(1, 1, 14, 14, '#3a2412');
  pc.line(1, 1, 14, 14, '#4a3018');
  pc.line(14, 1, 1, 14, '#4a3018');
  pc.hline(2, 2, 12, '#8d6540');
};

const barrel = (pc: PC) => {
  pc.rect(3, 1, 10, 15, '#6b4a2a');
  pc.rect(2, 3, 12, 11, '#6b4a2a');
  pc.hline(2, 4, 12, '#3a2412');
  pc.hline(2, 12, 12, '#3a2412');
  pc.rect(3, 1, 10, 1, '#8d6540');
  pc.vline(4, 2, 13, '#7d5734');
  outline(pc, P.ink);
};

const bed = (pc: PC) => {
  pc.rect(1, 2, 22, 20, '#5c4229');
  pc.rect(2, 4, 20, 16, P.cream);
  pc.rect(2, 4, 20, 4, '#e8dcc0');
  pc.rect(2, 9, 20, 10, P.rose);
  pc.rect(2, 9, 20, 1, '#ee7c6c');
  pc.rect(3, 5, 7, 4, P.paper);
  pc.frame(1, 2, 22, 20, '#3a2412');
};

const table = (pc: PC) => {
  pc.rect(1, 2, 22, 8, '#8d6540');
  pc.rect(1, 2, 22, 2, '#a5733f');
  pc.rect(1, 9, 22, 1, '#4a3018');
  pc.rect(3, 10, 3, 6, '#5c4229');
  pc.rect(18, 10, 3, 6, '#5c4229');
  outline(pc, P.ink);
};

const bookshelf = (pc: PC) => {
  pc.rect(0, 0, 16, 24, '#4a3018');
  pc.rect(1, 1, 14, 22, '#6b4a2a');
  const cols = [P.rose, P.azure, P.leaf, P.gold, P.mystic];
  for (let s = 0; s < 3; s++) {
    const y = 2 + s * 7;
    for (let i = 0; i < 6; i++) {
      pc.rect(2 + i * 2, y, 2, 6, cols[(i + s) % cols.length]);
      pc.p(2 + i * 2, y, '#ffffff');
    }
    pc.hline(1, y + 6, 14, '#3a2412');
  }
  pc.frame(0, 0, 16, 24, '#2b1c10');
};

/* ------------------------------------------------------------ ruins */

const pillar = (pc: PC) => {
  pc.rect(3, 2, 10, 36, RAMPS.stone[1]);
  pc.rect(3, 2, 3, 36, RAMPS.stone[2]);
  pc.rect(11, 2, 2, 36, RAMPS.stone[0]);
  for (let y = 6; y < 38; y += 8) pc.hline(3, y, 10, RAMPS.stone[0]);
  pc.rect(1, 0, 14, 3, RAMPS.stone[2]);
  pc.rect(1, 37, 14, 3, RAMPS.stone[2]);
  pc.speckle(3, 2, 10, 36, RAMPS.stone[0], 0.05, 21);
  outline(pc, P.ink);
};

const pillarBroken = (pc: PC) => {
  pc.rect(3, 10, 10, 28, RAMPS.stone[1]);
  pc.rect(3, 10, 3, 28, RAMPS.stone[2]);
  pc.rect(11, 10, 2, 28, RAMPS.stone[0]);
  pc.p(4, 8, RAMPS.stone[2]);
  pc.p(7, 7, RAMPS.stone[2]);
  pc.p(10, 9, RAMPS.stone[1]);
  pc.p(12, 8, RAMPS.stone[1]);
  pc.rect(1, 37, 14, 3, RAMPS.stone[2]);
  for (let y = 16; y < 38; y += 8) pc.hline(3, y, 10, RAMPS.stone[0]);
  outline(pc, P.ink);
};

const arch = (pc: PC) => {
  const s = RAMPS.stone;
  pc.rect(0, 4, 8, 36, s[1]);
  pc.rect(24, 4, 8, 36, s[1]);
  pc.rect(2, 4, 3, 36, s[2]);
  pc.rect(26, 4, 3, 36, s[2]);
  pc.rect(0, 0, 32, 6, s[2]);
  pc.rect(8, 6, 16, 4, s[1]);
  pc.rect(8, 10, 4, 6, s[1]);
  pc.rect(20, 10, 4, 6, s[1]);
  pc.hline(8, 4, 16, s[3]);
  for (let x = 8; x < 24; x += 5) pc.vline(x, 6, 4, s[0]);
  pc.speckle(0, 0, 32, 40, s[0], 0.05, 33);
  outline(pc, P.ink);
};

const statue = (pc: PC) => {
  const s = RAMPS.stoneWarm;
  pc.rect(4, 30, 16, 10, RAMPS.stone[1]);
  pc.rect(4, 30, 16, 2, RAMPS.stone[2]);
  pc.rect(8, 8, 8, 22, s[1]);
  pc.rect(8, 8, 3, 22, s[2]);
  pc.rect(14, 8, 2, 22, s[0]);
  pc.disc(12, 6, 4, 4, s[2]);
  pc.p(10, 5, s[3]);
  pc.rect(5, 14, 3, 10, s[1]);
  pc.rect(16, 12, 3, 12, s[1]);
  pc.rect(17, 4, 2, 12, s[3]);
  pc.rect(15, 15, 6, 2, s[2]);
  outline(pc, P.ink);
};

const crystal = (pc: PC) => {
  pc.tri(8, 0, 3, 14, 13, 14, P.arcane);
  pc.tri(8, 0, 5, 13, 11, 13, P.mystic);
  pc.line(8, 0, 5, 13, P.star);
  pc.tri(3, 8, 0, 20, 8, 20, P.arcane);
  pc.tri(13, 9, 16, 21, 8, 21, P.arcane);
  pc.rect(2, 19, 13, 3, RAMPS.stone[1]);
  pc.p(7, 4, P.paper);
  outline(pc, P.ink);
};

const rubblePile = (pc: PC) => {
  pc.disc(8, 11, 7, 4, RAMPS.stone[0]);
  pc.disc(5, 9, 3, 3, RAMPS.stone[1]);
  pc.disc(11, 10, 3, 2, RAMPS.stone[1]);
  pc.p(4, 7, RAMPS.stone[2]);
  pc.p(10, 8, RAMPS.stone[2]);
  pc.p(7, 6, RAMPS.stone[3]);
  outline(pc, P.ink);
};

const gravestone = (pc: PC) => {
  pc.rect(3, 4, 10, 14, RAMPS.stone[1]);
  pc.disc(8, 5, 5, 3, RAMPS.stone[1]);
  pc.rect(3, 4, 3, 14, RAMPS.stone[2]);
  pc.hline(5, 8, 6, RAMPS.stone[0]);
  pc.hline(5, 11, 4, RAMPS.stone[0]);
  pc.rect(1, 17, 14, 2, RAMPS.stone[0]);
  outline(pc, P.ink);
};

const gate = (pc: PC) => {
  pc.rect(0, 0, 4, 32, RAMPS.stone[1]);
  pc.rect(28, 0, 4, 32, RAMPS.stone[1]);
  pc.rect(0, 0, 4, 2, RAMPS.stone[3]);
  pc.rect(28, 0, 4, 2, RAMPS.stone[3]);
  pc.rect(4, 2, 24, 4, RAMPS.stone[2]);
  for (let x = 7; x < 28; x += 4) pc.vline(x, 6, 26, P.slate);
  for (let y = 10; y < 32; y += 6) pc.hline(5, y, 22, P.steel);
  pc.rect(4, 6, 24, 1, P.ink);
  outline(pc, P.ink);
};

const banner = (pc: PC) => {
  pc.rect(0, 0, 16, 3, P.slate);
  pc.rect(2, 3, 12, 26, P.arcane);
  pc.rect(2, 3, 12, 1, P.mystic);
  pc.tri(8, 8, 4, 16, 12, 16, P.gold);
  pc.tri(8, 18, 5, 24, 11, 24, P.gold);
  pc.rect(2, 29, 4, 3, P.arcane);
  pc.rect(10, 29, 4, 3, P.arcane);
  outline(pc, P.ink);
};

const rug = (pc: PC) => {
  pc.rect(0, 0, 32, 32, P.blood);
  pc.frame(1, 1, 30, 30, P.rose);
  pc.frame(3, 3, 26, 26, P.gold);
  pc.rect(4, 4, 24, 24, P.rust);
  pc.disc(16, 16, 7, 7, P.blood);
  pc.ring(16, 16, 7, 7, P.gold);
  pc.p(16, 16, P.cream);
  for (let i = 0; i < 32; i += 4) { pc.p(i, 0, P.gold); pc.p(i, 31, P.gold); }
};

const stairs = (pc: PC) => {
  for (let i = 0; i < 3; i++) {
    const y = i * 5;
    pc.rect(0, y, 32, 5, RAMPS.stone[1 - (i % 2)]);
    pc.hline(0, y, 32, RAMPS.stone[3]);
    pc.hline(0, y + 4, 32, RAMPS.stone[0]);
  }
  pc.speckle(0, 0, 32, 15, RAMPS.stone[0], 0.06, 44);
};

const fence = (pc: PC) => {
  pc.rect(0, 6, 16, 2, '#6b4a2a');
  pc.rect(0, 10, 16, 2, '#6b4a2a');
  pc.hline(0, 6, 16, '#8d6540');
  pc.hline(0, 10, 16, '#8d6540');
  pc.rect(2, 3, 3, 12, '#5c4229');
  pc.rect(11, 3, 3, 12, '#5c4229');
  pc.p(2, 3, '#8d6540');
  pc.p(11, 3, '#8d6540');
  outline(pc, P.ink);
};

/* ------------------------------------------------ animated prop frames */

const brazierFrame = (pc: PC, f: number) => {
  pc.rect(4, 14, 8, 6, RAMPS.metal[1]);
  pc.rect(4, 14, 8, 1, RAMPS.metal[3]);
  pc.rect(6, 19, 4, 4, RAMPS.metal[0]);
  pc.rect(3, 12, 10, 3, RAMPS.metal[2]);
  pc.rect(5, 12, 6, 2, P.rust);
  const flames = [
    [[7, 6, 3], [8, 3, 2]],
    [[7, 5, 3], [8, 2, 2]],
    [[6, 6, 3], [9, 3, 2]],
    [[8, 5, 3], [7, 2, 2]]
  ][f];
  pc.disc(8, 9, 4, 3, P.ember);
  for (const [x, y, r] of flames) {
    pc.disc(x, y, r, r + 1, P.flame);
    pc.disc(x, y - 1, r - 1, r, P.gold);
    pc.p(x, y - r, P.cream);
  }
  if (f === 1) pc.p(9, 1, P.cream);
  if (f === 3) pc.p(6, 2, P.cream);
};

const torchFrame = (pc: PC, f: number) => {
  pc.rect(7, 6, 2, 9, '#5c4229');
  pc.rect(6, 5, 4, 2, '#3a2412');
  const h = f % 2 === 0 ? 4 : 5;
  pc.disc(7, 3, 2, h - 1, P.ember);
  pc.disc(7, 2, 1, h - 2, P.gold);
  pc.p(7, 5 - h, P.cream);
};

/* ------------------------------------------------------------- registry */

export const PROPS: Record<string, PropDef> = {
  tree: { w: 24, h: 32, paint: tree },
  pine: { w: 24, h: 32, paint: pine },
  bigtree: { w: 32, h: 48, paint: bigtree },
  bush: { w: 16, h: 14, paint: bush },
  rock: { w: 16, h: 16, paint: rock },
  flowers: { w: 16, h: 16, paint: flowers, ink: false },
  stump: { w: 16, h: 16, paint: stump },
  log: { w: 16, h: 14, paint: log },
  house_a: { w: 56, h: 56, paint: houseA },
  house_b: { w: 46, h: 46, paint: houseB },
  shop: { w: 46, h: 40, paint: shopStall },
  well: { w: 24, h: 24, paint: well },
  tent: { w: 32, h: 32, paint: tent },
  door: { w: 16, h: 16, paint: door, ink: false },
  sign: { w: 16, h: 16, paint: sign },
  chest: { w: 16, h: 16, paint: chestClosed },
  chest_open: { w: 16, h: 16, paint: chestOpen },
  crate: { w: 16, h: 16, paint: crate, ink: false },
  barrel: { w: 16, h: 16, paint: barrel },
  bed: { w: 24, h: 24, paint: bed, ink: false },
  table: { w: 24, h: 16, paint: table },
  bookshelf: { w: 16, h: 24, paint: bookshelf, ink: false },
  pillar: { w: 16, h: 40, paint: pillar },
  pillar_broken: { w: 16, h: 40, paint: pillarBroken },
  arch: { w: 32, h: 40, paint: arch },
  statue: { w: 24, h: 40, paint: statue },
  crystal: { w: 16, h: 24, paint: crystal },
  rubble: { w: 16, h: 16, paint: rubblePile },
  gravestone: { w: 16, h: 20, paint: gravestone },
  gate: { w: 32, h: 32, paint: gate },
  banner: { w: 16, h: 32, paint: banner },
  rug: { w: 32, h: 32, paint: rug, ink: false },
  stairs: { w: 32, h: 16, paint: stairs, ink: false },
  fence: { w: 16, h: 16, paint: fence }
};

/** Pack every prop into one atlas; frames are named after the prop. */
export function buildPropAtlas(key = 'props'): SpriteAtlas {
  const names = Object.keys(PROPS);
  const rowH = 58;
  const cols = 6;
  const cellW = 58;
  const pc = new PC(cols * cellW, Math.ceil(names.length / cols) * rowH);
  const frames: FrameDef[] = [];
  names.forEach((name, i) => {
    const def = PROPS[name];
    const x = (i % cols) * cellW;
    const y = Math.floor(i / cols) * rowH;
    const cell = new PC(def.w, def.h);
    def.paint(cell);
    pc.blit(cell, x, y + (rowH - def.h));
    frames.push({ name, x, y, w: def.w, h: def.h });
  });
  return placed(key, pc, frames);
}

/** 4-frame animated braziers / torches, packed as `brazier_0..3`, `torch_0..3`. */
export function buildFlameAtlas(key = 'flames'): SpriteAtlas {
  const frames: FrameDef[] = [];
  const pc = new PC(8 * 16, 24);
  for (let f = 0; f < 4; f++) {
    const cell = new PC(16, 24);
    brazierFrame(cell, f);
    pc.blit(cell, f * 16, 0);
    frames.push({ name: `brazier_${f}`, x: f * 16, y: 0, w: 16, h: 24 });
  }
  for (let f = 0; f < 4; f++) {
    const cell = new PC(16, 16);
    torchFrame(cell, f);
    pc.blit(cell, (4 + f) * 16, 4);
    frames.push({ name: `torch_${f}`, x: (4 + f) * 16, y: 4, w: 16, h: 16 });
  }
  return placed(key, pc, frames);
}
