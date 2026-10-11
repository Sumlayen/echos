/**
 * UI chrome: 9-slice window frames, gauges, the menu cursor, panel ornaments
 * and the star sigil used on the title. Windows are generated as single
 * textures (Phaser's NineSlice slices them at runtime); the rest are packed
 * into one framed atlas.
 */

import { P, RAMPS } from './Palette';
import { PC } from './PixelCanvas';
import { outline } from './PixelOps';
import { pack, type SpriteAtlas } from './TextureBuild';

export interface TextureSpec {
  key: string;
  pc: PC;
}

interface WindowSkin {
  outer: string;
  edge: string;
  bevel: string;
  fill: string;
  inner: string;
  accent: string;
}

const SKINS: Record<string, WindowSkin> = {
  win_default: {
    outer: '#0b0f1a', edge: '#3a4560', bevel: '#8e9ab4',
    fill: '#1b2338', inner: '#2a3550', accent: '#f2f5fb'
  },
  win_dark: {
    outer: '#05070d', edge: '#222a3d', bevel: '#4a5670',
    fill: '#10151f', inner: '#1a2231', accent: '#cdd5e6'
  },
  win_gold: {
    outer: '#0b0f1a', edge: '#7a5a17', bevel: '#f0c04e',
    fill: '#241f2c', inner: '#33293a', accent: '#fbe6b4'
  },
  win_battle: {
    outer: '#05070d', edge: '#2e5e9c', bevel: '#a8dbf2',
    fill: '#121a2c', inner: '#1c2740', accent: '#e8f2fb'
  },
  win_shop: {
    outer: '#0b0f1a', edge: '#5c4229', bevel: '#a37f52',
    fill: '#1e1a18', inner: '#2b2521', accent: '#f2e6d0'
  }
};

/**
 * Build a 9-slice window: 8px border with mitred corners, a 1px inner bevel and
 * a subtly dithered fill so large panels do not look like flat vector boxes.
 */
function windowSkin(skin: WindowSkin, size = 64, border = 8): PC {
  const pc = new PC(size, size);
  pc.rect(0, 0, size, size, skin.fill);
  // dithered fill texture
  for (let y = border; y < size - border; y++) {
    for (let x = border; x < size - border; x++) {
      if (((x >> 1) + (y >> 1)) & 1) pc.p(x, y, skin.inner);
    }
  }
  // border band
  pc.frame(0, 0, size, size, skin.outer);
  pc.frame(1, 1, size - 2, size - 2, skin.edge);
  pc.frame(2, 2, size - 4, size - 4, skin.bevel);
  pc.frame(3, 3, size - 6, size - 6, skin.edge);
  // mitred corner highlights
  for (const [cx, cy] of [[2, 2], [size - 3, 2], [2, size - 3], [size - 3, size - 3]] as const) {
    pc.p(cx, cy, skin.accent);
  }
  // corner rivets
  for (const [cx, cy] of [[4, 4], [size - 5, 4], [4, size - 5], [size - 5, size - 5]] as const) {
    pc.rect(cx, cy, 2, 2, skin.accent);
    pc.p(cx, cy, skin.bevel);
  }
  // mid-edge ornaments so long stretches are not empty
  const mid = size >> 1;
  pc.rect(mid - 3, 3, 7, 2, skin.bevel);
  pc.rect(mid - 3, size - 5, 7, 2, skin.edge);
  pc.rect(3, mid - 3, 2, 7, skin.bevel);
  pc.rect(size - 5, mid - 3, 2, 7, skin.edge);
  pc.p(mid, 3, skin.accent);
  pc.p(mid, size - 4, skin.accent);
  return pc;
}

/* ------------------------------------------------------------------ gauges */

const gaugeFill = (ramp: readonly string[], w = 8, h = 8): PC => {
  const pc = new PC(w, h);
  pc.rect(0, 0, w, h, ramp[1]);
  pc.rect(0, 0, w, 2, ramp[2]);
  pc.rect(0, 1, w, 1, ramp[3]);
  pc.rect(0, h - 2, w, 2, ramp[0]);
  for (let x = 3; x < w; x += 4) pc.vline(x, 1, h - 2, ramp[0]);
  return pc;
};

