/**
 * Battle-scale enemy art (roughly 2x the exploration silhouette, per the
 * side-view battle convention). Every enemy is drawn procedurally from the
 * master palette so all eight read as one bestiary, and each gets five frames:
 * `idle0 idle1 attack hurt die`.
 */

import { P, RAMPS } from './Palette';
import { PC } from './PixelCanvas';
import { outline, tint } from './PixelOps';
import { canopy } from './PropArt';
import { placed, type FrameDef, type SpriteAtlas } from './TextureBuild';

export type EnemyFrame = 'idle0' | 'idle1' | 'attack' | 'hurt' | 'die';
export const ENEMY_FRAMES: EnemyFrame[] = ['idle0', 'idle1', 'attack', 'hurt', 'die'];

interface EnemyArt {
  w: number;
  h: number;
  /** f: 0 idle, 1 idle-bob, 2 attack, 3 hurt, 4 die */
  paint: (pc: PC, f: number) => void;
}

const fOff = (f: number): { dx: number; dy: number } => ({
  dx: f === 2 ? 4 : f === 3 ? -3 : 0,
  dy: (f === 1 ? 1 : 0) + (f === 4 ? 5 : 0)
});

/* ------------------------------------------------------------ ashen wolf */

const wolf: EnemyArt = { w: 50, h: 34, paint: (pc, f) => {
  const { dx, dy } = fOff(f);
  const x = 8 + dx, y = 10 + dy;
  const fur = ['#343a48', '#535b6c', '#78829a', '#a0abbe'];
  const legH = f === 4 ? 3 : 8;
  pc.rect(x + 4, y + 13, 3, legH, fur[0]);
  pc.rect(x + 11, y + 13, 3, legH, fur[1]);
  pc.rect(x + 23, y + 13, 3, legH, fur[0]);
  pc.rect(x + 29, y + 13, 3, legH, fur[1]);
  pc.rect(x + 3, y + 13 + legH, 5, 2, fur[0]);
  pc.rect(x + 28, y + 13 + legH, 5, 2, fur[0]);
  pc.disc(x + 18, y + 9, 14, 7, fur[1]);
  pc.disc(x + 14, y + 6, 9, 5, fur[2]);
  pc.disc(x + 25, y + 11, 7, 4, fur[0]);
  pc.line(x + 4, y + 7, x - 4, y - 1, fur[1]);
  pc.line(x + 5, y + 8, x - 3, y + 1, fur[2]);
  pc.disc(x + 32, y + 5, 6, 5, fur[2]);
  pc.rect(x + 35, y + 5, 7, 4, fur[1]);
  pc.rect(x + 35, y + 8, 6, 1, fur[0]);
  pc.tri(x + 30, y + 1, x + 28, y - 5, x + 34, y, fur[0]);
  pc.tri(x + 34, y + 1, x + 34, y - 4, x + 37, y + 1, fur[0]);
  for (let i = 0; i < 5; i++) pc.p(x + 11 + i * 3, y + 1, fur[3]);
  if (f !== 4) {
    pc.p(x + 34, y + 3, P.ember);
    pc.p(x + 35, y + 3, P.gold);
    pc.p(x + 40, y + 9, P.paper);
    pc.p(x + 38, y + 9, P.paper);
  } else {
    pc.p(x + 34, y + 4, P.steel);
  }
  outline(pc, P.ink);
  if (f === 3) tint(pc, P.rose, 0.45);
} };

/* ---------------------------------------------------------- cinder wisp */

const wisp: EnemyArt = { w: 34, h: 34, paint: (pc, f) => {
  const { dx, dy } = fOff(f);
  const cx = 17 + dx, cy = 17 + dy + (f === 1 ? 1 : 0);
  const r = f === 2 ? 8 : 6;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + f * 0.4;
    const d = r + 5;
    pc.disc(Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d), 2, 2, P.ember);
  }
  pc.disc(cx, cy, r + 2, r + 2, P.rust);
  pc.disc(cx, cy, r, r, P.ember);
  pc.disc(cx, cy, r - 2, r - 2, P.flame);
  pc.disc(cx - 1, cy - 2, r - 4, r - 4, P.gold);
  pc.p(cx - 1, cy - 3, P.cream);
  const eyeY = cy - 1;
  pc.rect(cx - 3, eyeY, 2, 2, P.ink);
  pc.rect(cx + 2, eyeY, 2, 2, P.ink);
  if (f === 2) { pc.ring(cx, cy, r + 6, r + 6, P.cream); }
  if (f === 4) tint(pc, P.shadow, 0.6);
} };

