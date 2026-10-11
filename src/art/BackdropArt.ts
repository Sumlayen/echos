/**
 * Full-screen backdrops: the title card, the battle arenas and the story
 * illustrations. These are the only textures generated at native 640x360.
 *
 * Rules that keep them reading as 16-bit rather than digital painting:
 *  - flat colour bands + checker dither instead of smooth gradients,
 *  - exactly three depth layers (sky / mid / near), each a flat silhouette,
 *  - one light source per image, always the star or the moon.
 */

import { P } from './Palette';
import { PC } from './PixelCanvas';
import { mix } from './PixelOps';

export const BACKDROP_W = 640;
export const BACKDROP_H = 360;

const canvas = (): PC => new PC(BACKDROP_W, BACKDROP_H);

/** Vertical banded gradient using ordered dithering between ramp steps. */
function bands(pc: PC, y0: number, y1: number, ramp: readonly string[]): void {
  const steps = ramp.length;
  for (let y = y0; y < y1; y++) {
    const t = ((y - y0) / Math.max(1, y1 - y0)) * (steps - 1);
    const i = Math.min(steps - 2, Math.floor(t));
    const frac = t - i;
    for (let x = 0; x < pc.w; x++) {
      const ditherOn = ((x + y) & 1) === 0;
      const useUpper = frac > 0.5 && ditherOn;
      pc.rect(x, y, 1, 1, useUpper ? ramp[i + 1] : ramp[i]);
    }
  }
}

/** Hash-scattered stars, brighter and denser toward the top of the frame. */
function stars(pc: PC, y0: number, y1: number, seed: number, density = 0.4): void {
  for (let y = y0; y < y1; y += 2) {
    for (let x = 0; x < pc.w; x += 2) {
      const h = PC.hash(x, y, seed);
      if (h > density) continue;
      const near = 1 - (y - y0) / Math.max(1, y1 - y0);
      const c = near > 0.66 ? P.paper : near > 0.33 ? P.bone : P.light;
      pc.p(x, y, c);
      if (h < density * 0.12) {
        pc.p(x + 1, y, c);
        pc.p(x, y + 1, c);
      }
    }
  }
}

/** Jagged silhouette ridge built from a deterministic random walk. */
function ridge(pc: PC, baseY: number, amp: number, step: number, color: string, seed: number): void {
  let y = baseY;
  for (let x = 0; x < pc.w; x += step) {
    const drift = Math.round((PC.hash(x, seed, seed) - 0.5) * amp * 2);
    const next = Math.max(4, baseY + drift);
    const lo = Math.min(y, next), hi = Math.max(y, next);
    for (let yy = lo; yy <= hi; yy++) pc.rect(x, yy, step + 1, 1, color);
    y = next;
  }
  pc.rect(0, y, pc.w, pc.h - y, color);
}

/** Row of conifer silhouettes — the cheapest way to sell depth. */
function pineRow(pc: PC, baseY: number, h: number, color: string, seed: number, gap = 26): void {
  for (let x = -10; x < pc.w + 10; x += gap) {
    const jitter = Math.round((PC.hash(x, baseY, seed) - 0.5) * 10);
    const th = h + jitter;
    const tw = Math.max(4, Math.round(th * 0.34));
    for (let k = 0; k < 4; k++) {
      const w = Math.round(tw * (1 - k / 4) * 2);
      pc.rect(x - Math.floor(w / 2), baseY - th + k * Math.round(th / 4), w, Math.ceil(th / 4) + 1, color);
    }
    pc.rect(x - 1, baseY - 3, 3, 4, color);
  }
}

/** Horizontal mist: sparse dither rows that break up layer seams. */
function mist(pc: PC, y: number, h: number, color: string, seed: number, density = 0.4): void {
  for (let j = 0; j < h; j++) {
    const d = density * (1 - Math.abs(j - h / 2) / (h / 2));
    for (let x = 0; x < pc.w; x++) {
      if (PC.hash(x, y + j, seed) < d) pc.p(x, y + j, color);
    }
  }
}

/** Radial glow drawn as concentric dithered rings (impact sites, portals). */
function glow(pc: PC, cx: number, cy: number, r: number, ramp: readonly string[]): void {
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      const d = Math.sqrt(x * x + y * y) / r;
      const i = Math.floor(d * (ramp.length - 1));
      if (i >= ramp.length) continue;
      if (((x + y) & 1) !== 0 && d >= 0.35) continue;
      pc.p(cx + x, cy + y, ramp[i]);
    }
  }
}

