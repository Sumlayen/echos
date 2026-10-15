/**
 * 16x16 UI icons: items, equipment, skills and status effects. Icons are the
 * smallest art in the game, so each one is built around one strong silhouette
 * plus a 2-tone rim, and every icon gets the same ink outline weight.
 */

import { P, RAMPS } from './Palette';
import { PC } from './PixelCanvas';
import { outline } from './PixelOps';
import type { SpriteAtlas } from './TextureBuild';

export const ICON_SIZE = 16;
type Icon = (pc: PC) => void;

/** Potion / bottle body used by several consumables. */
const bottle = (pc: PC, liquid: readonly string[], full = true): void => {
  pc.rect(6, 1, 4, 2, P.bone);
  pc.rect(5, 3, 6, 2, P.light);
  pc.rect(4, 5, 8, 9, P.bone);
  pc.rect(4, 13, 8, 2, P.light);
  const top = full ? 6 : 10;
  pc.rect(5, top, 6, 13 - top, liquid[1]);
  pc.rect(5, top, 6, 1, liquid[2]);
  pc.rect(6, 11, 4, 2, liquid[0]);
  pc.rect(5, 6, 1, 6, P.paper);
  pc.p(6, 5, P.paper);
};

/** Standard blade pointing up-right, used by weapons. */
const blade = (pc: PC, tip: string, mid: string, hilt: string = P.wood): void => {
  pc.line(11, 1, 5, 10, mid);
  pc.line(12, 2, 6, 11, tip);
  pc.line(11, 1, 12, 2, tip);
  pc.rect(4, 9, 4, 2, P.steel);
  pc.rect(3, 11, 3, 3, hilt);
  pc.p(2, 13, P.gold);
};

/* ------------------------------------------------------------ consumables */

const potionS: Icon = (pc) => bottle(pc, RAMPS.blood);
const potionL: Icon = (pc) => {
  pc.rect(5, 0, 6, 2, P.bone);
  pc.rect(3, 2, 10, 3, P.light);
  pc.rect(2, 5, 12, 9, P.bone);
  pc.rect(2, 13, 12, 2, P.light);
  pc.rect(3, 6, 10, 7, RAMPS.blood[2]);
  pc.rect(3, 6, 10, 1, RAMPS.blood[3]);
  pc.rect(3, 11, 10, 2, RAMPS.blood[1]);
  pc.rect(4, 6, 1, 6, P.paper);
};
const elixir: Icon = (pc) => bottle(pc, RAMPS.star);
const ether: Icon = (pc) => bottle(pc, RAMPS.ice);
const antidote: Icon = (pc) => bottle(pc, RAMPS.grassLit);
const revive: Icon = (pc) => {
  bottle(pc, RAMPS.gold);
  pc.vline(8, 4, 8, P.paper);
  pc.hline(4, 8, 8, P.paper);
};
const bread: Icon = (pc) => {
  pc.disc(8, 9, 6, 4, '#8a6a3a');
  pc.disc(8, 8, 5, 3, '#c39a55');
  pc.hline(4, 7, 8, '#e0bd7c');
  pc.p(6, 6, P.cream); pc.p(9, 6, P.cream);
  pc.hline(3, 11, 10, '#6b4c28');
};
const meat: Icon = (pc) => {
  pc.disc(9, 8, 5, 4, RAMPS.blood[2]);
  pc.disc(8, 7, 3, 2, RAMPS.blood[3]);
  pc.rect(2, 9, 5, 2, P.bone);
  pc.p(2, 9, P.paper); pc.p(2, 10, P.paper);
  pc.line(5, 6, 11, 5, RAMPS.blood[1]);
};
const bomb: Icon = (pc) => {
  pc.disc(8, 10, 5, 5, RAMPS.metal[1]);
  pc.disc(7, 9, 3, 3, RAMPS.metal[2]);
  pc.p(6, 7, P.light);
  pc.rect(7, 4, 3, 2, P.rust);
  pc.line(10, 4, 13, 1, P.woodLt);
  pc.p(13, 1, P.flame); pc.p(12, 2, P.gold);
};
const ball: Icon = (pc) => {
  pc.disc(8, 9, 5, 5, RAMPS.metal[2]);
  pc.disc(7, 8, 3, 3, RAMPS.metal[3]);
  pc.hline(3, 9, 10, RAMPS.metal[0]);
  pc.p(6, 6, P.paper);
};
const torch: Icon = (pc) => {
  pc.rect(7, 7, 2, 8, P.wood);
  pc.rect(6, 6, 4, 2, '#3a2412');
  pc.disc(7, 4, 2, 3, P.ember);
  pc.disc(7, 3, 1, 2, P.flame);
  pc.p(7, 1, P.gold);
};
const treasure: Icon = (pc) => {
  pc.rect(2, 6, 12, 8, RAMPS.wood[1]);
  pc.rect(2, 6, 12, 3, RAMPS.wood[2]);
  pc.frame(2, 6, 12, 8, RAMPS.metal[2]);
  pc.rect(7, 8, 3, 4, P.gold);
  pc.p(8, 10, P.cream);
  pc.hline(2, 13, 12, RAMPS.wood[0]);
};
const coin: Icon = (pc) => {
  pc.disc(8, 8, 6, 6, RAMPS.gold[1]);
  pc.disc(8, 8, 5, 5, RAMPS.gold[2]);
  pc.disc(7, 7, 3, 3, RAMPS.gold[3]);
  pc.vline(8, 4, 8, RAMPS.gold[0]);
  pc.hline(5, 8, 6, RAMPS.gold[0]);
};
const keyItem: Icon = (pc) => {
  pc.disc(4, 5, 3, 3, P.gold);
  pc.disc(4, 5, 1, 1, RAMPS.gold[0]);
  pc.line(6, 7, 12, 13, P.gold);
  pc.rect(11, 10, 2, 2, P.cream);
  pc.rect(9, 12, 2, 2, P.cream);
};
const gem: Icon = (pc) => {
  pc.tri(8, 1, 2, 7, 14, 7, P.star);
  pc.tri(8, 15, 2, 7, 14, 7, P.mystic);
  pc.line(8, 1, 5, 7, P.paper);
  pc.line(5, 7, 8, 15, P.arcane);
};

