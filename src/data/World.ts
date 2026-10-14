/**
 * Overworld maps. Each map is a small ASCII grid plus a legend that maps each
 * character to a terrain material, an optional prop and a collision flag.
 * Keeping maps as text means they can be edited (and diffed) by hand.
 */

import { Rng } from '../core/Rng';

export type Dir = 'down' | 'up' | 'left' | 'right';

export interface LegendCell {
  /** Terrain material key (see `src/art/TileArt.ts` MATERIALS). */
  mat?: string;
  /** Animated liquid material (`water` / `lava`). */
  liquid?: 'water' | 'lava';
  /** Prop frame from the prop atlas. */
  prop?: string;
  /** Blocks movement. Defaults to true when a prop is set. */
  solid?: boolean;
}

export const LEGEND: Record<string, LegendCell> = {
  '.': { mat: 'grass' },
  ',': { mat: 'darkgrass' },
  m: { mat: 'moss' },
  d: { mat: 'dirt' },
  p: { mat: 'path' },
  s: { mat: 'sand' },
  c: { mat: 'stone' },
  P: { mat: 'plaza' },
  f: { mat: 'floor' },
  F: { mat: 'floor2' },
  r: { mat: 'rubble' },
  e: { mat: 'bridge' },
  ' ': { mat: 'void' },
  '~': { liquid: 'water', solid: true },
  L: { liquid: 'lava', solid: true },

  T: { mat: 'grass', prop: 'tree', solid: true },
  t: { mat: 'darkgrass', prop: 'pine', solid: true },
  B: { mat: 'grass', prop: 'bigtree', solid: true },
  H: { mat: 'grass', prop: 'bush', solid: true },
  '*': { mat: 'grass', prop: 'flowers' },
  R: { mat: 'dirt', prop: 'rock', solid: true },
  u: { mat: 'grass', prop: 'stump', solid: true },
  l: { mat: 'grass', prop: 'log', solid: true },
  G: { mat: 'darkgrass', prop: 'gravestone', solid: true },
  n: { mat: 'path', prop: 'sign', solid: true },
  '|': { mat: 'grass', prop: 'fence', solid: true },
  C: { mat: 'floor', prop: 'crate', solid: true },
  k: { mat: 'floor', prop: 'barrel', solid: true },
  '#': { mat: 'plaza', prop: 'house_a', solid: true },
  h: { mat: 'grass', prop: 'house_b', solid: true },
  o: { mat: 'plaza', prop: 'shop', solid: true },
  W: { mat: 'plaza', prop: 'well', solid: true },
  Z: { mat: 'grass', prop: 'tent', solid: true },
  D: { mat: 'plaza', prop: 'door' },
  A: { mat: 'stone', prop: 'arch', solid: true },
  I: { mat: 'stone', prop: 'pillar', solid: true },
  i: { mat: 'stone', prop: 'pillar_broken', solid: true },
  X: { mat: 'plaza', prop: 'statue', solid: true },
  Y: { mat: 'floor2', prop: 'crystal', solid: true },
  g: { mat: 'stone', prop: 'gate', solid: true },
  v: { mat: 'stone', prop: 'stairs' },
  q: { mat: 'floor', prop: 'rug' },
  j: { mat: 'floor', prop: 'table', solid: true },
  b: { mat: 'floor', prop: 'bookshelf', solid: true },
  E: { mat: 'floor', prop: 'bed', solid: true },
  x: { mat: 'grass', prop: 'chest', solid: true }
};

export interface WarpDef {
  x: number;
  y: number;
  to: string;
  tx: number;
  ty: number;
  label?: string;
}

export interface NpcDef {
  id: string;
  x: number;
  y: number;
  /** Key in `CHAR_SPECS` (`src/data/CharacterSpecs.ts`). */
  art: string;
  dir: Dir | 'side';
  /** Dialogue id (`src/data/Dialogue.ts`). */
  talk: string;
  /** Optional battle backdrop tint for the portrait. */
  wander?: number;
}

