/** Image-data passes and colour maths used across every generated texture. */

import { PC } from './PixelCanvas';

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Blend two hex colours, t in [0,1]. */
export function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}

/** Darken (amount < 0) or lighten (amount > 0) a colour. */
export function shade(hex: string, amount: number): string {
  return mix(hex, amount < 0 ? '#000000' : '#ffffff', Math.abs(amount));
}

/** Hue-preserving lightness shift: warms highlights, cools shadows. */
export function ramp(hex: string, step: number): string {
  const warm = '#ffe9b8';
  const cool = '#2b3a5e';
  return step >= 0 ? mix(hex, warm, step * 0.55) : mix(hex, cool, -step * 0.6);
}

/**
 * Add a silhouette outline around every opaque shape. This is the single biggest
 * trick for making generated pixel art read at small scale.
 */
export function outline(pc: PC, color: string, diagonals = false): PC {
  const { w, h } = pc;
  const img = pc.ctx.getImageData(0, 0, w, h);
  const src = new Uint8ClampedArray(img.data);
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= w || y >= h ? 0 : src[(y * w + x) * 4 + 3];
  const nbrs = diagonals
    ? [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]
    : [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const rgb = hexToRgb(color);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (at(x, y) > 8) continue;
      let near = 0;
      for (const [dx, dy] of nbrs) {
        const a = at(x + dx, y + dy);
        if (a > near) near = a;
      }
      if (near > 8) {
        const i = (y * w + x) * 4;
        img.data[i] = rgb[0];
        img.data[i + 1] = rgb[1];
        img.data[i + 2] = rgb[2];
        img.data[i + 3] = 255;
      }
    }
  }
  pc.ctx.putImageData(img, 0, 0);
  return pc;
}

/** Multiply existing opaque pixels toward a tint (ambient light, status auras). */
export function tint(pc: PC, color: string, amount: number): PC {
  const rgb = hexToRgb(color);
  const img = pc.ctx.getImageData(0, 0, pc.w, pc.h);
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] === 0) continue;
    img.data[i] = Math.round(img.data[i] * (1 - amount) + rgb[0] * amount);
    img.data[i + 1] = Math.round(img.data[i + 1] * (1 - amount) + rgb[1] * amount);
    img.data[i + 2] = Math.round(img.data[i + 2] * (1 - amount) + rgb[2] * amount);
  }
  pc.ctx.putImageData(img, 0, 0);
  return pc;
}

/** Replace every opaque pixel with a flat colour, preserving alpha (silhouettes). */
export function silhouette(pc: PC, color: string): PC {
  const rgb = hexToRgb(color);
  const img = pc.ctx.getImageData(0, 0, pc.w, pc.h);
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] === 0) continue;
    img.data[i] = rgb[0];
    img.data[i + 1] = rgb[1];
    img.data[i + 2] = rgb[2];
  }
  pc.ctx.putImageData(img, 0, 0);
  return pc;
}

/** Bounding box of opaque pixels. */
export function bounds(pc: PC): { x: number; y: number; w: number; h: number } | null {
  const img = pc.ctx.getImageData(0, 0, pc.w, pc.h);
  let minX = pc.w, minY = pc.h, maxX = -1, maxY = -1;
  for (let y = 0; y < pc.h; y++) {
    for (let x = 0; x < pc.w; x++) {
      if (img.data[(y * pc.w + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Crop to opaque bounds (padded), returning a new PC. */
export function crop(pc: PC, pad = 0): PC {
  const b = bounds(pc) ?? { x: 0, y: 0, w: pc.w, h: pc.h };
  const x = Math.max(0, b.x - pad), y = Math.max(0, b.y - pad);
  const w = Math.min(pc.w - x, b.w + pad * 2), h = Math.min(pc.h - y, b.h + pad * 2);
  const out = new PC(w, h);
  out.ctx.drawImage(pc.canvas, x, y, w, h, 0, 0, w, h);
  return out;
}

/** Scale by an integer factor with nearest-neighbour semantics. */
export function scaleInt(pc: PC, factor: number): PC {
  const out = new PC(pc.w * factor, pc.h * factor);
  out.ctx.imageSmoothingEnabled = false;
  out.ctx.drawImage(pc.canvas, 0, 0, pc.w * factor, pc.h * factor);
  return out;
}