/* ---------------------------------------------------------- rust beetle */

const beetle: EnemyArt = { w: 42, h: 30, paint: (pc, f) => {
  const { dx, dy } = fOff(f);
  const x = 6 + dx, y = 8 + dy;
  const shell = ['#3d2a1c', '#6b4526', '#8f6234', '#b98b4c'];
  const legY = y + 15;
  for (let i = 0; i < 3; i++) {
    const lx = x + 6 + i * 8;
    const swing = f === 1 ? (i % 2 ? 1 : -1) : 0;
    pc.line(lx, legY, lx - 2, legY + 5 + swing, P.slate);
    pc.line(lx, legY, lx + 3, legY + 5 - swing, P.steel);
  }
  pc.disc(x + 18, y + 9, 14, 8, shell[1]);
  pc.disc(x + 15, y + 6, 10, 5, shell[2]);
  pc.hline(x + 5, y + 9, 26, shell[0]);
  for (let i = 0; i < 5; i++) pc.vline(x + 8 + i * 5, y + 2, 14, shell[0]);
  pc.disc(x + 32, y + 8, 5, 4, shell[1]);
  pc.disc(x + 32, y + 7, 3, 2, shell[3]);
  pc.p(x + 33, y + 7, P.flame);
  // pincers
  const open = f === 2 ? 2 : 0;
  pc.rect(x + 36, y + 4 - open, 5, 2, P.stoneLt);
  pc.rect(x + 36, y + 11 + open, 5, 2, P.stoneLt);
  // antennae
  pc.line(x + 34, y + 4, x + 38, y - 2, shell[0]);
  pc.line(x + 34, y + 12, x + 39, y + 16, shell[0]);
  outline(pc, P.ink);
  if (f === 3) tint(pc, P.rose, 0.45);
} };

/* ----------------------------------------------------------- hollow bat */

const bat: EnemyArt = { w: 44, h: 30, paint: (pc, f) => {
  const { dx, dy } = fOff(f);
  const cx = 22 + dx, cy = 15 + dy;
  const up = f === 0 || f === 2 ? -3 : f === 1 ? 3 : 0;
  // wings
  for (const s of [-1, 1]) {
    const wx = cx + s * 8;
    pc.tri(wx, cy, wx + s * 13, cy + up, wx + s * 6, cy + 6, '#3a2f4a');
    pc.tri(wx, cy, wx + s * 11, cy + up + 1, wx + s * 5, cy + 5, '#584a6e');
    pc.line(wx, cy, wx + s * 12, cy + up, '#8d7bb0');
  }
  pc.disc(cx, cy, 6, 7, '#4a3a5c');
  pc.disc(cx, cy - 2, 5, 4, '#6b5684');
  pc.tri(cx - 4, cy - 6, cx - 6, cy - 12, cx - 1, cy - 6, '#3a2f4a');
  pc.tri(cx + 4, cy - 6, cx + 6, cy - 12, cx + 1, cy - 6, '#3a2f4a');
  pc.p(cx - 2, cy - 2, P.rose);
  pc.p(cx + 2, cy - 2, P.rose);
  pc.p(cx - 2, cy + 3, P.paper);
  pc.p(cx + 1, cy + 3, P.paper);
  if (f === 4) { pc.fadeAlpha(0.45); }
  outline(pc, P.ink);
  if (f === 3) tint(pc, P.rose, 0.45);
} };

/* --------------------------------------------------------- grave wraith */