export interface ChestDef {
  id: string;
  x: number;
  y: number;
  items: [string, number][];
  gold?: number;
  /** Flag flipped once opened; the prop swaps to `chest_open`. */
  flag: string;
  message: string;
}

export interface TriggerDef {
  id: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  /** Story beat fired when the player steps on the tile. */
  story: string;
  /** Flag used so it only fires once. */
  flag: string;
}

export interface MapDef {
  id: string;
  name: string;
  /** Music theme id. */
  theme: string;
  /** Battle backdrop key. */
  arena: string;
  /** Key into `ENCOUNTERS`; omit for a safe area. */
  encounter?: string;
  /** Chance per tile stepped. */
  rate: number;
  rows: string[];
  /**
   * Material key the land is extended with when the window shows more than the
   * map covers, so a wide window reads as country running past the border
   * instead of a map floating in a black box (see `WorldScene.buildBackdrop`).
   * Outdoor maps name the ground their border ring sits on; interiors leave it
   * out and stay a lit room in the dark.
   */
  outside?: string;
  warps: WarpDef[];
  npcs: NpcDef[];
  chests: ChestDef[];
  triggers: TriggerDef[];
  spawn: { x: number; y: number; dir: Dir };
}

/* --------------------------------------------------------------- builders */

/** Small deterministic grid painter used to author the maps below. */
class Painter {
  private grid: string[][];

  constructor(public w: number, public h: number, fill = '.') {
    this.grid = Array.from({ length: h }, () => Array.from({ length: w }, () => fill));
  }

  set(x: number, y: number, ch: string): this {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.grid[y][x] = ch;
    return this;
  }

  rect(x: number, y: number, w: number, h: number, ch: string): this {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, ch);
    return this;
  }

  hline(x: number, y: number, w: number, ch: string): this {
    return this.rect(x, y, w, 1, ch);
  }

  vline(x: number, y: number, h: number, ch: string): this {
    return this.rect(x, y, 1, h, ch);
  }

  border(ch: string): this {
    this.hline(0, 0, this.w, ch).hline(0, this.h - 1, this.w, ch);
    this.vline(0, 0, this.h, ch).vline(this.w - 1, 0, this.h, ch);
    return this;
  }

  /** Deterministic scatter over an optional rect. */
  scatter(ch: string, count: number, rng: Rng, x = 0, y = 0, w = this.w, h = this.h): this {
    for (let i = 0; i < count; i++) {
      const px = x + rng.int(0, w - 1);
      const py = y + rng.int(0, h - 1);
      if (this.grid[py][px] === '.' || this.grid[py][px] === ',') this.set(px, py, ch);
    }
    return this;
  }

  rows(): string[] {
    return this.grid.map((r) => r.join(''));
  }
}

/* ------------------------------------------------------------------ maps */

/** Havenport — the starting village. Safe, no encounters. */
function villageRows(): string[] {
  const p = new Painter(40, 26, '.');
  const r = new Rng(11);
  p.border('T');
  p.scatter(',', 70, r);
  p.scatter('*', 22, r, 2, 2, 36, 22);
  p.scatter('H', 10, r, 2, 2, 36, 22);
  // central plaza
  p.rect(14, 9, 12, 8, 'P');
  p.set(19, 11, 'W');
  p.set(21, 11, 'X');
  // roads
  p.hline(3, 13, 34, 'p');
  p.vline(19, 1, 24, 'p');
  // buildings (door tiles warp indoors)
  p.set(10, 9, '#').set(10, 10, 'D');
  p.set(27, 9, 'h').set(27, 10, 'D');
  p.set(27, 16, '#').set(27, 17, 'D');
  p.set(8, 17, 'h').set(8, 18, 'n');
  // fences + garden
  p.rect(5, 19, 6, 1, '|');
  p.scatter('u', 6, r, 3, 20, 34, 5);
  // exits
  p.set(19, 25, 'p');
  p.set(39, 13, 'p');
  return p.rows();
}