/** Dithered corner darkening so sprites and text pop against the backdrop. */
function vignette(pc: PC, strength = 0.5): void {
  const cx = pc.w / 2, cy = pc.h / 2;
  const maxD = Math.sqrt(cx * cx + cy * cy);
  for (let y = 0; y < pc.h; y++) {
    for (let x = 0; x < pc.w; x++) {
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / maxD;
      if (d < 0.45) continue;
      const t = Math.min(1, ((d - 0.45) / 0.55) * strength * 1.6);
      if (PC.hash(x, y, 99) < t) pc.p(x, y, P.ink);
    }
  }
}

/* ------------------------------------------------------------- title card */

export function titleBackdrop(): PC {
  const pc = canvas();
  // dusk sky, warm at the horizon where the star came down
  bands(pc, 0, 250, ['#070b16', '#101a30', '#22243f', '#4a2f45', '#7c4238', '#a4603c']);
  stars(pc, 0, 190, 11, 0.35);

  // crescent moon
  pc.disc(96, 62, 16, 16, P.bone);
  pc.disc(104, 58, 15, 15, '#101a30');
  pc.disc(92, 66, 3, 3, P.paper);

  // the fallen star: core, spokes and an entry trail
  glow(pc, 452, 96, 46, ['#3a2a4e', '#6b3f52', '#a4552f', '#ef8a3c']);
  pc.disc(452, 96, 13, 13, P.gold);
  pc.disc(452, 96, 9, 9, P.cream);
  pc.disc(452, 96, 5, 5, P.paper);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 + 0.26;
    const len = k % 3 === 0 ? 40 : 26;
    pc.line(452, 96, Math.round(452 + Math.cos(a) * len), Math.round(96 + Math.sin(a) * len), P.cream);
  }
  for (let t = 0; t < 1; t += 0.02) {
    const x = Math.round(452 - t * 250);
    const y = Math.round(96 - t * 70 + t * t * 40);
    const w = Math.round(1 + t * 5);
    pc.rect(x - w, y - Math.floor(w / 2), w * 2, Math.max(1, w), mix(P.ember, P.gold, 1 - t));
  }

  // far mountains, near ridge, treeline
  ridge(pc, 214, 26, 12, '#2a2b45', 3);
  ridge(pc, 246, 18, 9, '#1d1f33', 5);
  mist(pc, 236, 22, '#5a4a68', 7, 0.35);
  pineRow(pc, 292, 40, '#141a26', 9, 30);

  // crater glow on the horizon behind the village
  glow(pc, 520, 272, 58, ['#3a2118', '#6b3418', '#a4512a']);

  // village rooftops in the near band
  const roof = '#0a0d16';
  const house = (x: number, w: number, h: number) => {
    pc.rect(x, 330 - h, w, h, roof);
    pc.tri(x - 4, 330 - h, x + w / 2, 330 - h - 18, x + w + 4, 330 - h, roof);
    pc.rect(x + 6, 330 - h + 12, 5, 6, P.gold);
    pc.rect(x + 6, 330 - h + 12, 5, 1, P.cream);
  };
  house(60, 40, 44);
  house(120, 30, 34);
  house(176, 46, 50);
  house(250, 34, 38);
  house(310, 28, 30);
  // well + fence
  pc.rect(392, 306, 22, 18, roof);
  pc.rect(388, 300, 30, 4, roof);
  pc.rect(396, 288, 3, 14, roof);
  pc.rect(407, 288, 3, 14, roof);
  pc.tri(390, 290, 403, 278, 416, 290, roof);
  for (let x = 440; x < 620; x += 18) pc.rect(x, 312, 3, 18, roof);
  pc.rect(440, 318, 180, 3, roof);
  pc.rect(0, 330, pc.w, 30, '#05070d');
  pc.speckle(0, 330, pc.w, 30, '#0d1220', 0.2, 17);

  vignette(pc, 0.55);
  return pc;
}

/* ------------------------------------------------------- battle arenas */