const gaugeFrame = (): PC => {
  const pc = new PC(16, 12);
  pc.rect(0, 0, 16, 12, P.ink);
  pc.rect(1, 1, 14, 10, P.shadow);
  pc.frame(1, 1, 14, 10, P.slate);
  pc.hline(2, 2, 12, P.steel);
  pc.hline(2, 9, 12, P.ink);
  for (let x = 4; x < 15; x += 4) pc.p(x, 0, P.steel);
  return pc;
};

/* ------------------------------------------------------------------ cursor */

const cursorFrame = (n: number): PC => {
  const pc = new PC(14, 16);
  const o = n;
  pc.tri(2 + o, 2, 2 + o, 14, 12 + o, 8, P.gold);
  pc.tri(3 + o, 4, 3 + o, 12, 10 + o, 8, P.cream);
  pc.p(3 + o, 8, P.paper);
  outline(pc, P.ink);
  return pc;
};

/* ---------------------------------------------------------------- ornaments */

const divider = (): PC => {
  const pc = new PC(96, 8);
  pc.hline(0, 4, 96, P.slate);
  pc.hline(2, 3, 92, P.steel);
  for (let x = 0; x < 96; x += 8) pc.p(x, 4, P.light);
  pc.rect(44, 1, 8, 6, P.gold);
  pc.rect(46, 0, 4, 8, P.gold);
  pc.p(47, 3, P.cream);
  pc.p(48, 4, P.cream);
  return pc;
};

const cornerFlourish = (): PC => {
  const pc = new PC(16, 16);
  pc.rect(0, 0, 16, 2, P.steel);
  pc.rect(0, 0, 2, 16, P.steel);
  pc.rect(2, 2, 6, 2, P.gold);
  pc.rect(2, 2, 2, 6, P.gold);
  pc.p(8, 4, P.cream);
  pc.p(4, 8, P.cream);
  pc.p(9, 5, P.slate);
  pc.p(5, 9, P.slate);
  return pc;
};

const portraitFrame = (): PC => {
  const pc = new PC(56, 56);
  pc.rect(0, 0, 56, 56, P.ink);
  pc.rect(2, 2, 52, 52, RAMPS.leather[1]);
  pc.frame(2, 2, 52, 52, RAMPS.leather[3]);
  pc.frame(4, 4, 48, 48, RAMPS.gold[1]);
  pc.frame(5, 5, 46, 46, RAMPS.gold[2]);
  for (const [cx, cy] of [[2, 2], [53, 2], [2, 53], [53, 53]] as const) {
    pc.rect(cx, cy, 3, 3, P.gold);
    pc.p(cx + 1, cy + 1, P.cream);
  }
  pc.rect(24, 0, 8, 3, P.gold);
  pc.rect(24, 53, 8, 3, RAMPS.gold[0]);
  return pc;
};

const keycap = (): PC => {
  const pc = new PC(16, 16);
  pc.rect(0, 0, 16, 16, P.ink);
  pc.rect(1, 1, 14, 13, RAMPS.metal[1]);
  pc.frame(1, 1, 14, 13, RAMPS.metal[3]);
  pc.rect(2, 2, 12, 3, RAMPS.metal[2]);
  pc.rect(1, 13, 14, 2, RAMPS.metal[0]);
  return pc;
};

