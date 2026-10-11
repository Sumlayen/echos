import { PC } from './PixelCanvas';
import { placed, type SpriteAtlas } from './TextureBuild';

/**
 * Hand-authored 5x7 pixel font, generated into a Phaser texture at boot.
 *
 * A fixed-width bitmap font is what keeps text crisp at every integer scale —
 * DOM/Canvas text at 8 px would blur or sub-pixel shift. Lowercase input is
 * folded to uppercase, exactly like classic SNES-era menus.
 */

const G = (s: string) => s.split('/');

/** Glyph bitmaps: 7 rows of 5 columns, 'X' = ink. */
export const GLYPHS: Record<string, string[]> = {
  ' ': G('...../...../...../...../...../...../.....'),
  '!': G('..X../..X../..X../..X../..X../...../..X..'),
  '"': G('.X.X./.X.X./...../...../...../...../.....'),
  '#': G('.X.X./.X.X./XXXXX/.X.X./XXXXX/.X.X./.X.X.'),
  '$': G('..X../.XXXX/X.X../.XXXX/..X.X/XXXX./..X..'),
  '%': G('XX.../XX..X/...X./..X../.X.../X..XX/...XX'),
  '&': G('.XX../X..X./X..X./.XX../X.X.X/X..X./.XX.X'),
  "'": G('..X../..X../...../...../...../...../.....'),
  '(': G('...X./..X../.X.../.X.../.X.../..X../...X.'),
  ')': G('.X.../..X../...X./...X./...X./..X../.X...'),
  '*': G('...../X.X.X/.XXX./XXXXX/.XXX./X.X.X/.....'),
  '+': G('...../..X../..X../XXXXX/..X../..X../.....'),
  ',': G('...../...../...../...../..X../..X../.X...'),
  '-': G('...../...../...../XXXXX/...../...../.....'),
  '.': G('...../...../...../...../..X../..X../.....'),
  '/': G('....X/....X/...X./..X../.X.../X..../X...'),
  '0': G('.XXX./X...X/X..XX/X.X.X/XX..X/X...X/.XXX.'),
  '1': G('..X../.XX../..X../..X../..X../..X../.XXX.'),
  '2': G('.XXX./X...X/....X/...X./..X../.X.../XXXXX'),
  '3': G('XXXX./....X/...X./..XX./....X/X...X/.XXX.'),
  '4': G('...X./..XX./.X.X./X..X./XXXXX/...X./...X.'),
  '5': G('XXXXX/X..../XXXX./....X/....X/X...X/.XXX.'),
  '6': G('..XX./.X.../X..../XXXX./X...X/X...X/.XXX.'),
  '7': G('XXXXX/....X/...X./..X../.X.../.X.../.X...'),
  '8': G('.XXX./X...X/X...X/.XXX./X...X/X...X/.XXX.'),
  '9': G('.XXX./X...X/X...X/.XXXX/....X/...X./..X..'),
  ':': G('...../..X../..X../...../..X../..X../.....'),
  ';': G('...../..X../..X../...../..X../..X../.X...'),
  '<': G('...X./..X../.X.../X..../.X.../..X../...X.'),
  '=': G('...../...../XXXXX/...../XXXXX/...../.....'),
  '>': G('.X.../..X../...X./....X/...X./..X../.X...'),
  '?': G('.XXX./X...X/....X/...X./..X../...../..X..'),
  '@': G('.XXX./X...X/X.XXX/X.X.X/X.XXX/X..../.XXX.'),
  A: G('.XXX./X...X/X...X/XXXXX/X...X/X...X/X...X'),
  B: G('XXXX./X...X/X...X/XXXX./X...X/X...X/XXXX.'),
  C: G('.XXX./X...X/X..../X..../X..../X...X/.XXX.'),
  D: G('XXX../X..X./X...X/X...X/X...X/X..X./XXX..'),
  E: G('XXXXX/X..../X..../XXXX./X..../X..../XXXXX'),
  F: G('XXXXX/X..../X..../XXXX./X..../X..../X....'),
  G: G('.XXX./X...X/X..../X.XXX/X...X/X...X/.XXXX'),
  H: G('X...X/X...X/X...X/XXXXX/X...X/X...X/X...X'),
  I: G('.XXX./..X../..X../..X../..X../..X../.XXX.'),
  J: G('..XXX/...X./...X./...X./...X./X..X./.XX..'),
  K: G('X...X/X..X./X.X../XX.../X.X../X..X./X...X'),
  L: G('X..../X..../X..../X..../X..../X..../XXXXX'),
  M: G('X...X/XX.XX/X.X.X/X.X.X/X...X/X...X/X...X'),
  N: G('X...X/XX..X/X.X.X/X..XX/X...X/X...X/X...X'),
  O: G('.XXX./X...X/X...X/X...X/X...X/X...X/.XXX.'),
  P: G('XXXX./X...X/X...X/XXXX./X..../X..../X....'),
  Q: G('.XXX./X...X/X...X/X...X/X.X.X/X..X./.XX.X'),
  R: G('XXXX./X...X/X...X/XXXX./X.X../X..X./X...X'),
  S: G('.XXXX/X..../X..../.XXX./....X/....X/XXXX.'),
  T: G('XXXXX/..X../..X../..X../..X../..X../..X..'),
  U: G('X...X/X...X/X...X/X...X/X...X/X...X/.XXX.'),
  V: G('X...X/X...X/X...X/X...X/X...X/.X.X./..X..'),
  W: G('X...X/X...X/X...X/X.X.X/X.X.X/XX.XX/X...X'),
  X: G('X...X/X...X/.X.X./..X../.X.X./X...X/X...X'),
  Y: G('X...X/X...X/.X.X./..X../..X../..X../..X..'),
  Z: G('XXXXX/....X/...X./..X../.X.../X..../XXXXX'),
  '[': G('..XXX/..X../..X../..X../..X../..X../..XXX'),
  '\\': G('X..../X..../.X.../..X../...X./....X/....X'),
  ']': G('XXX../..X../..X../..X../..X../..X../XXX..'),
  '^': G('..X../.X.X./X...X/...../...../...../.....'),
  _: G('...../...../...../...../...../...../XXXXX')
};