/** Ashen Wood — the first dangerous area. */
function forestRows(): string[] {
  const p = new Painter(44, 30, ',');
  const r = new Rng(23);
  p.border('T');
  p.scatter('T', 90, r);
  p.scatter('t', 40, r);
  p.scatter('B', 12, r);
  p.scatter('.', 70, r);
  p.scatter('*', 24, r);
  p.scatter('H', 26, r);
  p.scatter('R', 14, r);
  p.scatter('u', 10, r);
  // main trail south -> north
  p.vline(21, 1, 28, 'p');
  p.hline(4, 15, 36, 'p');
  p.rect(18, 12, 8, 6, 'P');
  // pond
  p.rect(6, 20, 7, 5, '~');
  p.scatter('l', 6, r, 2, 2, 40, 26);
  // shrine clearing
  p.rect(30, 6, 8, 6, 'm');
  p.set(33, 8, 'X');
  p.set(0, 15, 'p');
  return p.rows();
}

/** The road between Havenport and the ruins. */
function roadRows(): string[] {
  const p = new Painter(44, 14, 's');
  const r = new Rng(37);
  p.border('R');
  p.hline(1, 7, 42, 'p');
  p.vline(21, 1, 12, 'p');
  p.scatter('.', 40, r);
  p.scatter('T', 18, r);
  p.scatter('t', 14, r);
  p.scatter('R', 12, r);
  p.scatter('|', 10, r);
  p.set(21, 0, 'p').set(21, 13, 'p');
  p.set(4, 5, 'n');
  p.set(36, 5, 'n');
  return p.rows();
}

/** The Sunken Ruins — endgame area and boss arena. */
function ruinsRows(): string[] {
  const p = new Painter(40, 28, 'r');
  const r = new Rng(53);
  p.border('c');
  p.scatter('r', 60, r);
  p.scatter('i', 26, r);
  p.scatter('I', 16, r);
  p.scatter('~', 22, r);
  p.rect(16, 4, 8, 6, 'F');
  p.set(17, 6, 'Y').set(22, 6, 'Y');
  p.rect(12, 12, 16, 10, 'f');
  p.set(12, 12, 'I').set(27, 12, 'I').set(12, 21, 'I').set(27, 21, 'I');
  p.hline(8, 17, 24, 'F');
  p.vline(19, 10, 16, 'F');
  p.set(19, 0, 'p');
  p.set(19, 22, 'A');
  p.scatter('C', 8, r, 13, 13, 14, 8);
  return p.rows();
}

/** Tiny interiors: inn, shop, library. */
function innRows(): string[] {
  const p = new Painter(16, 12, 'f');
  p.border('c');
  p.rect(2, 2, 4, 2, 'q');
  p.set(3, 2, 'E').set(5, 2, 'E');
  p.set(10, 2, 'j').set(12, 3, 'k');
  p.set(7, 10, 'D');
  p.hline(4, 10, 8, 'q');
  return p.rows();
}

function shopRows(): string[] {
  const p = new Painter(14, 10, 'f');
  p.border('c');
  p.set(3, 2, 'j').set(5, 2, 'C').set(10, 2, 'b');
  p.set(6, 8, 'D');
  return p.rows();
}

function libraryRows(): string[] {
  const p = new Painter(14, 10, 'f');
  p.border('c');
  p.set(2, 2, 'b').set(4, 2, 'b').set(9, 2, 'b').set(11, 2, 'b');
  p.set(6, 4, 'j');
  p.set(6, 8, 'D');
  return p.rows();
}

/* -------------------------------------------------------------- registry */