/* ------------------------------------------------------------- equipment */

const sword: Icon = (pc) => blade(pc, RAMPS.metal[3], RAMPS.metal[2], P.rust);
/** Same silhouette as the sword, one third the blade — a starter sidearm. */
const dagger: Icon = (pc) => {
  pc.line(10, 3, 6, 9, RAMPS.metal[2]);
  pc.line(11, 4, 7, 10, RAMPS.metal[3]);
  pc.line(10, 3, 11, 4, RAMPS.metal[3]);
  pc.rect(4, 8, 4, 2, P.steel);
  pc.rect(3, 11, 3, 3, P.wood);
  pc.p(2, 13, P.gold);
};
const axe: Icon = (pc) => {
  pc.line(4, 13, 11, 3, P.wood);
  pc.tri(11, 2, 15, 5, 10, 7, RAMPS.metal[2]);
  pc.tri(11, 2, 14, 4, 11, 6, RAMPS.metal[3]);
  pc.p(4, 13, P.woodLt);
};
const spear: Icon = (pc) => {
  pc.line(3, 13, 12, 2, P.woodLt);
  pc.tri(13, 1, 10, 5, 14, 5, RAMPS.metal[3]);
  pc.rect(4, 11, 3, 3, P.wood);
};
const staff: Icon = (pc) => {
  pc.rect(6, 4, 2, 11, P.wood);
  pc.rect(5, 13, 4, 2, RAMPS.wood[0]);
  pc.disc(7, 4, 4, 4, RAMPS.metal[1]);
  pc.disc(7, 4, 3, 3, P.mystic);
  pc.p(6, 3, P.star); pc.p(7, 2, P.paper);
};
const bow: Icon = (pc) => {
  pc.line(4, 1, 12, 8, P.wood);
  pc.line(12, 8, 4, 15, P.woodLt);
  pc.line(4, 1, 4, 15, P.bone);
  pc.hline(4, 8, 9, P.steel);
  pc.tri(13, 8, 11, 6, 11, 10, RAMPS.metal[3]);
};
const shieldI: Icon = (pc) => {
  pc.rect(3, 2, 10, 8, RAMPS.metal[2]);
  pc.tri(13, 10, 3, 10, 8, 15, RAMPS.metal[1]);
  pc.rect(3, 2, 10, 2, RAMPS.metal[3]);
  pc.vline(8, 3, 10, P.gold);
  pc.hline(4, 6, 8, P.gold);
  pc.p(8, 6, P.cream);
};
const helm: Icon = (pc) => {
  pc.rect(4, 2, 8, 8, RAMPS.metal[2]);
  pc.rect(4, 2, 8, 2, RAMPS.metal[3]);
  pc.rect(3, 10, 10, 3, RAMPS.metal[1]);
  pc.rect(5, 6, 6, 2, P.ink);
  pc.vline(8, 2, 11, RAMPS.metal[0]);
  pc.rect(7, 0, 2, 3, P.rose);
};
const armor: Icon = (pc) => {
  pc.rect(3, 3, 10, 10, RAMPS.metal[1]);
  pc.rect(3, 3, 10, 2, RAMPS.metal[3]);
  pc.rect(1, 3, 3, 5, RAMPS.metal[2]);
  pc.rect(12, 3, 3, 5, RAMPS.metal[2]);
  pc.vline(8, 5, 8, RAMPS.metal[0]);
  pc.hline(4, 9, 8, RAMPS.metal[0]);
  pc.p(8, 6, P.gold);
};
const robe: Icon = (pc) => {
  pc.tri(8, 1, 3, 14, 13, 14, RAMPS.cloth[2]);
  pc.rect(6, 1, 4, 3, RAMPS.cloth[3]);
  pc.line(8, 3, 5, 14, RAMPS.cloth[1]);
  pc.p(8, 6, P.star); pc.p(8, 10, P.star);
};
const gloves: Icon = (pc) => {
  pc.rect(4, 4, 8, 8, RAMPS.leather[2]);
  pc.rect(4, 4, 8, 2, RAMPS.leather[3]);
  pc.rect(2, 6, 2, 4, RAMPS.leather[1]);
  pc.rect(4, 12, 8, 2, RAMPS.leather[0]);
  pc.vline(7, 6, 5, RAMPS.leather[0]);
};
const boots: Icon = (pc) => {
  pc.rect(5, 2, 5, 8, RAMPS.leather[2]);
  pc.rect(5, 10, 9, 4, RAMPS.leather[1]);
  pc.rect(5, 2, 5, 2, RAMPS.leather[3]);
  pc.rect(4, 13, 11, 2, RAMPS.leather[0]);
  pc.p(6, 5, RAMPS.leather[3]);
};
const ring: Icon = (pc) => {
  pc.ring(8, 9, 5, 5, RAMPS.gold[2]);
  pc.ring(8, 9, 4, 4, RAMPS.gold[3]);
  pc.disc(8, 3, 2, 2, P.star);
  pc.p(8, 3, P.paper);
};
const amulet: Icon = (pc) => {
  pc.line(3, 1, 8, 7, P.gold);
  pc.line(13, 1, 8, 7, P.gold);
  pc.disc(8, 10, 4, 4, RAMPS.gold[2]);
  pc.disc(8, 10, 2, 2, P.mystic);
  pc.p(8, 9, P.paper);
};

