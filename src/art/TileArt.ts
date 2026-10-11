/**
 * Ground surfaces.
 *
 * Terrain is stored in maps as a material id per cell. At render time the
 * neighbour mask (N/E/S/W) selects one of 16 pre-rendered autotile variants, so
 * grass->path->plaza transitions get organic jagged edges instead of hard
 * square seams. Water and lava get 4 animated frames instead of a mask.
 */

import { P, RAMPS } from './Palette';
import { PC } from './PixelCanvas';
import { placed, type FrameDef, type SpriteAtlas } from './TextureBuild';

export const TS = 16;

interface Material {
  fill: string;
  noise: string[];
  /** colour of the band drawn where a *different* material borders the tile */
  fringe: string;
  fringeDark: string;
  decor?: (pc: PC, seed: number) => void;
}

const grassDecor = (pc: PC, seed: number) => {
  for (let i = 0; i < 5; i++) {
    const x = Math.floor(PC.hash(i, seed, 3) * 15);
    const y = Math.floor(PC.hash(i, seed, 7) * 15);
    pc.vline(x, y, 2, RAMPS.grass[3]);
    pc.p(x + 1, y + 1, RAMPS.grass[2]);
  }
};

const rockDecor = (pc: PC, seed: number) => {
  for (let i = 0; i < 3; i++) {
    const x = 1 + Math.floor(PC.hash(i, seed, 11) * 13);
    const y = 1 + Math.floor(PC.hash(i, seed, 13) * 13);
    pc.p(x, y, RAMPS.stone[3]);
    pc.p(x + 1, y, RAMPS.stone[2]);
    pc.p(x, y + 1, RAMPS.stone[1]);
  }
};

export const MATERIALS: Record<string, Material> = {
  grass: {
    fill: '#33623c', noise: ['#3d7446', '#4d8c52', '#2a5233'],
    fringe: '#3d7446', fringeDark: '#24462b', decor: grassDecor
  },
  darkgrass: {
    fill: '#25492e', noise: ['#2f5c39', '#3a6d43', '#1d3b25'],
    fringe: '#2f5c39', fringeDark: '#183020', decor: grassDecor
  },
  moss: {
    fill: '#2c5738', noise: ['#3a7046', '#548f55', '#22442c'],
    fringe: '#3a7046', fringeDark: '#1c3823', decor: grassDecor
  },
  leaves: {
    fill: '#2b4c2c', noise: ['#3c6638', '#54834a', '#1f3a21'],
    fringe: '#3c6638', fringeDark: '#182e1b', decor: grassDecor
  },
  dirt: {
    fill: '#5b4029', noise: ['#6d4e31', '#48321f', '#7d5b39'],
    fringe: '#4a3527', fringeDark: '#33231a'
  },
  path: {
    fill: '#7a5c3c', noise: ['#8b6b47', '#654a30', '#9c7a52'],
    fringe: '#6b4c33', fringeDark: '#4a3527', decor: rockDecor
  },
  sand: {
    fill: '#b39a6b', noise: ['#c4ab7c', '#9e875c', '#d5bd8e'],
    fringe: '#9e875c', fringeDark: '#7d6a48'
  },
  stone: {
    fill: '#5b6070', noise: ['#6b7080', '#4b5060', '#7d8292'],
    fringe: '#4b5060', fringeDark: '#3b4050', decor: rockDecor
  },
  plaza: {
    fill: '#767a8a', noise: ['#868a9a', '#666a7a', '#9aa0b0'],
    fringe: '#666a7a', fringeDark: '#4b5060', decor: rockDecor
  },
  floor: {
    fill: '#4e5468', noise: ['#5c6378', '#414758', '#6e7690'],
    fringe: '#3b4050', fringeDark: '#2b3040'
  },
  floor2: {
    fill: '#5e5570', noise: ['#6d6480', '#4c455c', '#7f7694'],
    fringe: '#413a52', fringeDark: '#2f2a3c'
  },
  rubble: {
    fill: '#494455', noise: ['#5a5568', '#3a3646', '#6d6880'],
    fringe: '#3a3646', fringeDark: '#2a2734', decor: rockDecor
  },
  bridge: {
    fill: '#6d4a2c', noise: ['#7d5734', '#5a3d24', '#8d6540'],
    fringe: '#4a3527', fringeDark: '#33231a'
  },
  void: {
    fill: '#141824', noise: ['#1b2030', '#0f1219', '#232a3c'],
    fringe: '#0f1219', fringeDark: '#0a0d14'
  }
};

export const LIQUIDS = ['water', 'lava'] as const;