export const MAPS: Record<string, MapDef> = {
  village: {
    id: 'village',
    name: 'Havenport',
    theme: 'village',
    arena: 'arena_road',
    rate: 0,
    outside: 'grass',
    rows: villageRows(),
    spawn: { x: 19, y: 16, dir: 'up' },
    warps: [
      { x: 10, y: 10, to: 'inn', tx: 7, ty: 9, label: 'The Sleeping Star' },
      { x: 27, y: 10, to: 'shop', tx: 6, ty: 7, label: 'General store' },
      { x: 27, y: 17, to: 'library', tx: 6, ty: 7, label: 'Reading hall' },
      { x: 19, y: 25, to: 'road', tx: 21, ty: 1, label: 'South road' },
      { x: 39, y: 13, to: 'forest', tx: 1, ty: 15, label: 'Ashen Wood' }
    ],
    npcs: [
      { id: 'elder', x: 17, y: 12, art: 'elder', dir: 'down', talk: 'elder' },
      { id: 'guard', x: 22, y: 10, art: 'guard', dir: 'down', talk: 'guard' },
      { id: 'child', x: 16, y: 15, art: 'child', dir: 'side', talk: 'child' },
      { id: 'villager', x: 12, y: 14, art: 'merchant', dir: 'side', talk: 'villager' },
      { id: 'wander', x: 24, y: 15, art: 'rowan', dir: 'down', talk: 'wanderer' }
    ],
    chests: [
      {
        id: 'v1', x: 5, y: 21, items: [['potion_s', 2]], gold: 20,
        flag: 'chest.v1', message: 'Two salves and a handful of coin.'
      }
    ],
    triggers: [{ id: 't_arrival', x: 19, y: 13, story: 'arrival', flag: 'story.arrival' }]
  },

  forest: {
    id: 'forest',
    name: 'Ashen Wood',
    theme: 'forest',
    arena: 'arena_forest',
    encounter: 'forest',
    rate: 0.09,
    outside: 'grass',
    rows: forestRows(),
    spawn: { x: 1, y: 15, dir: 'right' },
    warps: [{ x: 0, y: 15, to: 'village', tx: 38, ty: 13, label: 'Havenport' }],
    npcs: [{ id: 'hermit', x: 33, y: 9, art: 'elder', dir: 'down', talk: 'hermit' }],
    chests: [
      {
        id: 'f1', x: 8, y: 17, items: [['ether', 1]], flag: 'chest.f1',
        message: 'Someone left an Ether here.'
      },
      {
        id: 'f2', x: 35, y: 7, items: [['robe_sage', 1]], flag: 'chest.f2',
        message: 'A sage robe, folded neatly.'
      }
    ],
    triggers: [
      { id: 't_wraith', x: 21, y: 12, story: 'first_wraith', flag: 'story.first_wraith' },
      { id: 't_hermit', x: 33, y: 10, story: 'hermit_offer', flag: 'story.hermit_offer' }
    ]
  },

  road: {
    id: 'road',
    name: 'The Ash Road',
    theme: 'forest',
    arena: 'arena_road',
    encounter: 'road',
    rate: 0.07,
    outside: 'dirt',
    rows: roadRows(),
    spawn: { x: 21, y: 12, dir: 'up' },
    warps: [
      { x: 21, y: 0, to: 'village', tx: 19, ty: 24, label: 'Havenport' },
      { x: 21, y: 13, to: 'ruins', tx: 19, ty: 1, label: 'Sunken Ruins' }
    ],
    npcs: [{ id: 'pedlar', x: 24, y: 6, art: 'merchant', dir: 'down', talk: 'pedlar' }],
    chests: [
      {
        id: 'r1', x: 6, y: 9, items: [['potion_l', 1], ['herb', 3]], flag: 'chest.r1',
        message: 'A buried pack: salve and herbs.'
      }
    ],
    triggers: []
  },

  ruins: {
    id: 'ruins',
    name: 'Sunken Ruins',
    theme: 'ruins',
    arena: 'arena_ruins',
    encounter: 'ruins',
    rate: 0.11,
    outside: 'stone',
    rows: ruinsRows(),
    spawn: { x: 19, y: 1, dir: 'down' },
    warps: [{ x: 19, y: 0, to: 'road', tx: 21, ty: 12, label: 'The Ash Road' }],
    npcs: [],
    chests: [
      {
        id: 'u1', x: 14, y: 14, items: [['staff_star', 1]], flag: 'chest.u1',
        message: 'A warding staff, still warm.'
      },
      {
        id: 'u2', x: 26, y: 19, items: [['elixir', 1], ['gem', 2]], flag: 'chest.u2',
        message: 'Star shards glitter in the dark.'
      }
    ],
    triggers: [
      { id: 't_gate', x: 19, y: 21, story: 'ruins_gate', flag: 'story.ruins_gate' },
      { id: 't_warden', x: 19, y: 5, story: 'boss_warden', flag: 'story.boss_warden' }
    ]
  },

  inn: {
    id: 'inn',
    name: 'The Sleeping Star',
    theme: 'village',
    arena: 'arena_road',
    rate: 0,
    rows: innRows(),
    spawn: { x: 7, y: 9, dir: 'up' },
    warps: [{ x: 7, y: 10, to: 'village', tx: 10, ty: 11, label: 'Outside' }],
    npcs: [{ id: 'innkeep', x: 6, y: 4, art: 'merchant', dir: 'down', talk: 'innkeep' }],
    chests: [],
    triggers: []
  },

  shop: {
    id: 'shop',
    name: 'General Store',
    theme: 'village',
    arena: 'arena_road',
    rate: 0,
    rows: shopRows(),
    spawn: { x: 6, y: 7, dir: 'up' },
    warps: [{ x: 6, y: 8, to: 'village', tx: 27, ty: 11, label: 'Outside' }],
    npcs: [{ id: 'shopkeep', x: 4, y: 4, art: 'merchant', dir: 'down', talk: 'shopkeep' }],
    chests: [],
    triggers: []
  },

  library: {
    id: 'library',
    name: 'Reading Hall',
    theme: 'village',
    arena: 'arena_road',
    rate: 0,
    rows: libraryRows(),
    spawn: { x: 6, y: 7, dir: 'up' },
    warps: [{ x: 6, y: 8, to: 'village', tx: 27, ty: 18, label: 'Outside' }],
    npcs: [{ id: 'sage', x: 8, y: 4, art: 'elder', dir: 'down', talk: 'sage' }],
    chests: [],
    triggers: []
  }
};