/** Floor for a side-view arena: horizontal bands that widen toward the viewer. */
function arenaFloor(pc: PC, floorY: number, ramp: readonly string[], seed: number): void {
  for (let y = floorY; y < pc.h; y++) {
    const t = (y - floorY) / (pc.h - floorY);
    const i = Math.min(ramp.length - 1, Math.floor(t * ramp.length));
    pc.rect(0, y, pc.w, 1, ramp[i]);
  }
  // perspective seams
  for (let k = 0; k < 7; k++) {
    const y = floorY + Math.round((k / 7) ** 1.6 * (pc.h - floorY));
    pc.hline(0, y, pc.w, ramp[0]);
  }
  pc.speckle(0, floorY, pc.w, pc.h - floorY, ramp[ramp.length - 1], 0.05, seed);
}

export function forestArena(): PC {
  const pc = canvas();
  bands(pc, 0, 210, ['#1b3a2c', '#25503c', '#356b46', '#4d8455']);
  // light shafts through the canopy
  for (let k = 0; k < 6; k++) {
    const x = 40 + k * 110;
    for (let y = 0; y < 210; y++) {
      const w = 6 + Math.round(y * 0.12);
      if (PC.hash(x, y, 21) < 0.5) pc.rect(x - w / 2 + y * 0.18, y, w, 1, '#5f9a5e');
    }
  }
  // canopy leaves hanging from the top
  for (let x = -20; x < pc.w + 20; x += 34) {
    const h = 26 + Math.round(PC.hash(x, 0, 31) * 34);
    pc.disc(x, h * 0.4, 22, h * 0.6, '#16321f');
    pc.disc(x - 6, h * 0.3, 14, h * 0.4, '#22492b');
  }
  // three trunk layers, back to front
  const trunks = (color: string, dark: string, baseY: number, h: number, gap: number, seed: number) => {
    for (let x = 8; x < pc.w; x += gap) {
      const w = 8 + Math.round(PC.hash(x, baseY, seed) * 10);
      const off = Math.round((PC.hash(x, seed, 1) - 0.5) * 18);
      pc.rect(x + off, baseY - h, w, h, color);
      pc.rect(x + off, baseY - h, 2, h, dark);
      for (let k = 0; k < 4; k++) {
        pc.hline(x + off, baseY - h + 30 + k * 46, w, dark);
      }
    }
  };
  trunks('#2b3f31', '#1b2a20', 214, 214, 46, 5);
  trunks('#3a4a34', '#252f22', 236, 236, 62, 9);
  mist(pc, 196, 26, '#6f9a6a', 13, 0.3);
  pineRow(pc, 244, 46, '#101c17', 17, 40);
  arenaFloor(pc, 244, ['#22301f', '#2f4228', '#3c5231', '#4a6239'], 23);
  // grass tufts along the front lip
  for (let x = 0; x < pc.w; x += 9) {
    const h = 4 + Math.round(PC.hash(x, 300, 27) * 7);
    pc.rect(x, 244 - h, 2, h, '#5c7a3e');
    pc.rect(x + 3, 244 - h + 2, 2, h - 2, '#476330');
  }
  vignette(pc, 0.5);
  return pc;
}

export function ruinsArena(): PC {
  const pc = canvas();
  bands(pc, 0, 230, ['#0a0814', '#161029', '#241a3d', '#38265a']);
  stars(pc, 0, 200, 41, 0.28);
  glow(pc, 320, 120, 90, ['#1b1430', '#2c1f4d', '#4a327a']);
  // broken arches and pillars, flat silhouettes
  const s = ['#171327', '#221c38', '#2e2648'];
  for (let k = 0; k < 5; k++) {
    const x = 30 + k * 140;
    const h = 120 + Math.round(PC.hash(x, 7, 43) * 70);
    pc.rect(x, 230 - h, 26, h, s[1]);
    pc.rect(x, 230 - h, 6, h, s[2]);
    pc.rect(x - 5, 230 - h, 36, 8, s[2]);
    if (k % 2 === 0) pc.rect(x + 40, 230 - h * 0.6, 22, h * 0.6, s[0]);
  }
  pc.rect(180, 96, 280, 16, s[2]);
  pc.rect(180, 112, 40, 60, s[1]);
  pc.rect(420, 112, 40, 60, s[1]);
  // floating rune shards
  for (let k = 0; k < 14; k++) {
    const x = 40 + ((k * 97) % 560);
    const y = 60 + ((k * 53) % 150);
    pc.rect(x, y, 4, 4, P.arcane);
    pc.p(x + 1, y + 1, P.mystic);
  }
  mist(pc, 208, 30, '#6b4f9e', 29, 0.32);
  arenaFloor(pc, 238, ['#141024', '#1e1832', '#2a2142', '#382c58'], 31);
  // glowing cracks in the floor
  for (let k = 0; k < 8; k++) {
    let x = 20 + k * 80, y = 250 + (k % 3) * 26;
    for (let seg = 0; seg < 6; seg++) {
      const nx = x + 10 + Math.round(PC.hash(x, y, 47) * 14);
      const ny = y + Math.round((PC.hash(y, x, 47) - 0.5) * 12);
      pc.line(x, y, nx, ny, P.mystic);
      x = nx; y = ny;
    }
  }
  vignette(pc, 0.62);
  return pc;
}

