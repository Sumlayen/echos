/**
 * Battle + world effects. Everything is a short loop of hand-tuned frames so
 * animations stay readable at 640x360 without any shader or blur.
 */

import { P, RAMPS } from './Palette';
import { PC } from './PixelCanvas';
import { pack, type SpriteAtlas } from './TextureBuild';

const frame = (w: number, h: number, paint: (pc: PC) => void): PC => {
  const pc = new PC(w, h);
  paint(pc);
  return pc;
};

/* ------------------------------------------------------------- impacts */

const impact = (i: number): PC =>
  frame(28, 28, (pc) => {
    const c = 14;
    const r = 3 + i * 4;
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + i * 0.25;
      const d0 = Math.max(1, r - 4), d1 = r;
      pc.line(
        Math.round(c + Math.cos(a) * d0), Math.round(c + Math.sin(a) * d0),
        Math.round(c + Math.cos(a) * d1), Math.round(c + Math.sin(a) * d1),
        i === 0 ? P.paper : i === 1 ? P.cream : P.gold
      );
    }
    if (i < 2) pc.disc(c, c, r - 2, r - 2, i === 0 ? P.paper : P.cream);
    else pc.ring(c, c, r, r, P.gold);
  });

const slash = (i: number): PC =>
  frame(36, 28, (pc) => {
    const steps = 14;
    const spread = 0.9 + i * 0.25;
    for (let s = 0; s < steps; s++) {
      const t = s / (steps - 1);
      const a = -spread + t * spread * 2;
      const r = 13 - i * 2;
      const x = 18 + Math.round(Math.sin(a) * r);
      const y = 14 - Math.round(Math.cos(a) * r);
      pc.p(x, y, i === 0 ? P.paper : i === 1 ? P.cream : P.bone);
      pc.p(x, y + 1, P.light);
      if (i === 2) pc.p(x, y + 2, P.steel);
    }
  });

const smoke = (i: number): PC =>
  frame(26, 26, (pc) => {
    const c = 13, r = 3 + i * 3;
    pc.disc(c, c + i, r, r - 1, i > 1 ? P.shadow : P.slate);
    pc.disc(c - 3, c + i - 1, r - 2, r - 2, P.steel);
    pc.disc(c + 3, c + i + 1, r - 3, r - 3, P.shadow);
    if (i < 2) pc.disc(c, c + i - 1, r - 3, r - 3, P.light);
    pc.fadeAlpha(1 - i * 0.22);
  });

/* --------------------------------------------------------- elemental orbs */

export const ELEMENT_COLORS: Record<string, readonly string[]> = {
  fire: RAMPS.lava,
  ice: RAMPS.ice,
  light: ['#8a7a2e', P.gold, P.cream, P.paper],
  dark: RAMPS.star,
  heal: ['#2c6b46', P.grass, P.leaf, P.sprout]
};

const orb = (el: string, i: number): PC =>
  frame(24, 24, (pc) => {
    const ramp = ELEMENT_COLORS[el];
    const c = 12;
    const r = 3 + i * 2;
    pc.disc(c, c, r + 1, r + 1, ramp[0]);
    pc.disc(c, c, r, r, ramp[1]);
    pc.disc(c, c, r - 2, r - 2, ramp[2]);
    if (r > 3) pc.disc(c - 1, c - 1, r - 4, r - 4, ramp[3]);
    if (i === 3) pc.ring(c, c, r + 3, r + 3, ramp[2]);
    for (let k = 0; k < 3; k++) pc.p(c - 6 - k * 2, c + 4 - k * 2, ramp[2]);
  });

const heal = (i: number): PC =>
  frame(24, 34, (pc) => {
    const ramp = ELEMENT_COLORS.heal;
    for (let k = 0; k < 5; k++) {
      const x = 4 + ((k * 5 + i * 2) % 17);
      const y = 30 - i * 6 - k * 5;
      if (y < 0) continue;
      pc.rect(x, y, 3, 1, ramp[2]);
      pc.rect(x + 1, y - 1, 1, 3, ramp[2]);
      pc.p(x + 1, y, ramp[3]);
    }
    pc.ring(12, 28, 9 - i, 4, ramp[1]);
  });