/** The star sigil: title emblem, save-point glyph and ending card mark. */
const sigil = (): PC => {
  const pc = new PC(96, 96);
  const c = 48;
  pc.ring(c, c, 42, 42, RAMPS.gold[1]);
  pc.ring(c, c, 40, 40, RAMPS.gold[2]);
  pc.ring(c, c, 34, 34, RAMPS.gold[0]);
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    pc.p(Math.round(c + Math.cos(a) * 38), Math.round(c + Math.sin(a) * 38), P.cream);
  }
  // eight-pointed star
  pc.tri(c, 8, c - 10, c, c + 10, c, RAMPS.star[2]);
  pc.tri(c, 88, c - 10, c, c + 10, c, RAMPS.star[2]);
  pc.tri(8, c, c, c - 10, c, c + 10, RAMPS.star[2]);
  pc.tri(88, c, c, c - 10, c, c + 10, RAMPS.star[2]);
  pc.tri(c, 20, c - 7, c, c + 7, c, P.mystic);
  pc.tri(c, 76, c - 7, c, c + 7, c, P.mystic);
  pc.tri(20, c, c, c - 7, c, c + 7, P.mystic);
  pc.tri(76, c, c, c - 7, c, c + 7, P.mystic);
  pc.disc(c, c, 14, 14, P.arcane);
  pc.disc(c, c, 10, 10, P.gold);
  pc.disc(c, c, 6, 6, P.cream);
  pc.disc(c, c, 3, 3, P.paper);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.78;
    pc.line(c, c, Math.round(c + Math.cos(a) * 44), Math.round(c + Math.sin(a) * 44), P.star);
  }
  return pc;
};

const arrow = (dir: 'up' | 'down' | 'left' | 'right'): PC => {
  const pc = new PC(10, 10);
  const c = P.bone;
  if (dir === 'up') { pc.tri(5, 1, 1, 8, 9, 8, c); pc.rect(4, 8, 2, 2, c); pc.line(5, 2, 2, 7, P.paper); }
  if (dir === 'down') { pc.tri(5, 9, 1, 2, 9, 2, c); pc.rect(4, 1, 2, 2, c); pc.line(5, 8, 2, 3, P.paper); }
  if (dir === 'left') { pc.tri(1, 5, 8, 1, 8, 9, c); pc.rect(8, 4, 2, 2, c); pc.line(2, 5, 7, 2, P.paper); }
  if (dir === 'right') { pc.tri(9, 5, 2, 1, 2, 9, c); pc.rect(1, 4, 2, 2, c); pc.line(8, 5, 3, 2, P.paper); }
  outline(pc, P.ink);
  return pc;
};

const heartSmall = (): PC => {
  const pc = new PC(9, 8);
  pc.rect(1, 1, 3, 3, P.rose);
  pc.rect(5, 1, 3, 3, P.rose);
  pc.rect(0, 2, 9, 3, P.rose);
  pc.rect(2, 5, 5, 1, P.blood);
  pc.rect(3, 6, 3, 1, P.blood);
  pc.p(1, 1, P.coral);
  return pc;
};

/* ---------------------------------------------------------------- builder */

export function buildUIAtlas(key = 'ui'): SpriteAtlas {
  const items: { name: string; pc: PC }[] = [
    { name: 'gauge_frame', pc: gaugeFrame() },
    { name: 'fill_hp', pc: gaugeFill(RAMPS.blood) },
    { name: 'fill_mp', pc: gaugeFill(RAMPS.cloth) },
    { name: 'fill_xp', pc: gaugeFill(RAMPS.gold) },
    { name: 'fill_enemy', pc: gaugeFill(RAMPS.blood) },
    { name: 'cursor_0', pc: cursorFrame(0) },
    { name: 'cursor_1', pc: cursorFrame(1) },
    { name: 'divider', pc: divider() },
    { name: 'corner', pc: cornerFlourish() },
    { name: 'portrait_frame', pc: portraitFrame() },
    { name: 'keycap', pc: keycap() },
    { name: 'sigil', pc: sigil() },
    { name: 'arrow_up', pc: arrow('up') },
    { name: 'arrow_down', pc: arrow('down') },
    { name: 'arrow_left', pc: arrow('left') },
    { name: 'arrow_right', pc: arrow('right') },
    { name: 'heart_small', pc: heartSmall() }
  ];
  return pack(key, items, 512, 2);
}

/** All window skins as individual textures for Phaser NineSlice. */
export function buildWindowSkins(border = 8): TextureSpec[] {
  return Object.entries(SKINS).map(([key, skin]) => ({
    key,
    pc: windowSkin(skin, 64, border)
  }));
}

/** Border thickness Phaser's NineSlice should reserve for each window skin. */
export const WINDOW_BORDER = 8;
