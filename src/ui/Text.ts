/**
 * Bitmap text. Strings are rasterised into cached textures using the
 * hand-authored 5x7 font, then drawn as a single tinted image — crisp at every
 * integer scale, and one draw call per label.
 *
 * `{name}` tokens in a string insert a named symbol glyph from `FontArt`.
 */

import Phaser from 'phaser';
import { CELL_H, CELL_W, GLYPHS, SYMBOLS } from '../art/FontArt';
import { PC } from '../art/PixelCanvas';

export const CHAR_W = CELL_W;
export const CHAR_H = CELL_H;

type Piece = { rows: string[] } | { nl: true };

function pieces(text: string): Piece[] {
  const out: Piece[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\n') {
      out.push({ nl: true });
      continue;
    }
    if (ch === '{') {
      const close = text.indexOf('}', i);
      if (close > i) {
        const sym = SYMBOLS[text.slice(i + 1, close)];
        if (sym) {
          out.push({ rows: sym });
          i = close;
          continue;
        }
      }
    }
    out.push({ rows: GLYPHS[ch.toUpperCase()] ?? GLYPHS[' '] });
  }
  return out;
}

export interface TextMetrics {
  w: number;
  h: number;
  /** Cells drawn (symbols count as one), used for typewriter reveal. */
  cells: number;
  lines: number;
}

export function measure(text: string): TextMetrics {
  let line = 0, best = 0, lines = 1, cells = 0;
  for (const p of pieces(text)) {
    if ('nl' in p) {
      best = Math.max(best, line);
      line = 0;
      lines++;
      continue;
    }
    line++;
    cells++;
  }
  best = Math.max(best, line);
  return { w: best * CHAR_W, h: lines * CHAR_H, cells, lines };
}

/** Word wrap to a pixel width; long words are hard-broken. */
export function wrap(text: string, maxWidth: number): string[] {
  const perLine = Math.max(4, Math.floor(maxWidth / CHAR_W));
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      if (!word) continue;
      if (word.length > perLine) {
        if (line) out.push(line);
        for (let i = 0; i < word.length; i += perLine) out.push(word.slice(i, i + perLine));
        line = '';
        continue;
      }
      const next = line ? `${line} ${word}` : word;
      if (next.length > perLine) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

const cache = new Map<string, string>();
let uid = 0;

/** Rasterise `text` (white ink) into a cached texture. */
export function textTexture(scene: Phaser.Scene, text: string): { key: string; m: TextMetrics } {
  const m = measure(text);
  const hit = cache.get(text);
  if (hit && scene.textures.exists(hit)) return { key: hit, m };

  const key = `txt_${uid++}`;
  const pc = new PC(Math.max(1, m.w), Math.max(1, m.h));
  let x = 0, y = 0;
  for (const p of pieces(text)) {
    if ('nl' in p) {
      x = 0;
      y += CHAR_H;
      continue;
    }
    for (let row = 0; row < 7; row++) {
      const bits = p.rows[row] ?? '.....';
      for (let col = 0; col < 5; col++) {
        if (bits[col] === 'X') pc.p(x + col, y + row, '#ffffff');
      }
    }
    x += CHAR_W;
  }
  if (scene.textures.exists(key)) scene.textures.remove(key);
  scene.textures.addCanvas(key, pc.canvas);
  cache.set(text, key);
  return { key, m };
}

export interface LabelOptions {
  color?: number;
  scale?: number;
  align?: 'left' | 'center' | 'right';
  originY?: number;
}

/** A tinted bitmap-text label with typewriter reveal support. */
export class Label extends Phaser.GameObjects.Image {
  private m: TextMetrics;
  private revealed = Infinity;

  constructor(scene: Phaser.Scene, x: number, y: number, text: string, opts: LabelOptions = {}) {
    const built = textTexture(scene, text);
    super(scene, x, y, built.key);
    this.m = built.m;
    const ax = opts.align === 'center' ? 0.5 : opts.align === 'right' ? 1 : 0;
    this.setOrigin(ax, opts.originY ?? 0);
    this.setScale(opts.scale ?? 1);
    this.setTint(opts.color ?? 0xffffff);
    scene.add.existing(this);
  }

  get metrics(): TextMetrics {
    return this.m;
  }

  /** Pixel width at the current scale. */
  get labelWidth(): number {
    return this.m.w * this.scaleX;
  }

  /** The string this label was built from (textures are cached by content). */
  readable = '';

  setText(text: string): this {
    const built = textTexture(this.scene, text);
    this.m = built.m;
    this.setTexture(built.key);
    this.readable = text;
    this.applyReveal();
    return this;
  }

  setColor(color: number): this {
    this.setTint(color);
    return this;
  }

  setScaleValue(s: number): this {
    this.setScale(s);
    return this;
  }

  /** Show the first `n` cells; everything past the crop is hidden. */
  setReveal(n: number): this {
    this.revealed = n;
    this.applyReveal();
    return this;
  }

  revealAll(): this {
    this.revealed = Infinity;
    this.applyReveal();
    return this;
  }

  private applyReveal(): void {
    if (!isFinite(this.revealed)) {
      this.setCrop(0, 0, this.m.w, this.m.h);
      return;
    }
    const w = Math.max(0, Math.min(this.m.w, this.revealed * CHAR_W));
    this.setCrop(0, 0, w, this.m.h);
  }
}

export function makeLabel(
  scene: Phaser.Scene,
  text: string,
  x: number,
  y: number,
  opts: LabelOptions = {}
): Label {
  const l = new Label(scene, x, y, text, opts);
  l.readable = text;
  return l;
}

/** Multi-column label helper: draws a list of rows in one call. */
export function makeRows(
  scene: Phaser.Scene,
  rows: { text: string; x: number; color?: number; align?: 'left' | 'center' | 'right' }[],
  y: number,
  lineH = 10,
  scale = 1
): Label[] {
  return rows.map((r, i) =>
    makeLabel(scene, r.text, r.x, y + i * lineH, { color: r.color, scale, align: r.align })
  );
}