const shield = (i: number): PC =>
  frame(36, 36, (pc) => {
    const c = 18, r = 14 + i;
    pc.ring(c, c, r, r, P.azure);
    pc.ring(c, c, r - 1, r - 1, P.sky);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + i * 0.4;
      pc.p(Math.round(c + Math.cos(a) * r), Math.round(c + Math.sin(a) * r), P.ice);
    }
    pc.fadeAlpha(0.75 + i * 0.08);
  });

/* ------------------------------------------------------------ projectiles */

const spark = (): PC =>
  frame(9, 9, (pc) => {
    pc.disc(4, 4, 2, 2, P.cream);
    pc.p(4, 1, P.gold); pc.p(4, 7, P.gold);
    pc.p(1, 4, P.gold); pc.p(7, 4, P.gold);
    pc.p(4, 4, P.paper);
  });

const mote = (): PC =>
  frame(5, 5, (pc) => {
    pc.disc(2, 2, 1, 1, P.star);
    pc.p(2, 2, P.paper);
    pc.p(2, 0, P.mystic); pc.p(0, 2, P.mystic);
    pc.p(4, 2, P.mystic); pc.p(2, 4, P.mystic);
  });

const shadowBlob = (): PC =>
  frame(28, 10, (pc) => {
    pc.disc(14, 5, 12, 4, '#000000');
    pc.disc(14, 5, 9, 3, '#000000');
    pc.fadeAlpha(0.32);
  });

const beam = (): PC =>
  frame(64, 12, (pc) => {
    pc.rect(0, 4, 64, 4, P.mystic);
    pc.rect(0, 5, 64, 2, P.star);
    pc.rect(0, 6, 64, 1, P.paper);
    for (let x = 0; x < 64; x += 3) { pc.p(x, 3, P.arcane); pc.p(x, 8, P.arcane); }
  });

const runeCircle = (i: number): PC =>
  frame(48, 48, (pc) => {
    const c = 24;
    pc.ring(c, c, 20, 20, P.mystic);
    pc.ring(c, c, 16, 16, P.arcane);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + i * 0.35;
      const x = Math.round(c + Math.cos(a) * 18);
      const y = Math.round(c + Math.sin(a) * 18);
      pc.rect(x, y, 2, 2, P.star);
      pc.line(c, c, x, y, P.arcane);
    }
    pc.disc(c, c, 3 + i, 3 + i, P.star);
    pc.fadeAlpha(0.55 + i * 0.15);
  });

/* --------------------------------------------------------------- builder */

export function buildEffectAtlas(key = 'fx'): SpriteAtlas {
  const items: { name: string; pc: PC }[] = [];
  for (let i = 0; i < 4; i++) items.push({ name: `impact_${i}`, pc: impact(i) });
  for (let i = 0; i < 3; i++) items.push({ name: `slash_${i}`, pc: slash(i) });
  for (let i = 0; i < 4; i++) items.push({ name: `smoke_${i}`, pc: smoke(i) });
  for (const el of Object.keys(ELEMENT_COLORS)) {
    if (el === 'heal') continue;
    for (let i = 0; i < 4; i++) items.push({ name: `orb_${el}_${i}`, pc: orb(el, i) });
  }
  for (let i = 0; i < 4; i++) items.push({ name: `heal_${i}`, pc: heal(i) });
  for (let i = 0; i < 2; i++) items.push({ name: `shield_${i}`, pc: shield(i) });
  for (let i = 0; i < 4; i++) items.push({ name: `rune_${i}`, pc: runeCircle(i) });
  items.push({ name: 'spark', pc: spark() });
  items.push({ name: 'mote', pc: mote() });
  items.push({ name: 'shadow', pc: shadowBlob() });
  items.push({ name: 'beam', pc: beam() });
  return pack(key, items, 512, 2);
}