export function roadArena(): PC {
  const pc = canvas();
  bands(pc, 0, 220, ['#1a1428', '#2e2038', '#54314a', '#8a4a3c', '#c07a44']);
  stars(pc, 0, 120, 53, 0.22);
  glow(pc, 540, 200, 70, ['#5c2a18', '#8a4020', '#d07a30']);
  ridge(pc, 190, 20, 14, '#2a2036', 61);
  ridge(pc, 216, 12, 10, '#1c1626', 63);
  pineRow(pc, 232, 34, '#120f1a', 67, 34);
  arenaFloor(pc, 232, ['#2a2118', '#3a2c1e', '#4c3a26', '#5f4a30'], 71);
  // rutted cart road
  for (let y = 232; y < pc.h; y++) {
    const t = (y - 232) / (pc.h - 232);
    const c = t > 0.4 ? '#6b5638' : '#57452c';
    pc.rect(120 - t * 90, y, 60 + t * 120, 1, c);
    pc.rect(420 - t * 40, y, 40 + t * 160, 1, c);
  }
  for (let x = 0; x < pc.w; x += 22) pc.rect(x, 226, 3, 8, '#241c14');
  vignette(pc, 0.5);
  return pc;
}

/* ------------------------------------------------------ story illustrations */

/** Two robed onlookers, drawn small so the scene reads as scale, not detail. */
function onlookers(pc: PC, x: number, y: number, color = '#05070d'): void {
  const figure = (fx: number, s: number) => {
    pc.rect(fx, y - 14 * s, 8 * s, 12 * s, color);
    pc.disc(fx + 4 * s, y - 16 * s, 3 * s, 3 * s, color);
    pc.rect(fx - 1, y - 2 * s, 10 * s, 2 * s, color);
  };
  figure(x, 1);
  figure(x + 16, 0.85);
}

export function storyCrash(): PC {
  const pc = canvas();
  bands(pc, 0, 260, ['#05070f', '#0d1424', '#1b1b33', '#3a2740']);
  stars(pc, 0, 230, 83, 0.45);
  ridge(pc, 200, 30, 14, '#1a1a2c', 87);
  ridge(pc, 240, 16, 10, '#121220', 89);
  // the star, huge and close, dragging fire across the sky
  glow(pc, 400, 120, 110, ['#2a1a3a', '#5c2f36', '#a4512a', '#ef8a3c']);
  pc.disc(400, 120, 34, 34, P.gold);
  pc.disc(400, 120, 24, 24, P.cream);
  pc.disc(400, 120, 14, 14, P.paper);
  for (let t = 0; t < 1; t += 0.012) {
    const x = Math.round(400 - t * 330);
    const y = Math.round(120 - t * 96 + t * t * 30);
    const w = Math.round(2 + t * 16);
    pc.rect(x - w, y - Math.floor(w / 2), w * 2, Math.max(1, w), mix(P.ember, P.gold, 1 - t));
  }
  for (let k = 0; k < 26; k++) {
    const a = PC.hash(k, 3, 91) * Math.PI * 2;
    const d = 40 + PC.hash(k, 5, 91) * 120;
    pc.p(Math.round(400 + Math.cos(a) * d), Math.round(120 + Math.sin(a) * d), P.cream);
  }
  // hill the pair stand on
  pc.rect(0, 300, pc.w, 60, '#0a0d16');
  for (let x = 0; x < pc.w; x++) {
    const y = 300 - Math.round(18 * Math.sin((x / pc.w) * Math.PI));
    pc.rect(x, y, 1, 300 - y, '#0a0d16');
  }
  onlookers(pc, 120, 296);
  vignette(pc, 0.6);
  return pc;
}