function paintLiquid(pc: PC, kind: 'water' | 'lava', frame: number): void {
  const ramp = kind === 'water' ? RAMPS.water : RAMPS.lava;
  pc.rect(0, 0, TS, TS, ramp[1]);
  pc.speckle(0, 0, TS, TS, ramp[0], 0.22, kind === 'water' ? 41 : 77);
  pc.speckle(0, 0, TS, TS, ramp[2], 0.18, kind === 'water' ? 12 : 55);
  for (let i = 0; i < 3; i++) {
    const y = (i * 5 + frame * 2) % TS;
    const x = (frame * 3 + i * 7) % TS;
    pc.hline(x, y, 4, ramp[3]);
    pc.p(x - 1, y, ramp[2]);
    pc.p(x + 4, y, ramp[2]);
  }
  if (kind === 'lava') {
    const bx = (7 + frame * 5) % TS, by = (4 + frame * 3) % TS;
    pc.p(bx, by, P.cream);
    pc.p(bx + 1, by, P.flame);
    pc.p(bx, by + 1, P.ember);
    pc.rect(0, 0, TS, 1, ramp[0]);
  } else {
    pc.rect(0, 0, TS, 1, ramp[0]);
    pc.rect(0, TS - 1, TS, 1, ramp[0]);
  }
}

/** Jagged border band so adjacent materials meet organically. */
function paintFringe(pc: PC, m: Material, mask: number, seed: number): void {
  const N = 1, E = 2, S = 4, W = 8;
  const depth = (x: number, y: number, side: number) =>
    1 + Math.floor(PC.hash(x, y, seed * 31 + side) * 3);

  if (!(mask & N)) {
    for (let x = 0; x < TS; x++) {
      const d = depth(x, 0, 0);
      for (let y = 0; y < d; y++) pc.p(x, y, m.fringe);
      pc.p(x, d, m.fringeDark);
    }
  }
  if (!(mask & S)) {
    for (let x = 0; x < TS; x++) {
      const d = depth(x, 1, 1);
      for (let y = TS - d; y < TS; y++) pc.p(x, y, m.fringe);
      pc.p(x, TS - d - 1, m.fringeDark);
    }
  }
  if (!(mask & W)) {
    for (let y = 0; y < TS; y++) {
      const d = depth(2, y, 2);
      for (let x = 0; x < d; x++) pc.p(x, y, m.fringe);
      pc.p(d, y, m.fringeDark);
    }
  }
  if (!(mask & E)) {
    for (let y = 0; y < TS; y++) {
      const d = depth(3, y, 3);
      for (let x = TS - d; x < TS; x++) pc.p(x, y, m.fringe);
      pc.p(TS - d - 1, y, m.fringeDark);
    }
  }
}

function paintMaterial(pc: PC, name: string, seed: number): void {
  const m = MATERIALS[name];
  pc.rect(0, 0, TS, TS, m.fill);
  for (let i = 0; i < m.noise.length; i++) {
    pc.speckle(0, 0, TS, TS, m.noise[i], 0.16, seed * 17 + i * 5);
  }
  m.decor?.(pc, seed);
}

/**
 * Build one atlas with every material's 16 autotile variants plus animated
 * liquid frames. Frame names: `${material}_${mask}`, `water_0..3`, `lava_0..3`.
 */
export function buildTerrainAtlas(key: string, materials: string[]): SpriteAtlas {
  const names: string[] = [];
  for (const m of materials) for (let mask = 0; mask < 16; mask++) names.push(`${m}_${mask}`);
  for (const liq of LIQUIDS) for (let f = 0; f < 4; f++) names.push(`${liq}_${f}`);

  const cols = 16;
  const rows = Math.ceil(names.length / cols);
  const pc = new PC(cols * TS, rows * TS);
  const frames: FrameDef[] = [];

  names.forEach((name, i) => {
    const x = (i % cols) * TS;
    const y = Math.floor(i / cols) * TS;
    const cell = new PC(TS, TS);
    const cut = name.lastIndexOf('_');
    const base = name.slice(0, cut);
    const suffix = name.slice(cut + 1);
    if (base === 'water' || base === 'lava') {
      paintLiquid(cell, base as 'water' | 'lava', Number(suffix));
    } else {
      const mask = Number(suffix);
      const seed = mask + base.length * 7;
      paintMaterial(cell, base, seed);
      paintFringe(cell, MATERIALS[base], mask, mask + base.length * 3);
    }
    pc.blit(cell, x, y);
    frames.push({ name, x, y, w: TS, h: TS });
  });

  return placed(key, pc, frames);
}
