/**
 * Tiny pixel-drawing surface. Every visual in the game is generated into one of
 * these at boot, then handed to Phaser as a texture. All drawing is integer
 * aligned with smoothing disabled, so the result is authentic pixel art.
 *
 * Image-data operations (outline / tint / bounds) live in `PixelOps.ts`.
 */

export type DrawColor = string | null | undefined;

export class PC {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  private color = '#000000';

  constructor(public readonly w: number, public readonly h: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
    this.ctx.imageSmoothingEnabled = false;
  }

  set(c: string): this {
    this.color = c;
    return this;
  }

  /** Single pixel. */
  p(x: number, y: number, c?: DrawColor): this {
    if (c === null) return this;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this;
    this.ctx.fillStyle = c ?? this.color;
    this.ctx.fillRect(x | 0, y | 0, 1, 1);
    return this;
  }

  rect(x: number, y: number, w: number, h: number, c?: DrawColor): this {
    if (w <= 0 || h <= 0 || c === null) return this;
    this.ctx.fillStyle = c ?? this.color;
    this.ctx.fillRect(x | 0, y | 0, w | 0, h | 0);
    return this;
  }

  /** Hollow rectangle (1px). */
  frame(x: number, y: number, w: number, h: number, c?: DrawColor): this {
    const col = c ?? this.color;
    this.rect(x, y, w, 1, col);
    this.rect(x, y + h - 1, w, 1, col);
    this.rect(x, y, 1, h, col);
    this.rect(x + w - 1, y, 1, h, col);
    return this;
  }

  hline(x: number, y: number, w: number, c?: DrawColor): this {
    return this.rect(x, y, w, 1, c);
  }

  vline(x: number, y: number, h: number, c?: DrawColor): this {
    return this.rect(x, y, 1, h, c);
  }

  line(x0: number, y0: number, x1: number, y1: number, c?: DrawColor): this {
    const col = c ?? this.color;
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let guard = 0; guard < 4096; guard++) {
      this.p(x0, y0, col);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return this;
  }

  /** Filled axis-aligned ellipse (pixel-plotted, no anti-aliasing). */
  disc(cx: number, cy: number, rx: number, ry: number = rx, c?: DrawColor): this {
    const col = c ?? this.color;
    const irx = Math.max(0, rx), iry = Math.max(0, ry);
    for (let y = -iry; y <= iry; y++) {
      for (let x = -irx; x <= irx; x++) {
        const nx = (x + 0.5) / (irx + 0.5);
        const ny = (y + 0.5) / (iry + 0.5);
        if (nx * nx + ny * ny <= 1) this.p(cx + x, cy + y, col);
      }
    }
    return this;
  }

  /** Hollow ellipse. */
  ring(cx: number, cy: number, rx: number, ry: number = rx, c?: DrawColor): this {
    const col = c ?? this.color;
    for (let y = -ry; y <= ry; y++) {
      for (let x = -rx; x <= rx; x++) {
        const o = ((x + 0.5) / (rx + 0.5)) ** 2 + ((y + 0.5) / (ry + 0.5)) ** 2;
        const i = ((x - 0.5) / (rx + 0.5)) ** 2 + ((y - 0.5) / (ry + 0.5)) ** 2;
        if (o <= 1 && i > 0.35) this.p(cx + x, cy + y, col);
      }
    }
    return this;
  }

  tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c?: DrawColor): this {
    const col = c ?? this.color;
    const minX = Math.min(x0, x1, x2), maxX = Math.max(x0, x1, x2);
    const minY = Math.min(y0, y1, y2), maxY = Math.max(y0, y1, y2);
    const edge = (ax: number, ay: number, bx: number, by: number, px: number, py: number) =>
      (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5, py = y + 0.5;
        const d1 = edge(x0, y0, x1, y1, px, py);
        const d2 = edge(x1, y1, x2, y2, px, py);
        const d3 = edge(x2, y2, x0, y0, px, py);
        const neg = d1 < 0 || d2 < 0 || d3 < 0;
        const pos = d1 > 0 || d2 > 0 || d3 > 0;
        if (!(neg && pos)) this.p(x, y, col);
      }
    }
    return this;
  }

  /** Checkerboard fill — used only on broad gradients (sky, water, lava glow). */
  dither(x: number, y: number, w: number, h: number, c: string, phase = 0): this {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        if (((i + j + phase) & 1) === 0) this.p(x + i, y + j, c);
      }
    }
    return this;
  }

  /** Deterministic hash noise in [0,1). */
  static hash(x: number, y: number, seed = 0): number {
    let h = (x * 374761393 + y * 668265263 + Math.imul(seed, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967296;
  }

  /** Sprinkle pixels over a region using hash noise. */
  speckle(x: number, y: number, w: number, h: number, c: string, density: number, seed = 0): this {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        if (PC.hash(x + i, y + j, seed) < density) this.p(x + i, y + j, c);
      }
    }
    return this;
  }

  /** Multiply the alpha of every painted pixel — used for death/fade frames. */
  fadeAlpha(factor: number): this {
    const img = this.ctx.getImageData(0, 0, this.w, this.h);
    for (let i = 3; i < img.data.length; i += 4) {
      img.data[i] = Math.round(img.data[i] * factor);
    }
    this.ctx.putImageData(img, 0, 0);
    return this;
  }

  /** Horizontal mirror into a new PC (used for left/right facing). */
  mirrorX(): PC {
    const out = new PC(this.w, this.h);
    out.ctx.translate(this.w, 0);
    out.ctx.scale(-1, 1);
    out.ctx.imageSmoothingEnabled = false;
    out.ctx.drawImage(this.canvas, 0, 0);
    return out;
  }

  /** Shift every pixel by an integer offset into a new PC. */
  offset(dx: number, dy: number): PC {
    const out = new PC(this.w, this.h);
    out.ctx.drawImage(this.canvas, dx, dy);
    return out;
  }

  blit(other: PC, x: number, y: number): this {
    this.ctx.drawImage(other.canvas, x | 0, y | 0);
    return this;
  }

  /** Blits a sub-rectangle of another canvas (used to bake tile maps). */
  blitRect(other: PC, sx: number, sy: number, sw: number, sh: number, x: number, y: number): this {
    this.ctx.drawImage(other.canvas, sx | 0, sy | 0, sw | 0, sh | 0, x | 0, y | 0, sw | 0, sh | 0);
    return this;
  }

  /**
   * Draw a row-matrix sprite. Each character maps through `pal`; unmapped
   * characters (typically '.' and ' ') are transparent.
   */
  rows(rows: string[], pal: Record<string, string>, ox = 0, oy = 0): this {
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) {
        const c = pal[row[x]];
        if (!c) continue;
        this.p(ox + x, oy + y, c);
      }
    }
    return this;
  }
}