const wraith: EnemyArt = { w: 36, h: 44, paint: (pc, f) => {
  const { dx, dy } = fOff(f);
  const cx = 18 + dx, top = 8 + dy;
  const robe = ['#1d1830', '#2f2748', '#463a66', '#65589a'];
  for (let i = 0; i < 7; i++) {
    const w = 14 - Math.abs(i - 3);
    const y = top + 14 + i * 3;
    pc.rect(cx - Math.floor(w / 2), y, w, 3, i % 2 ? robe[0] : robe[1]);
  }
  pc.disc(cx, top + 12, 9, 7, robe[2]);
  pc.disc(cx, top + 10, 8, 6, robe[1]);
  pc.disc(cx, top + 4, 8, 8, robe[2]);
  pc.disc(cx, top + 5, 6, 6, '#0d0b16');
  pc.tri(cx - 8, top + 6, cx, top - 5, cx + 8, top + 6, robe[3]);
  pc.tri(cx - 6, top + 5, cx, top - 3, cx + 6, top + 5, robe[1]);
  const glow = f === 2 ? P.cream : P.mystic;
  pc.rect(cx - 3, top + 5, 2, 2, glow);
  pc.rect(cx + 2, top + 5, 2, 2, glow);
  if (f === 2) pc.ring(cx, top + 5, 11, 11, P.star);
  pc.rect(cx - 13, top + 16, 4, 2, robe[3]);
  pc.rect(cx + 10, top + 16, 4, 2, robe[3]);
  if (f === 4) pc.fadeAlpha(0.35);
  outline(pc, P.ink);
  if (f === 3) tint(pc, P.rose, 0.45);
} };

/* ------------------------------------------------------- whisperwood ent */

const ent: EnemyArt = { w: 44, h: 52, paint: (pc, f) => {
  const { dx, dy } = fOff(f);
  const x = 10 + dx, y = 10 + dy;
  const bark = ['#2f2116', '#4a3527', '#6b4c33', '#8a6a4a'];
  pc.rect(x + 6, y + 12, 14, 28, bark[1]);
  pc.rect(x + 6, y + 12, 4, 28, bark[2]);
  pc.rect(x + 17, y + 12, 3, 28, bark[0]);
  for (let i = 0; i < 5; i++) pc.hline(x + 7, y + 16 + i * 5, 12, bark[0]);
  const swing = f === 2 ? -6 : f === 1 ? 2 : 0;
  pc.line(x + 6, y + 18, x - 2, y + 20 + swing, bark[1]);
  pc.line(x - 2, y + 20 + swing, x + 2, y + 14 + swing, bark[2]);
  pc.line(x + 20, y + 18, x + 28, y + 20 - swing, bark[1]);
  pc.line(x + 28, y + 20 - swing, x + 32, y + 14 - swing, bark[2]);
  pc.rect(x + 4, y + 39, 6, 3, bark[0]);
  pc.rect(x + 16, y + 39, 6, 3, bark[0]);
  canopy(pc, x + 13, y + 6, 11, RAMPS.grassLit, 5);
  canopy(pc, x + 4, y + 12, 5, RAMPS.grass, 7);
  canopy(pc, x + 22, y + 11, 5, RAMPS.grass, 9);
  pc.rect(x + 9, y + 20, 3, 3, P.gold);
  pc.rect(x + 15, y + 20, 3, 3, P.gold);
  if (f === 2) { pc.p(x + 10, y + 21, P.cream); pc.p(x + 16, y + 21, P.cream); }
  pc.hline(x + 10, y + 27, 8, bark[0]);
  outline(pc, P.ink);
  if (f === 3) tint(pc, P.rose, 0.4);
} };

/* -------------------------------------------------------- rune sentinel */

const sentinel: EnemyArt = { w: 40, h: 48, paint: (pc, f) => {
  const { dx, dy } = fOff(f);
  const x = 10 + dx, y = 6 + dy;
  const s = RAMPS.stone;
  pc.rect(x + 4, y + 12, 18, 20, s[1]);
  pc.rect(x + 4, y + 12, 18, 2, s[2]);
  pc.rect(x + 19, y + 12, 3, 20, s[0]);
  pc.rect(x + 2, y + 32, 8, 8, s[1]);
  pc.rect(x + 16, y + 32, 8, 8, s[1]);
  pc.rect(x + 2, y + 32, 8, 1, s[2]);
  pc.rect(x + 7, y + 2, 12, 10, s[2]);
  pc.rect(x + 7, y + 2, 12, 1, s[3]);
  pc.rect(x + 16, y + 2, 3, 10, s[0]);
  const rune = f === 2 ? P.cream : P.mystic;
  pc.vline(x + 13, y + 15, 8, rune);
  pc.hline(x + 9, y + 19, 8, rune);
  pc.p(x + 10, y + 16, rune);
  pc.p(x + 16, y + 22, rune);
  pc.rect(x + 9, y + 6, 3, 2, f === 4 ? P.steel : P.flame);
  pc.rect(x + 14, y + 6, 3, 2, f === 4 ? P.steel : P.flame);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + f * 0.5;
    const sx = Math.round(x + 13 + Math.cos(a) * 16);
    const sy = Math.round(y + 20 + Math.sin(a) * 9);
    pc.rect(sx, sy, 3, 3, s[2]);
    pc.p(sx, sy, s[3]);
  }
  if (f === 4) pc.fadeAlpha(0.5);
  outline(pc, P.ink);
  if (f === 3) tint(pc, P.rose, 0.4);
} };