/* ---------------------------------------------------------- magic & status */

const fire: Icon = (pc) => {
  pc.tri(8, 0, 3, 9, 13, 9, P.ember);
  pc.tri(8, 3, 5, 11, 11, 11, P.flame);
  pc.tri(8, 6, 6, 13, 10, 13, P.gold);
  pc.p(8, 12, P.cream);
  pc.p(5, 4, P.flame); pc.p(11, 5, P.flame);
};
const ice: Icon = (pc) => {
  for (const [dx, dy] of [[0, 1], [1, 0], [1, 1], [1, -1]] as const) {
    pc.line(8 - dx * 6, 8 - dy * 6, 8 + dx * 6, 8 + dy * 6, P.sky);
    pc.line(8 - dx * 5, 8 - dy * 5, 8 + dx * 5, 8 + dy * 5, P.ice);
  }
  pc.disc(8, 8, 2, 2, P.paper);
};
const thunder: Icon = (pc) => {
  pc.rows(['....777.....', '...777......', '..7777......', '.7777777....', '....7777....', '...777......', '..777.......', '.777........'], { '7': P.gold });
  pc.rows(['....77......', '...77.......', '..7777......', '.777777.....', '....777.....', '...77.......', '..77........', '.77.........'], { '7': P.cream });
};
const light: Icon = (pc) => {
  pc.disc(8, 8, 4, 4, P.gold);
  pc.disc(8, 8, 2, 2, P.cream);
  pc.p(8, 8, P.paper);
  for (const [dx, dy] of [[0, -7], [0, 7], [-7, 0], [7, 0]] as const) pc.line(8, 8, 8 + dx, 8 + dy, P.cream);
};
const dark: Icon = (pc) => {
  pc.disc(8, 8, 6, 6, RAMPS.magic[2]);
  pc.disc(9, 7, 5, 5, RAMPS.magic[1]);
  pc.disc(7, 8, 4, 4, RAMPS.magic[3]);
  pc.p(6, 6, P.star);
};
const healI: Icon = (pc) => {
  pc.rect(6, 2, 4, 12, RAMPS.grassLit[3]);
  pc.rect(2, 6, 12, 4, RAMPS.grassLit[3]);
  pc.rect(6, 2, 4, 1, RAMPS.grassLit[2]);
  pc.p(7, 7, P.paper); pc.p(8, 8, P.paper);
};
const buff: Icon = (pc) => {
  pc.tri(8, 1, 2, 14, 14, 14, RAMPS.gold[2]);
  pc.tri(8, 4, 4, 13, 12, 13, RAMPS.gold[3]);
  pc.p(8, 8, P.paper);
};
const debuff: Icon = (pc) => {
  pc.tri(8, 15, 2, 2, 14, 2, RAMPS.blood[2]);
  pc.tri(8, 12, 4, 3, 12, 3, RAMPS.blood[3]);
  pc.p(8, 8, P.coral);
};
const poison: Icon = (pc) => {
  pc.disc(8, 10, 5, 4, '#3f7a3a');
  pc.disc(7, 9, 3, 2, '#79b85a');
  pc.disc(5, 4, 2, 2, '#79b85a');
  pc.disc(11, 6, 2, 2, '#a6d87c');
  pc.p(6, 8, P.paper);
};
const sleep: Icon = (pc) => {
  pc.rows(['..77777.....', '......7.....', '.....7......', '....7.......', '...7........', '..7.........', '.777777.....'], { '7': P.bone });
  pc.rect(11, 1, 3, 1, P.star);
  pc.rect(12, 3, 3, 1, P.star);
};
const stun: Icon = (pc) => {
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const x = 8 + Math.round(Math.cos(a) * 5), y = 8 + Math.round(Math.sin(a) * 5);
    pc.rect(x, y, 2, 1, P.gold);
    pc.rect(x + 1, y - 1, 1, 3, P.gold);
  }
  pc.disc(8, 8, 2, 2, P.cream);
};
const curse: Icon = (pc) => {
  pc.vline(8, 2, 12, P.mystic);
  pc.hline(3, 6, 10, P.mystic);
  pc.hline(4, 11, 8, P.arcane);
  pc.p(5, 3, P.star); pc.p(11, 9, P.star);
};
const defend: Icon = (pc) => {
  pc.rect(3, 3, 10, 7, RAMPS.cloth[2]);
  pc.tri(13, 10, 3, 10, 8, 15, RAMPS.cloth[1]);
  pc.frame(3, 3, 10, 7, RAMPS.cloth[3]);
  pc.hline(5, 7, 6, P.paper);
};
const regen: Icon = (pc) => {
  pc.ring(8, 8, 6, 6, RAMPS.grassLit[2]);
  pc.p(8, 2, P.sprout); pc.p(14, 8, P.sprout); pc.p(8, 14, P.sprout);
  pc.rect(7, 6, 2, 4, P.leaf); pc.rect(6, 7, 4, 2, P.leaf);
};
const silence: Icon = (pc) => {
  pc.rect(2, 6, 3, 4, RAMPS.metal[2]);
  pc.tri(5, 6, 5, 10, 10, 13, RAMPS.metal[1]);
  pc.line(10, 4, 15, 12, P.rose);
  pc.line(15, 4, 10, 12, P.rose);
};