export function storyVillage(): PC {
  const pc = canvas();
  bands(pc, 0, 250, ['#2a3a5e', '#4a5a7e', '#8a7a86', '#c99a72', '#e8c08a']);
  ridge(pc, 196, 18, 14, '#4a4a62', 93);
  mist(pc, 214, 24, '#cbb6a0', 95, 0.3);
  pineRow(pc, 250, 34, '#2e3a34', 97, 32);
  // morning village, lit windows, smoke
  const wall = '#3a2c22', roof = '#241a14';
  const house = (x: number, w: number, h: number) => {
    pc.rect(x, 300 - h, w, h, wall);
    pc.tri(x - 4, 300 - h, x + w / 2, 300 - h - 16, x + w + 4, 300 - h, roof);
    pc.rect(x + 5, 300 - h + 10, 6, 7, P.gold);
    pc.rect(x + w - 12, 300 - h + 10, 6, 7, P.gold);
    pc.rect(x + w / 2 - 3, 300 - 16, 7, 16, '#1c1410');
  };
  house(40, 52, 52);
  house(110, 40, 40);
  house(168, 60, 58);
  house(250, 44, 44);
  house(316, 50, 48);
  house(390, 38, 36);
  for (let k = 0; k < 5; k++) {
    const sx = 60 + k * 70;
    for (let j = 0; j < 22; j++) {
      pc.p(sx + Math.round(Math.sin(j * 0.5 + k) * 4), 232 - j * 3, '#d8cfc2');
    }
  }
  pc.rect(0, 300, pc.w, 60, '#5c4630');
  pc.speckle(0, 300, pc.w, 60, '#6b5638', 0.25, 99);
  // crowd of villagers waiting on the road
  for (let k = 0; k < 9; k++) onlookers(pc, 60 + k * 62, 322, '#241a14');
  vignette(pc, 0.45);
  return pc;
}

export function storyGate(): PC {
  const pc = canvas();
  bands(pc, 0, 250, ['#07060f', '#141026', '#241a3d']);
  stars(pc, 0, 210, 101, 0.3);
  const s = ['#1b1630', '#2a2244', '#3b3060'];
  // the gate of the First Flame
  pc.rect(150, 60, 46, 200, s[1]);
  pc.rect(150, 60, 12, 200, s[2]);
  pc.rect(444, 60, 46, 200, s[1]);
  pc.rect(444, 60, 12, 200, s[2]);
  pc.rect(150, 44, 340, 22, s[2]);
  pc.rect(150, 66, 340, 6, s[0]);
  for (let x = 170; x < 480; x += 26) pc.rect(x, 48, 4, 14, s[0]);
  glow(pc, 320, 170, 120, ['#1b1430', '#33245c', '#5c3f96']);
  // the shard still burning inside
  pc.tri(320, 96, 296, 200, 344, 200, P.mystic);
  pc.tri(320, 96, 306, 196, 334, 196, P.star);
  pc.line(320, 96, 310, 196, P.paper);
  pc.disc(320, 150, 10, 10, P.cream);
  for (let k = 0; k < 18; k++) {
    const a = PC.hash(k, 11, 103) * Math.PI * 2;
    const d = 30 + PC.hash(k, 13, 103) * 90;
    pc.p(Math.round(320 + Math.cos(a) * d), Math.round(150 + Math.sin(a) * d), P.star);
  }
  arenaFloor(pc, 258, ['#141024', '#1e1832', '#2a2142'], 107);
  pc.rect(240, 258, 160, 100, '#1a1430');
  onlookers(pc, 286, 300, '#0a0812');
  vignette(pc, 0.62);
  return pc;
}

/* --------------------------------------------------------------- registry */

export const BACKDROPS: Record<string, () => PC> = {
  title: titleBackdrop,
  arena_forest: forestArena,
  arena_ruins: ruinsArena,
  arena_road: roadArena,
  story_crash: storyCrash,
  story_village: storyVillage,
  story_gate: storyGate
};