/* --------------------------------------------------------------- helpers */

export function mapDef(id: string): MapDef {
  const m = MAPS[id];
  if (!m) throw new Error(`Unknown map: ${id}`);
  return m;
}

export function mapWidth(m: MapDef): number {
  return m.rows.reduce((a, r) => Math.max(a, r.length), 0);
}

export function mapHeight(m: MapDef): number {
  return m.rows.length;
}

export function charAt(m: MapDef, x: number, y: number): string {
  if (y < 0 || y >= m.rows.length) return ' ';
  const row = m.rows[y];
  if (x < 0 || x >= row.length) return ' ';
  return row[x];
}

export function cellAt(m: MapDef, x: number, y: number): LegendCell {
  return LEGEND[charAt(m, x, y)] ?? { mat: 'void', solid: true };
}

export function isSolid(m: MapDef, x: number, y: number): boolean {
  const c = cellAt(m, x, y);
  if (c.solid !== undefined) return c.solid;
  return !!c.prop;
}

export function warpAt(m: MapDef, x: number, y: number): WarpDef | undefined {
  return m.warps.find((w) => w.x === x && w.y === y);
}

/** Materials actually used by a map, so the terrain atlas stays small. */
export function materialsFor(m: MapDef): string[] {
  const set = new Set<string>();
  for (const row of m.rows) {
    for (const ch of row) {
      const c = LEGEND[ch];
      if (c?.mat) set.add(c.mat);
      if (c?.liquid) set.add(c.liquid);
    }
  }
  return Array.from(set);
}

/** Props used by a map (plus chests, which are swapped at runtime). */
export function propsFor(m: MapDef): string[] {
  const set = new Set<string>();
  for (const row of m.rows) {
    for (const ch of row) {
      const c = LEGEND[ch];
      if (c?.prop) set.add(c.prop);
    }
  }
  set.add('chest');
  set.add('chest_open');
  return Array.from(set);
}