/* ------------------------------------------------------------- misc / HUD */

const heart: Icon = (pc) => {
  pc.rect(3, 4, 4, 4, P.rose);
  pc.rect(9, 4, 4, 4, P.rose);
  pc.rect(2, 6, 12, 4, P.rose);
  pc.rect(4, 10, 8, 2, P.blood);
  pc.rect(6, 12, 4, 1, P.blood);
  pc.p(4, 5, P.coral); pc.p(5, 5, P.coral); pc.p(4, 6, P.coral);
};
const starXp: Icon = (pc) => {
  pc.rect(6, 1, 4, 12, P.gold);
  pc.rect(1, 6, 14, 4, P.gold);
  pc.rect(4, 4, 8, 8, P.gold);
  pc.rect(6, 3, 4, 2, P.cream);
  pc.p(7, 7, P.cream); pc.p(8, 8, P.cream);
};
const cursor: Icon = (pc) => {
  pc.tri(3, 2, 3, 14, 13, 8, P.gold);
  pc.tri(4, 4, 4, 12, 11, 8, P.cream);
  pc.p(4, 8, P.paper);
};
const check: Icon = (pc) => {
  pc.line(2, 8, 6, 12, P.sprout);
  pc.line(6, 12, 14, 2, P.sprout);
  pc.line(3, 8, 6, 11, P.paper);
};
const cross: Icon = (pc) => {
  pc.line(3, 3, 13, 13, P.rose);
  pc.line(13, 3, 3, 13, P.rose);
  pc.line(4, 4, 12, 12, P.coral);
};
const lock: Icon = (pc) => {
  pc.rect(4, 7, 8, 8, RAMPS.metal[1]);
  pc.rect(4, 7, 8, 1, RAMPS.metal[3]);
  pc.frame(5, 2, 6, 6, RAMPS.metal[2]);
  pc.rect(7, 9, 2, 4, P.gold);
};
const arrowUp: Icon = (pc) => {
  pc.tri(8, 2, 2, 10, 14, 10, P.bone);
  pc.rect(6, 10, 4, 5, P.bone);
  pc.line(8, 3, 4, 9, P.paper);
};
const arrowDown: Icon = (pc) => {
  pc.tri(8, 14, 2, 6, 14, 6, P.bone);
  pc.rect(6, 1, 4, 5, P.bone);
  pc.line(8, 13, 4, 7, P.paper);
};
const quest: Icon = (pc) => {
  pc.rect(3, 2, 10, 12, P.bone);
  pc.rect(3, 2, 10, 2, P.paper);
  pc.hline(5, 6, 6, P.slate);
  pc.hline(5, 9, 6, P.slate);
  pc.hline(5, 12, 4, P.slate);
  pc.p(11, 12, P.gold);
};
const mapIcon: Icon = (pc) => {
  pc.rect(2, 3, 12, 10, '#d8c79a');
  pc.rect(2, 3, 12, 1, '#f0e3bd');
  pc.line(5, 4, 5, 12, '#a8905e');
  pc.line(11, 4, 11, 12, '#a8905e');
  pc.line(2, 8, 14, 8, '#8a3a24');
  pc.p(8, 8, P.rose);
};
const saveIcon: Icon = (pc) => {
  pc.rect(2, 2, 12, 12, RAMPS.metal[1]);
  pc.rect(2, 2, 12, 1, RAMPS.metal[3]);
  pc.rect(4, 2, 6, 4, P.paper);
  pc.rect(9, 2, 2, 5, RAMPS.metal[0]);
  pc.rect(4, 9, 8, 4, P.bone);
  pc.p(5, 10, P.slate);
};
const flee: Icon = (pc) => {
  pc.line(4, 14, 8, 8, P.bone);
  pc.line(8, 8, 7, 2, P.bone);
  pc.line(8, 8, 12, 12, P.bone);
  pc.line(8, 5, 12, 3, P.bone);
  pc.disc(9, 1, 2, 2, P.cream);
  pc.hline(2, 13, 4, P.steel);
};
const npcMark: Icon = (pc) => {
  pc.disc(8, 8, 6, 6, P.gold);
  pc.disc(8, 8, 5, 5, P.cream);
  pc.rect(7, 4, 2, 6, P.ink);
  pc.rect(7, 11, 2, 2, P.ink);
};
const sparkles: Icon = (pc) => {
  pc.rect(7, 1, 2, 6, P.star);
  pc.rect(5, 3, 6, 2, P.star);
  pc.rect(11, 8, 2, 5, P.mystic);
  pc.rect(9, 10, 6, 2, P.mystic);
  pc.p(4, 12, P.paper);
};