/* --------------------------------------------- boss: the Fallen Warden */

const warden: EnemyArt = { w: 72, h: 72, paint: (pc, f) => {
  const { dx, dy } = fOff(f);
  const x = 14 + dx, y = 6 + dy;
  const armor = ['#2a2f42', '#454d68', '#697490', '#98a3bd'];
  const legH = f === 4 ? 6 : 14;
  pc.rect(x + 8, y + 44, 8, legH, armor[1]);
  pc.rect(x + 24, y + 44, 8, legH, armor[0]);
  pc.rect(x + 6, y + 44 + legH, 12, 4, armor[0]);
  pc.rect(x + 22, y + 44 + legH, 12, 4, armor[0]);
  pc.rect(x + 4, y + 18, 30, 26, armor[1]);
  pc.rect(x + 4, y + 18, 30, 2, armor[3]);
  pc.rect(x + 28, y + 18, 6, 26, armor[0]);
  pc.rect(x + 2, y + 16, 34, 5, armor[2]);
  pc.disc(x + 3, y + 18, 7, 5, armor[2]);
  pc.disc(x + 35, y + 18, 7, 5, armor[2]);
  pc.hline(x - 3, y + 15, 12, armor[3]);
  pc.hline(x + 30, y + 15, 12, armor[3]);
  pc.rect(x + 10, y + 2, 18, 15, armor[2]);
  pc.rect(x + 10, y + 2, 18, 2, armor[3]);
  pc.rect(x + 24, y + 2, 4, 15, armor[0]);
  pc.tri(x + 10, y + 4, x + 3, y - 3, x + 12, y + 6, armor[3]);
  pc.tri(x + 28, y + 4, x + 35, y - 3, x + 26, y + 6, armor[3]);
  pc.rect(x + 12, y + 8, 14, 4, '#0d0b16');
  const core = f === 2 ? P.cream : P.gold;
  pc.rect(x + 13, y + 9, 3, 2, core);
  pc.rect(x + 22, y + 9, 3, 2, core);
  pc.disc(x + 19, y + 30, 6, 6, P.arcane);
  pc.disc(x + 19, y + 30, 4, 4, core);
  pc.p(x + 18, y + 29, P.paper);
  const swing = f === 2 ? -10 : 0;
  pc.rect(x + 42, y + 6 + swing, 4, 34, RAMPS.metal[2]);
  pc.rect(x + 42, y + 6 + swing, 2, 34, RAMPS.metal[3]);
  pc.rect(x + 38, y + 40 + swing, 12, 3, P.gold);
  pc.rect(x + 43, y + 43 + swing, 3, 6, P.rust);
  if (f === 3 || f === 4) {
    pc.line(x + 8, y + 20, x + 14, y + 30, P.ink);
    pc.line(x + 14, y + 30, x + 10, y + 40, P.ink);
    pc.line(x + 26, y + 22, x + 22, y + 34, P.ink);
  }
  if (f === 4) pc.fadeAlpha(0.45);
  outline(pc, P.ink);
  if (f === 3) tint(pc, P.rose, 0.4);
} };

/* ------------------------------------------------------------- registry */

export const ENEMY_ART: Record<string, EnemyArt> = {
  wolf, wisp, beetle, bat, wraith, ent, sentinel, warden
};

/** Build a 5-frame atlas for one enemy kind. */
export function buildEnemyAtlas(kind: string, key = `enemy_${kind}`): SpriteAtlas {
  const art = ENEMY_ART[kind];
  if (!art) throw new Error(`No enemy art for "${kind}"`);
  const pc = new PC(art.w * ENEMY_FRAMES.length, art.h);
  const frames: FrameDef[] = [];
  ENEMY_FRAMES.forEach((name, i) => {
    const cell = new PC(art.w, art.h);
    art.paint(cell, i);
    pc.blit(cell, i * art.w, 0);
    frames.push({ name, x: i * art.w, y: 0, w: art.w, h: art.h });
  });
  return placed(key, pc, frames);
}
