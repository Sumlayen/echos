/**
 * Art generators return a `SpriteAtlas` (a generated canvas plus named frame
 * rectangles). `BootScene` registers each one as a Phaser texture. Keeping this
 * indirection means the generators never import Phaser and stay unit-testable.
 */

import { PC } from './PixelCanvas';

export interface FrameDef {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SpriteAtlas {
  key: string;
  pc: PC;
  frames: FrameDef[];
}

/** Convenience: lay frames out in a single horizontal strip. */
export function strip(key: string, frames: PC[], pad = 0): SpriteAtlas {
  const h = Math.max(...frames.map((f) => f.h)) + pad * 2;
  const w = frames.reduce((a, f) => a + f.w + pad, pad);
  const sheet = new PC(w, h);
  const defs: FrameDef[] = [];
  let x = pad;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    sheet.blit(f, x, pad);
    defs.push({ name: `f${i}`, x, y: pad, w: f.w, h: f.h });
    x += f.w + pad;
  }
  return { key, pc: sheet, frames: defs };
}

/** Convenience: lay frames out on a fixed grid of cells. */
export function grid(key: string, cellW: number, cellH: number, frames: PC[]): SpriteAtlas {
  const cols = Math.max(1, frames.length);
  const sheet = new PC(cellW * cols, cellH);
  const defs: FrameDef[] = [];
  frames.forEach((f, i) => {
    const x = i * cellW;
    sheet.blit(f, x + Math.floor((cellW - f.w) / 2), cellH - f.h);
    defs.push({ name: `f${i}`, x, y: 0, w: cellW, h: cellH });
  });
  return { key, pc: sheet, frames: defs };
}

/** Explicit placement: the generator already knows where each frame lives. */
export function placed(key: string, pc: PC, frames: FrameDef[]): SpriteAtlas {
  return { key, pc, frames };
}

/**
 * Shelf packer: takes finished frames and packs them left-to-right into rows of
 * `maxW`, bottom-aligned per row. Used by the effect / icon / UI generators,
 * which each produce many differently-sized frames.
 */
export function pack(
  key: string,
  items: { name: string; pc: PC }[],
  maxW = 512,
  pad = 1
): SpriteAtlas {
  const frames: FrameDef[] = [];
  const rows: { y: number; h: number; x: number }[] = [];
  let x = pad, y = pad, sheetW = pad, sheetH = pad;
  for (const item of items) {
    const { w, h } = item.pc;
    if (x + w + pad > maxW && x > pad) {
      x = pad;
      y += rows[rows.length - 1].h + pad;
    }
    const row = rows[rows.length - 1];
    if (!row || row.y !== y) rows.push({ y, h, x: 0 });
    else if (h > row.h) row.h = h;
    frames.push({ name: item.name, x, y, w, h });
    x += w + pad;
    sheetW = Math.max(sheetW, x);
    sheetH = Math.max(sheetH, y + h + pad);
  }
  const sheet = new PC(sheetW, sheetH);
  items.forEach((item, i) => {
    const f = frames[i];
    sheet.blit(item.pc, f.x, f.y);
  });
  return { key, pc: sheet, frames };
}