/* --------------------------------------------------------------- registry */

export const ICONS: Record<string, Icon> = {
  // consumables
  potion_s: potionS, potion_l: potionL, elixir, ether, antidote, revive,
  bread, meat, bomb, ball, torch, treasure, coin, key: keyItem, gem,
  // equipment
  sword, dagger, axe, spear, staff, bow, shield: shieldI, helm, armor, robe,
  gloves, boots, ring, amulet,
  // skills + status
  fire, ice, thunder, light, dark, heal: healI, buff, debuff,
  poison, burn: fire, freeze: ice, sleep, stun, curse, defend, regen, silence,
  // hud
  heart, star: starXp, cursor, check, cross, lock, arrow_up: arrowUp,
  arrow_down: arrowDown, quest, map: mapIcon, save: saveIcon, flee,
  npc: npcMark, sparkles
};

/** Pack every icon into a single 16x16 grid atlas. */
export function buildIconAtlas(key = 'icons'): SpriteAtlas {
  const names = Object.keys(ICONS);
  const cols = 12;
  const rows = Math.ceil(names.length / cols);
  const sheet = new PC(cols * ICON_SIZE, rows * ICON_SIZE);
  const frames = names.map((name, i) => {
    const cell = new PC(ICON_SIZE, ICON_SIZE);
    ICONS[name](cell);
    outline(cell, P.ink);
    const x = (i % cols) * ICON_SIZE;
    const y = Math.floor(i / cols) * ICON_SIZE;
    sheet.blit(cell, x, y);
    return { name, x, y, w: ICON_SIZE, h: ICON_SIZE };
  });
  return { key, pc: sheet, frames };
}