/** Extra glyphs, addressed by name rather than by character. */
export const SYMBOLS: Record<string, string[]> = {
  heart: G('...../.X.X./XXXXX/XXXXX/.XXX./..X../.....'),
  star: G('..X../.XXX./XXXXX/.XXX./.X.X./X...X/.....'),
  arrow: G('...../..X../...X./XXXXX/...X./..X../.....'),
  check: G('...../X...X/X...X/X..X./.X.X./..X../.....'),
  bullet: G('...../...../..X../.XXX./..X../...../.....'),
  cross: G('...../X...X/.X.X./..X../.X.X./X...X/.....'),
  coin: G('.XXX./X.XXX/X.X.X/XXX.X/.XXX./...../.....'),
  sword: G('....X/...X./..X../.X.../X..../.XX../..X..'),
  shield: G('.XXX./X...X/X...X/X...X/X...X/.X.X./..X..'),
  drop: G('..X../..X../.X.X./X...X/X...X/.XXX./.....')
};


/** Printable characters in atlas order. Lowercase folds to uppercase. */
export const FONT_CHARS =
  ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_';

/** Named symbols appended after the printable range. */
export const SYMBOL_NAMES = [
  'heart', 'star', 'arrow', 'check', 'cross', 'coin', 'sword', 'shield', 'drop', 'bullet'
] as const;

export const CELL_W = 6;
export const CELL_H = 8;
export const COLS = 16;

const frameIndex = new Map<string, number>();
const symbolIndex = new Map<string, number>();

function buildIndex(): void {
  if (frameIndex.size) return;
  for (let i = 0; i < FONT_CHARS.length; i++) frameIndex.set(FONT_CHARS[i], i);
  const base = FONT_CHARS.length;
  SYMBOL_NAMES.forEach((name, i) => symbolIndex.set(name, base + i));
}

export const FONT_TEXTURE = 'font5x7';

export function frameForChar(ch: string): string {
  buildIndex();
  const up = ch.toUpperCase();
  const idx = frameIndex.get(up) ?? frameIndex.get(' ')!;
  return `f${idx}`;
}

export function frameForSymbol(name: string): string {
  buildIndex();
  const idx = symbolIndex.get(name);
  return idx === undefined ? frameForChar('?') : `f${idx}`;
}

/**
 * Render the whole font into one atlas: white glyphs on transparent so the
 * runtime can `setTint()` any colour while staying perfectly crisp.
 */
export function buildFontAtlas(): SpriteAtlas {
  buildIndex();
  const total = FONT_CHARS.length + SYMBOL_NAMES.length;
  const rows = Math.ceil(total / COLS);
  const pc = new PC(COLS * CELL_W, rows * CELL_H);
  const frames: { name: string; x: number; y: number; w: number; h: number }[] = [];

  const put = (idx: number, bitmap: string[]) => {
    const cx = (idx % COLS) * CELL_W;
    const cy = Math.floor(idx / COLS) * CELL_H;
    for (let y = 0; y < 7; y++) {
      const row = bitmap[y] ?? '.....';
      for (let x = 0; x < 5; x++) {
        if (row[x] === 'X') pc.p(cx + x, cy + y, '#ffffff');
      }
    }
    frames.push({ name: `f${idx}`, x: cx, y: cy, w: CELL_W, h: CELL_H });
  };

  for (let i = 0; i < FONT_CHARS.length; i++) {
    put(i, GLYPHS[FONT_CHARS[i]] ?? GLYPHS[' ']);
  }
  SYMBOL_NAMES.forEach((name, i) => put(FONT_CHARS.length + i, SYMBOLS[name]));

  return placed(FONT_TEXTURE, pc, frames);
}
